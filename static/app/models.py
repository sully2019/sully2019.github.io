import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, String, DateTime, Integer, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


def new_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    poker_scale = Column(String, default="fibonacci")
    owner_participant_id = Column(String, ForeignKey("participants.id"), nullable=True)

    participants = relationship("Participant", back_populates="session", foreign_keys="Participant.session_id")
    retro_cards = relationship("RetroCard", back_populates="session")
    poker_rounds = relationship("PokerRound", back_populates="session")


class Participant(Base):
    __tablename__ = "participants"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    name = Column(String, nullable=False)
    joined_at = Column(DateTime, default=utcnow)

    session = relationship("Session", back_populates="participants", foreign_keys=[session_id])

    __table_args__ = (UniqueConstraint("session_id", "name", name="uq_session_participant"),)


class RetroCard(Base):
    __tablename__ = "retro_cards"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    participant_id = Column(String, ForeignKey("participants.id"), nullable=False)
    column = Column(String, nullable=False)  # went_well, didnt_go_well, action_items
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow)
    sort_order = Column(Integer, default=0)

    session = relationship("Session", back_populates="retro_cards")
    participant = relationship("Participant")
    votes = relationship("RetroVote", back_populates="card", cascade="all, delete-orphan")


class RetroVote(Base):
    __tablename__ = "retro_votes"

    id = Column(String, primary_key=True, default=new_uuid)
    card_id = Column(String, ForeignKey("retro_cards.id"), nullable=False)
    participant_id = Column(String, ForeignKey("participants.id"), nullable=False)

    card = relationship("RetroCard", back_populates="votes")
    participant = relationship("Participant")

    __table_args__ = (UniqueConstraint("card_id", "participant_id", name="uq_card_vote"),)


class PokerRound(Base):
    __tablename__ = "poker_rounds"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    story_title = Column(String, nullable=False)
    status = Column(String, default="voting")  # voting, revealed
    created_at = Column(DateTime, default=utcnow)
    final_estimate = Column(String, nullable=True)

    session = relationship("Session", back_populates="poker_rounds")
    votes = relationship("PokerVote", back_populates="round", cascade="all, delete-orphan")


class PokerVote(Base):
    __tablename__ = "poker_votes"

    id = Column(String, primary_key=True, default=new_uuid)
    round_id = Column(String, ForeignKey("poker_rounds.id"), nullable=False)
    participant_id = Column(String, ForeignKey("participants.id"), nullable=False)
    value = Column(String, nullable=False)

    round = relationship("PokerRound", back_populates="votes")
    participant = relationship("Participant")

    __table_args__ = (UniqueConstraint("round_id", "participant_id", name="uq_round_vote"),)
