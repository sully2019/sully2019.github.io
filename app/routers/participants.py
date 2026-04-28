from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Session as SessionModel, Participant
from app.schemas import JoinRequest, JoinResponse, ParticipantOut, SessionOut

router = APIRouter(prefix="/api/sessions", tags=["participants"])


@router.post("/{session_id}/join", response_model=JoinResponse)
def join_session(session_id: str, data: JoinRequest, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")

    # Check if participant already exists (rejoin)
    existing = db.query(Participant).filter(
        Participant.session_id == session_id,
        Participant.name == name,
    ).first()

    if existing:
        is_owner = session.owner_participant_id == existing.id
        return JoinResponse(
            participant=ParticipantOut.model_validate(existing),
            is_owner=is_owner,
            session=SessionOut(
                id=session.id,
                name=session.name,
                created_at=session.created_at,
                poker_scale=session.poker_scale,
                owner_participant_id=session.owner_participant_id,
                participant_count=len(session.participants),
            ),
        )

    # Create new participant
    participant = Participant(session_id=session_id, name=name)
    db.add(participant)
    db.flush()

    # First participant becomes owner
    is_owner = session.owner_participant_id is None
    if is_owner:
        session.owner_participant_id = participant.id

    db.commit()
    db.refresh(participant)
    db.refresh(session)

    return JoinResponse(
        participant=ParticipantOut.model_validate(participant),
        is_owner=is_owner,
        session=SessionOut(
            id=session.id,
            name=session.name,
            created_at=session.created_at,
            poker_scale=session.poker_scale,
            owner_participant_id=session.owner_participant_id,
            participant_count=len(session.participants),
        ),
    )
