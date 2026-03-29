import json
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models import Session, Trial, Event
from backend.engine.lse_engine import LSESystem
from backend.engine.system_loader import load_system_for_level, get_system_config_for_frontend
from backend.engine.scoring import compute_ska, compute_ca, compute_ee, compute_aui, compute_composite, is_votat
from backend.routers.session import get_staircase, set_staircase
from backend.engine.staircase import AdaptiveStaircase

router = APIRouter(prefix="/api/trial", tags=["trial"])

_APP_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "app_config.json")
_STAIRCASE_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "staircase_config.json")

def _load_app_config() -> dict:
    with open(_APP_CONFIG_PATH) as f:
        return json.load(f)

def _load_staircase_config() -> dict:
    with open(_STAIRCASE_CONFIG_PATH) as f:
        return json.load(f)

# In-memory trial state: {trial_id: {...}}
_trial_states: dict[str, dict] = {}

class StartTrialRequest(BaseModel):
    session_id: str
    trial_number: int

class InterveneRequest(BaseModel):
    trial_id: str
    phase: str
    exogenous_inputs: dict[str, float]

class SubmitMetacogRequest(BaseModel):
    trial_id: str
    inferred_structure: dict
    confidence: int
    strategy_text: str = ""

class CompletTrialRequest(BaseModel):
    trial_id: str

