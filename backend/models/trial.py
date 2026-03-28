import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Float, ForeignKey, Boolean, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

class Trial(Base):
    __tablename__ = "trials"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"))
    trial_number: Mapped[int] = mapped_column(Integer)
    system_id: Mapped[str] = mapped_column(String)
    difficulty_level: Mapped[int] = mapped_column(Integer)
    phase: Mapped[str] = mapped_column(String)  # 'calibration' or 'adaptive'
    score_ska: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_ca: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_ee: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_aui: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_composite: Mapped[float | None] = mapped_column(Float, nullable=True)
    metacog_confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metacog_inferred_structure: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metacog_calibration_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    metacog_strategy_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    session: Mapped["Session"] = relationship("Session", back_populates="trials")
    events: Mapped[list["Event"]] = relationship("Event", back_populates="trial")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trial_id: Mapped[str] = mapped_column(String, ForeignKey("trials.id"))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    phase: Mapped[str] = mapped_column(String)  # 'exploration' or 'control'
    step_number: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String)  # 'intervention', 'phase_transition', etc.
    exogenous_inputs: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    system_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    target_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_votat: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    trial: Mapped["Trial"] = relationship("Trial", back_populates="events")
