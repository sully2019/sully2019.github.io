from datetime import datetime
from pydantic import BaseModel


# Sessions
class SessionCreate(BaseModel):
    name: str
    poker_scale: str = "fibonacci"


class ParticipantOut(BaseModel):
    id: str
    name: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    poker_scale: str
    owner_participant_id: str | None = None
    participant_count: int = 0

    model_config = {"from_attributes": True}


class SessionDetail(SessionOut):
    participants: list[ParticipantOut] = []


# Participants
class JoinRequest(BaseModel):
    name: str


class JoinResponse(BaseModel):
    participant: ParticipantOut
    is_owner: bool
    session: SessionOut


# Retro Cards
class CardCreate(BaseModel):
    column: str
    text: str


class CardOut(BaseModel):
    id: str
    session_id: str
    participant_id: str
    participant_name: str = ""
    column: str
    text: str
    created_at: datetime
    vote_count: int = 0
    voted_by_me: bool = False

    model_config = {"from_attributes": True}


# Poker
class RoundCreate(BaseModel):
    story_title: str


class PokerVoteOut(BaseModel):
    participant_id: str
    participant_name: str
    value: str


class RoundOut(BaseModel):
    id: str
    session_id: str
    story_title: str
    status: str
    created_at: datetime
    final_estimate: str | None = None
    vote_count: int = 0
    votes: list[PokerVoteOut] = []

    model_config = {"from_attributes": True}
