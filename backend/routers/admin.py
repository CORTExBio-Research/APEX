import csv
import io
import os
import sys
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.database import get_db
from backend.models import Session, Trial, Event, Participant
from backend.engine.system_loader import list_all_systems

router = APIRouter(prefix="/api/admin", tags=["admin"])

_ADMIN_PASSWORD = os.getenv("APEX_ADMIN_PASSWORD")
if not _ADMIN_PASSWORD:
    print(
        "FATAL: APEX_ADMIN_PASSWORD environment variable is not set. "
        "The admin endpoint cannot operate without a configured password. "
        "Set this variable in your Render environment dashboard before deploying.",
        file=sys.stderr,
    )
    sys.exit(1)

def _check_admin(x_admin_password: str | None = Header(default=None)):
    if x_admin_password != _ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")

@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db), _: None = Depends(_check_admin)):
    result = await db.execute(select(Session))
    sessions = result.scalars().all()
    return [
        {
            "session_id": s.id,
            "participant_id": s.participant_id,
            "status": s.status,
            "n_trials_completed": s.n_trials_completed,
            "apex_ability_score": s.apex_ability_score,
            "staircase_final_level": s.staircase_final_level,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        }
        for s in sessions
    ]

@router.get("/export/all")
async def export_all(db: AsyncSession = Depends(get_db), _: None = Depends(_check_admin)):
    sessions_result = await db.execute(select(Session))
    sessions = {s.id: s for s in sessions_result.scalars().all()}

    trials_result = await db.execute(select(Trial))
    trials = {t.id: t for t in trials_result.scalars().all()}

    events_result = await db.execute(select(Event))
    events = events_result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "session_id", "participant_id", "session_status", "apex_ability_score",
        "staircase_final_level", "trial_id", "trial_number", "system_id",
        "difficulty_level", "phase_type", "score_ska", "score_ca", "score_ee",
        "score_aui", "score_composite", "metacog_confidence", "metacog_calibration_score",
        "metacog_strategy_text", "event_id", "event_timestamp", "event_phase",
        "step_number", "event_type", "exogenous_inputs", "system_state",
        "target_state", "is_votat",
    ])

    for event in events:
        trial = trials.get(event.trial_id)
        if not trial:
            continue
        session = sessions.get(trial.session_id)
        if not session:
            continue
        writer.writerow([
            session.id, session.participant_id, session.status, session.apex_ability_score,
            session.staircase_final_level, trial.id, trial.trial_number, trial.system_id,
            trial.difficulty_level, trial.phase, trial.score_ska, trial.score_ca,
            trial.score_ee, trial.score_aui, trial.score_composite,
            trial.metacog_confidence, trial.metacog_calibration_score,
            trial.metacog_strategy_text,
            event.id, event.timestamp.isoformat() if event.timestamp else "",
            event.phase, event.step_number, event.event_type,
            str(event.exogenous_inputs), str(event.system_state),
            str(event.target_state), event.is_votat,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=apex_all_data.csv"},
    )

@router.get("/system_library")
async def get_system_library(_: None = Depends(_check_admin)):
    return list_all_systems()
