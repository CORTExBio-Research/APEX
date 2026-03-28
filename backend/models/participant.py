import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.database import Base

class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4())[:8].upper())
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    apex_variant: Mapped[str] = mapped_column(String, default="standard")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)

    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="participant")
