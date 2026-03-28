import csv
import io
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from backend.database import get_db
from backend.models import Session, Trial, Event

router = APIRouter(prefix="/api/scoring", tags=["scoring"])

@router.get("/session/{session_id}")
async def get_session_scoring(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trial_result = await db.execute(select(Trial).where(Trial.session_id == session_id))
    trials = trial_result.scalars().all()

    trial_data = []
    for t in trials:
        trial_data.append({
            "trial_id": t.id,
            "trial_number": t.trial_number,
            "system_id": t.system_id,
            "difficulty_level": t.difficulty_level,
            "phase_type": t.phase,
            "score_ska": t.score_ska,
            "score_ca": t.score_ca,
            "score_ee": t.score_ee,
            "score_aui": t.score_aui,
            "score_composite": t.score_composite,
            "metacog_confidence": t.metacog_confidence,
            "metacog_calibration_score": t.metacog_calibration_score,
            "metacog_strategy_text": t.metacog_strategy_text,
            "started_at": t.started_at.isoformat() if t.started_at else None,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        })

    return {
        "session_id": session_id,
        "participant_id": session.participant_id,
        "status": session.status,
        "apex_ability_score": session.apex_ability_score,
        "staircase_final_level": session.staircase_final_level,
        "n_trials_completed": session.n_trials_completed,
        "trials": trial_data,
    }

@router.get("/session/{session_id}/full")
async def get_session_full(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trial_result = await db.execute(
        select(Trial).where(Trial.session_id == session_id).order_by(Trial.trial_number)
    )
    trials = trial_result.scalars().all()

    def safe_mean(vals):
        valid = [v for v in vals if v is not None]
        return sum(valid) / len(valid) if valid else None

    # Compute VOTAT rate per trial from events
    trial_data = []
    for t in trials:
        event_result = await db.execute(
            select(Event).where(
                and_(Event.trial_id == t.id, Event.phase == "exploration")
            )
        )
        events = event_result.scalars().all()
        votat_rate = None
        if events:
            votat_count = sum(1 for e in events if e.is_votat)
            votat_rate = round(votat_count / len(events), 4)

        trial_data.append({
            "trial_number": t.trial_number,
            "difficulty_level": t.difficulty_level,
            "phase": t.phase if t.phase else ("calibration" if (t.trial_number or 0) <= 2 else "adaptive"),
            "ska_score": t.score_ska,
            "ca_score": t.score_ca,
            "ee_score": t.score_ee,
            "aui_score": t.score_aui,
            "composite_score": t.score_composite,
            "mcs_score": t.metacog_calibration_score,
            "votat_rate": votat_rate,
            "ability_estimate": None,
            "ci_lower": None,
            "ci_upper": None,
        })

    completed = [t for t in trials if t.score_composite is not None]
    n = len(completed)

    means = {
        "ska": safe_mean([t.score_ska for t in completed]),
        "ca": safe_mean([t.score_ca for t in completed]),
        "ee": safe_mean([t.score_ee for t in completed]),
        "aui": safe_mean([t.score_aui for t in completed if t.score_aui is not None]),
        "mcs": safe_mean([t.metacog_calibration_score for t in completed if t.metacog_calibration_score is not None]),
    }

    # Approximate 95% CI based on ability score and trial count
    final_ability = session.staircase_final_level
    ability_ci_lower = None
    ability_ci_upper = None
    if final_ability is not None and n > 0:
        se = 3.0 / (n ** 0.5)
        ability_ci_lower = round(max(1.0, final_ability - 1.96 * se), 2)
        ability_ci_upper = round(min(15.0, final_ability + 1.96 * se), 2)

    # Clinical flags
    flags = []
    adaptive_composites = [
        t.score_composite for t in trials
        if (t.trial_number or 0) >= 3 and t.score_composite is not None
    ]
    if adaptive_composites and safe_mean(adaptive_composites) is not None:
        if safe_mean(adaptive_composites) < 0.40:
            flags.append("Performance in deficit range")
    if means["ee"] is not None and means["ee"] < 0.25:
        flags.append("Severely unsystematic exploration — possible executive function impairment")
    if means["mcs"] is not None and means["mcs"] < 0.35:
        flags.append("Severe metacognitive miscalibration")
    if session.status == "terminated_early":
        flags.append("Assessment incomplete — interpret with caution")

    return {
        "session_id": session_id,
        "patient_id": session.participant_id,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "status": session.status,
        "trials_completed": session.n_trials_completed or 0,
        "final_ability_score": final_ability,
        "ability_ci_lower": ability_ci_lower,
        "ability_ci_upper": ability_ci_upper,
        "trials": trial_data,
        "means": means,
        "clinical_flags": flags,
    }


@router.get("/export/{session_id}")
async def export_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    trial_result = await db.execute(select(Trial).where(Trial.session_id == session_id))
    trials = {t.id: t for t in trial_result.scalars().all()}

    event_result = await db.execute(
        select(Event).where(Event.trial_id.in_(list(trials.keys())))
    )
    events = event_result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "session_id", "participant_id", "trial_id", "trial_number",
        "system_id", "difficulty_level", "phase_type",
        "score_ska", "score_ca", "score_ee", "score_aui", "score_composite",
        "metacog_confidence", "metacog_calibration_score",
        "event_id", "event_timestamp", "event_phase", "step_number",
        "event_type", "exogenous_inputs", "system_state", "target_state", "is_votat",
    ])

    for event in events:
        trial = trials.get(event.trial_id)
        if not trial:
            continue
        writer.writerow([
            session_id, session.participant_id, event.trial_id, trial.trial_number,
            trial.system_id, trial.difficulty_level, trial.phase,
            trial.score_ska, trial.score_ca, trial.score_ee, trial.score_aui, trial.score_composite,
            trial.metacog_confidence, trial.metacog_calibration_score,
            event.id, event.timestamp.isoformat() if event.timestamp else "",
            event.phase, event.step_number, event.event_type,
            str(event.exogenous_inputs), str(event.system_state),
            str(event.target_state), event.is_votat,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=apex_session_{session_id}.csv"},
    )
