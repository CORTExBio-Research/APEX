import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Integer, Float, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    participant_id: Mapped[str] = mapped_column(String, ForeignKey("participants.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    n_trials_completed: Mapped[int] = mapped_column(Integer, default=0)
    apex_ability_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    staircase_final_level: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="active")  # 'active', 'completed', 'abandoned'

    participant: Mapped["Participant"] = relationship("Participant", back_populates="sessions")
    trials: Mapped[list["Trial"]] = relationship("Trial", back_populates="session")
