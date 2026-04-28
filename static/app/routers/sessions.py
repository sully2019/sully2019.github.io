from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Session as SessionModel, Participant
from app.schemas import SessionCreate, SessionOut, SessionDetail, ParticipantOut

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionOut)
def create_session(data: SessionCreate, db: Session = Depends(get_db)):
    if data.poker_scale not in ("fibonacci", "tshirt"):
        raise HTTPException(400, "poker_scale must be 'fibonacci' or 'tshirt'")
    session = SessionModel(name=data.name, poker_scale=data.poker_scale)
    db.add(session)
    db.commit()
    db.refresh(session)
    return SessionOut(
        id=session.id,
        name=session.name,
        created_at=session.created_at,
        poker_scale=session.poker_scale,
        owner_participant_id=session.owner_participant_id,
        participant_count=0,
    )


@router.get("", response_model=list[SessionOut])
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(SessionModel).order_by(SessionModel.created_at.desc()).all()
    results = []
    for s in sessions:
        results.append(SessionOut(
            id=s.id,
            name=s.name,
            created_at=s.created_at,
            poker_scale=s.poker_scale,
            owner_participant_id=s.owner_participant_id,
            participant_count=len(s.participants),
        ))
    return results


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return SessionDetail(
        id=session.id,
        name=session.name,
        created_at=session.created_at,
        poker_scale=session.poker_scale,
        owner_participant_id=session.owner_participant_id,
        participant_count=len(session.participants),
        participants=[ParticipantOut.model_validate(p) for p in session.participants],
    )