@router.post("/start")
async def start_trial(request: StartTrialRequest, db: AsyncSession = Depends(get_db)):
    app_config = _load_app_config()
    staircase_config = _load_staircase_config()

    # Get session
    result = await db.execute(select(Session).where(Session.id == request.session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Determine phase and level
    calibration_trials = staircase_config.get("calibration_trials", 2)
    is_calibration = request.trial_number <= calibration_trials
    phase_type = "calibration" if is_calibration else "adaptive"

    staircase = get_staircase(request.session_id)
    if not staircase:
        staircase = AdaptiveStaircase(staircase_config)
        set_staircase(request.session_id, staircase)

    if is_calibration:
        level = staircase_config.get("initial_level", 3)
    else:
        level = staircase.get_current_level()

    system = load_system_for_level(level)

    # Create trial record
    trial = Trial(
        id=str(uuid.uuid4()),
        session_id=request.session_id,
        trial_number=request.trial_number,
        system_id=system.system_id,
        difficulty_level=level,
        phase=phase_type,
    )
    db.add(trial)
    await db.commit()

    # Initialize trial state
    initial_state = system.get_initial_state()
    initial_exo = {label: 0.0 for label in system.exogenous_labels}

    # Check if mid-trial target shift is enabled for this level
    mid_shift_config = app_config.get("mid_trial_target_shift", {})
    mid_shift_enabled = mid_shift_config.get("enabled_from_level", 8) <= level

    # Generate target state for control phase
    target_state = _generate_target_state(system)

    _trial_states[trial.id] = {
        "system": system,
        "current_state": initial_state,
        "current_exo": initial_exo,
        "exploration_step": 0,
        "control_step": 0,
        "phase": "exploration",
        "target_state": target_state,
        "original_target_state": target_state.copy(),
        "mid_shift_enabled": mid_shift_enabled,
        "mid_shift_step": mid_shift_config.get("shift_at_step", 10),
        "mid_shift_fraction": mid_shift_config.get("shift_magnitude_fraction", 0.3),
        "mid_shift_done": False,
        "pre_shift_events": [],
        "post_shift_events": [],
        "exploration_events": [],
        "control_events": [],
        "pre_shift_target": target_state.copy(),
        "session_id": request.session_id,
        "level": level,
    }

    system_config = get_system_config_for_frontend(system)
    system_config["target_state"] = None  # not shown during exploration

    return {
        "trial_id": trial.id,
        "system_config": system_config,
        "phase_timings": app_config.get("phase_timings", {}),
        "trial_number": request.trial_number,
        "difficulty_level": level,
        "phase_type": phase_type,
    }

def _generate_target_state(system: LSESystem) -> dict[str, float]:
    """
    Generate a guaranteed-reachable target state using forward sampling.

    Method: sample a random exogenous input vector X within a conservative
    sub-range of the slider bounds, compute the noiseless steady-state
    endogenous output Y* = (I - C - E)^-1 * W * X, clamp to variable bounds,
    and return Y* as the target.  Reachability is guaranteed by construction
    because the X that generated Y* is within the actual slider limits.

    Conservative x_range = 4.0 (< slider max 5.0) keeps Y* away from
    variable bound edges after the forward mapping.
    """
    import numpy as np

    exo_labels = system.exogenous_labels
    endo_labels = system.endogenous_labels
    n_exo = len(exo_labels)
    n_endo = len(endo_labels)

    # Build W (n_endo × n_exo) — exogenous → endogenous direct weights
    W = np.zeros((n_endo, n_exo))
    for conn, w in system.weight_matrix.items():
        if "->" in conn:
            src, dst = conn.split("->")
            if src in exo_labels and dst in endo_labels:
                W[endo_labels.index(dst), exo_labels.index(src)] = w

    # Build C (n_endo × n_endo) — endogenous cross-weights
    C = np.zeros((n_endo, n_endo))
    for conn, w in system.cross_weights.items():
        if "->" in conn:
            src, dst = conn.split("->")
            if src in endo_labels and dst in endo_labels:
                C[endo_labels.index(dst), endo_labels.index(src)] = w

    # Build E (diagonal n_endo × n_endo) — eigendynamic coefficients
    E = np.zeros((n_endo, n_endo))
    for label, coef in system.eigendynamic_coefficients.items():
        if label in endo_labels:
            E[endo_labels.index(label), endo_labels.index(label)] = coef

    # Steady-state constraint: (I - C - E) * Y* = W * X
    M = np.eye(n_endo) - C - E

    # Sample X within conservative bounds (4.0 < slider limit 5.0)
    X = np.random.uniform(-4.0, 4.0, size=n_exo)

    # Compute noiseless steady-state Y* = M^-1 * W * X
    try:
        Y_star = np.linalg.solve(M, W @ X)
    except np.linalg.LinAlgError:
        Y_star = np.linalg.lstsq(M, W @ X, rcond=None)[0]

    # Clamp to variable bounds and round to 1 decimal place
    target: dict[str, float] = {}
    for i, label in enumerate(endo_labels):
        bounds = system.variable_bounds.get(label, {"min": -50, "max": 50})
        clamped = float(np.clip(Y_star[i], bounds["min"], bounds["max"]))
        target[label] = round(clamped, 1)

    return target

@router.post("/intervene")
async def intervene(request: InterveneRequest, db: AsyncSession = Depends(get_db)):
    state = _trial_states.get(request.trial_id)
    if not state:
        raise HTTPException(status_code=404, detail="Trial not found or not active")

    system: LSESystem = state["system"]
    phase = request.phase

    # Clamp exogenous inputs to bounds
    clamped_inputs = {}
    for label in system.exogenous_labels:
        val = request.exogenous_inputs.get(label, 0.0)
        bounds = system.variable_bounds.get(label, {"min": -5, "max": 5})
        clamped_inputs[label] = float(max(bounds["min"], min(bounds["max"], val)))

    # Step the system
    new_state = system.step(clamped_inputs, state["current_state"])

    # Determine step number
    if phase == "exploration":
        step_num = state["exploration_step"] + 1
        state["exploration_step"] = step_num
    else:
        step_num = state["control_step"] + 1
        state["control_step"] = step_num

    # Detect VOTAT
    votat = is_votat(clamped_inputs, state["current_exo"], system.exogenous_labels)

    # Check for mid-trial target shift
    current_target = state["target_state"]
    if phase == "control" and state["mid_shift_enabled"] and not state["mid_shift_done"]:
        if step_num == state["mid_shift_step"]:
            # Apply shift
            new_target = _shift_target(state["original_target_state"], system, state["mid_shift_fraction"])
            state["pre_shift_target"] = state["target_state"].copy()
            state["target_state"] = new_target
            state["mid_shift_done"] = True
            current_target = new_target

    # Build event record
    event_data = {
        "trial_id": request.trial_id,
        "phase": phase,
        "step_number": step_num,
        "event_type": "intervention",
        "exogenous_inputs": clamped_inputs,
        "system_state": new_state,
        "target_state": current_target if phase == "control" else None,
        "is_votat": votat,
    }

    # Store event in memory and DB
    if phase == "exploration":
        state["exploration_events"].append(event_data)
    else:
        state["control_events"].append(event_data)
        if state["mid_shift_enabled"]:
            if not state["mid_shift_done"] or step_num < state["mid_shift_step"]:
                state["pre_shift_events"].append(event_data)
            else:
                state["post_shift_events"].append(event_data)

    db_event = Event(**event_data)
    db.add(db_event)
    await db.commit()

    # Update state
    state["current_state"] = new_state
    state["current_exo"] = clamped_inputs

    display_state = system.get_display_state(new_state)

    return {
        "new_system_state": new_state,
        "display_state": display_state,
        "step_number": step_num,
        "is_votat": votat,
        "target_state": current_target if phase == "control" else None,
        "target_shifted": state["mid_shift_done"] and phase == "control",
    }

def _shift_target(original_target: dict, system: LSESystem, fraction: float) -> dict:
    """Shift target state by a fraction of the range."""
    import random
    new_target = {}
    for label, orig_val in original_target.items():
        bounds = system.variable_bounds.get(label, {"min": -50, "max": 50})
        shift_amount = fraction * (bounds["max"] - bounds["min"])
        direction = random.choice([-1, 1])
        new_val = orig_val + direction * shift_amount
        new_target[label] = float(max(bounds["min"], min(bounds["max"], new_val)))
    return new_target

@router.post("/submit_metacog")
async def submit_metacog(request: SubmitMetacogRequest, db: AsyncSession = Depends(get_db)):
    state = _trial_states.get(request.trial_id)
    if not state:
        raise HTTPException(status_code=404, detail="Trial not found")

    system: LSESystem = state["system"]
    true_structure = system.get_true_structure()

    # Compute SKA
    ska = compute_ska(
        request.inferred_structure,
        true_structure,
        system.exogenous_labels,
        system.endogenous_labels,
    )

    # Calibration score: |confidence/100 - ska|, inverted (lower delta = better calibration)
    confidence_normalized = request.confidence / 100.0
    calibration_score = 1.0 - abs(confidence_normalized - ska)

    # Update trial in DB
    result = await db.execute(select(Trial).where(Trial.id == request.trial_id))
    trial = result.scalar_one_or_none()
    if trial:
        trial.metacog_confidence = request.confidence
        trial.metacog_inferred_structure = request.inferred_structure
        trial.metacog_calibration_score = calibration_score
        trial.metacog_strategy_text = request.strategy_text[:500]
        trial.score_ska = ska
        await db.commit()

    # Store in memory state for later scoring
    state["ska"] = ska
    state["metacog_confidence"] = request.confidence
    state["metacog_inferred_structure"] = request.inferred_structure
    state["metacog_strategy_text"] = request.strategy_text

    # Prepare control phase config
    control_config = get_system_config_for_frontend(system)
    control_config["target_state"] = state["target_state"]

    return {
        "ska_score": round(ska, 4),
        "calibration_score": round(calibration_score, 4),
        "control_phase_config": control_config,
    }

@router.post("/complete")
async def complete_trial(request: CompletTrialRequest, db: AsyncSession = Depends(get_db)):
    app_config = _load_app_config()
    staircase_config = _load_staircase_config()

    state = _trial_states.get(request.trial_id)
    if not state:
        raise HTTPException(status_code=404, detail="Trial not found")

    system: LSESystem = state["system"]

    # Compute CA
    ca = compute_ca(
        state["control_events"],
        state["target_state"],
        system.variable_bounds,
    )

    # Compute EE
    ee = compute_ee(state["exploration_events"], system.exogenous_labels)

    # Compute AUI (only for levels >= 8)
    level = state["level"]
    if level >= 8 and state["pre_shift_events"] and state["post_shift_events"]:
        aui = compute_aui(
            state["pre_shift_events"],
            state["post_shift_events"],
            state["target_state"],
            state["pre_shift_target"],
            system.variable_bounds,
        )
    else:
        aui = 0.5  # neutral default

    ska = state.get("ska", 0.0)

    scoring_weights = app_config.get("scoring_weights", {})
    composite = compute_composite(ska, ca, ee, aui, scoring_weights)

    # Update trial in DB
    result = await db.execute(select(Trial).where(Trial.id == request.trial_id))
    trial = result.scalar_one_or_none()
    if trial:
        trial.score_ska = ska
        trial.score_ca = ca
        trial.score_ee = ee
        trial.score_aui = aui
        trial.score_composite = composite
        trial.completed_at = datetime.now(timezone.utc)
        await db.commit()

    # Update staircase
    session_id = state["session_id"]
    staircase = get_staircase(session_id)
    if not staircase:
        staircase = AdaptiveStaircase(staircase_config)
        set_staircase(session_id, staircase)

    next_level = staircase.update({
        "composite_score": composite,
        "difficulty_level": level,
    })
    ability_estimate = staircase.get_ability_estimate()

    # Update session
    sess_result = await db.execute(select(Session).where(Session.id == session_id))
    session = sess_result.scalar_one_or_none()
    if session:
        session.n_trials_completed = (session.n_trials_completed or 0) + 1
        # Compute running average apex ability score
        if session.apex_ability_score is None:
            session.apex_ability_score = composite
        else:
            n = session.n_trials_completed
            session.apex_ability_score = (session.apex_ability_score * (n - 1) + composite) / n
        session.staircase_final_level = ability_estimate["estimated_level"]

        max_trials = staircase_config.get("max_trials_per_session", 8)
        if session.n_trials_completed >= max_trials:
            session.status = "completed"
            session.completed_at = datetime.now(timezone.utc)
        await db.commit()

    # Clean up memory
    del _trial_states[request.trial_id]

    return {
        "trial_scores": {
            "ska": round(ska, 4),
            "ca": round(ca, 4),
            "ee": round(ee, 4),
            "aui": round(aui, 4),
            "composite": round(composite, 4),
        },
        "next_trial_level": next_level,
        "session_ability_estimate": ability_estimate,
        "session_complete": session.status == "completed" if session else False,
    }
