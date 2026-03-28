import json
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models import Participant, Session
from backend.engine.staircase import AdaptiveStaircase
from backend.engine.system_loader import load_system_for_level, get_system_config_for_frontend

router = APIRouter(prefix="/api/session", tags=["session"])

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "staircase_config.json")
_APP_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "app_config.json")

def _load_staircase_config() -> dict:
    with open(_CONFIG_PATH) as f:
        return json.load(f)

def _load_app_config() -> dict:
    with open(_APP_CONFIG_PATH) as f:
        return json.load(f)

# In-memory staircase registry (keyed by session_id)
# For production, serialize staircase state to DB
_staircases: dict[str, AdaptiveStaircase] = {}

class CreateSessionRequest(BaseModel):
    participant_id: str | None = None
    apex_variant: str = "standard"

@router.post("/create")
async def create_session(request: CreateSessionRequest, db: AsyncSession = Depends(get_db)):
    app_config = _load_app_config()
    staircase_config = _load_staircase_config()

    # Create or retrieve participant
    participant_id = request.participant_id
    if not participant_id:
        participant_id = str(uuid.uuid4())[:8].upper()

    result = await db.execute(select(Participant).where(Participant.id == participant_id))
    participant = result.scalar_one_or_none()
    if not participant:
        participant = Participant(
            id=participant_id,
            apex_variant=request.apex_variant,
        )
        db.add(participant)

    # Create session
    session = Session(
        id=str(uuid.uuid4()),
        participant_id=participant_id,
        status="active",
    )
    db.add(session)
    await db.commit()

    # Initialize staircase
    staircase = AdaptiveStaircase(staircase_config)
    _staircases[session.id] = staircase

    # First trial: calibration at level 3
    calibration_level = staircase_config.get("initial_level", 3)
    system = load_system_for_level(calibration_level)
    first_trial_config = get_system_config_for_frontend(system)
    first_trial_config["phase_timings"] = app_config.get("phase_timings", {})

    return {
        "session_id": session.id,
        "participant_id": participant_id,
        "first_trial_config": first_trial_config,
    }

@router.get("/{session_id}/status")
async def get_session_status(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    staircase = _staircases.get(session_id)
    ability_estimate = staircase.get_ability_estimate() if staircase else None

    return {
        "status": session.status,
        "n_trials": session.n_trials_completed,
        "ability_estimate": ability_estimate,
        "apex_ability_score": session.apex_ability_score,
        "current_level": staircase.get_current_level() if staircase else None,
    }

@router.post("/{session_id}/end")
async def end_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "terminated_early"
    session.completed_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "terminated_early", "session_id": session_id}


def get_staircase(session_id: str) -> AdaptiveStaircase | None:
    return _staircases.get(session_id)

def set_staircase(session_id: str, staircase: AdaptiveStaircase):
    _staircases[session_id] = staircase
