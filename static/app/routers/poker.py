from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import PokerRound, PokerVote, Participant
from app.schemas import RoundOut, PokerVoteOut

router = APIRouter(prefix="/api/sessions", tags=["poker"])


@router.get("/{session_id}/rounds", response_model=list[RoundOut])
def get_rounds(session_id: str, db: Session = Depends(get_db)):
    rounds = db.query(PokerRound).filter(
        PokerRound.session_id == session_id
    ).order_by(PokerRound.created_at).all()

    results = []
    for r in rounds:
        votes = []
        if r.status == "revealed":
            for v in r.votes:
                participant = db.query(Participant).filter(Participant.id == v.participant_id).first()
                votes.append(PokerVoteOut(
                    participant_id=v.participant_id,
                    participant_name=participant.name if participant else "?",
                    value=v.value,
                ))
        results.append(RoundOut(
            id=r.id,
            session_id=r.session_id,
            story_title=r.story_title,
            status=r.status,
            created_at=r.created_at,
            final_estimate=r.final_estimate,
            vote_count=len(r.votes),
            votes=votes,
        ))
    return results
