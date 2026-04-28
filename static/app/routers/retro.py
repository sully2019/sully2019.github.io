from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RetroCard, RetroVote, Participant
from app.schemas import CardOut

router = APIRouter(prefix="/api/sessions", tags=["retro"])


@router.get("/{session_id}/cards", response_model=list[CardOut])
def get_cards(session_id: str, participant_id: str = Query(""), db: Session = Depends(get_db)):
    cards = db.query(RetroCard).filter(RetroCard.session_id == session_id).order_by(RetroCard.created_at).all()
    results = []
    for card in cards:
        vote_count = db.query(RetroVote).filter(RetroVote.card_id == card.id).count()
        voted_by_me = False
        if participant_id:
            voted_by_me = db.query(RetroVote).filter(
                RetroVote.card_id == card.id, RetroVote.participant_id == participant_id
            ).first() is not None
        participant = db.query(Participant).filter(Participant.id == card.participant_id).first()
        results.append(CardOut(
            id=card.id,
            session_id=card.session_id,
            participant_id=card.participant_id,
            participant_name=participant.name if participant else "",
            column=card.column,
            text=card.text,
            created_at=card.created_at,
            vote_count=vote_count,
            voted_by_me=voted_by_me,
        ))
    return results
