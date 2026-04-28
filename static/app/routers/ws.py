import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws_manager import manager
from app.database import SessionLocal
from app.models import (
    Session, Participant, RetroCard, RetroVote, PokerRound, PokerVote,
)

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(ws: WebSocket, session_id: str, participant_id: str = ""):
    if not participant_id:
        await ws.close(code=4001, reason="participant_id required")
        return

    await manager.connect(session_id, participant_id, ws)

    # Broadcast join event
    db = get_db()
    try:
        participant = db.query(Participant).filter(Participant.id == participant_id).first()
        if participant:
            await manager.broadcast(session_id, {
                "type": "participant_joined",
                "data": {
                    "id": participant.id,
                    "name": participant.name,
                    "joined_at": participant.joined_at.isoformat(),
                },
            })
    finally:
        db.close()

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_personal(ws, {"type": "error", "data": {"message": "Invalid JSON"}})
                continue

            msg_type = msg.get("type", "")
            data = msg.get("data", {})

            db = get_db()
            try:
                await handle_message(db, session_id, participant_id, msg_type, data, ws)
            finally:
                db.close()

    except WebSocketDisconnect:
        manager.disconnect(session_id, participant_id)
        await manager.broadcast(session_id, {
            "type": "participant_left",
            "data": {"participant_id": participant_id},
        })


async def handle_message(db, session_id: str, participant_id: str, msg_type: str, data: dict, ws: WebSocket):
    handlers = {
        "card_add": handle_card_add,
        "card_edit": handle_card_edit,
        "card_delete": handle_card_delete,
        "card_vote": handle_card_vote,
        "poker_new_round": handle_poker_new_round,
        "poker_vote": handle_poker_vote,
        "poker_reveal": handle_poker_reveal,
        "poker_estimate": handle_poker_estimate,
        "timer_start": handle_timer_start,
        "timer_stop": handle_timer_stop,
        "timer_reset": handle_timer_reset,
    }
    handler = handlers.get(msg_type)
    if handler:
        await handler(db, session_id, participant_id, data, ws)
    else:
        await manager.send_personal(ws, {"type": "error", "data": {"message": f"Unknown type: {msg_type}"}})


# --- Retro Card Handlers ---

async def handle_card_add(db, session_id, participant_id, data, ws):
    column = data.get("column", "")
    text = data.get("text", "").strip()
    if column not in ("went_well", "didnt_go_well", "action_items") or not text:
        await manager.send_personal(ws, {"type": "error", "data": {"message": "Invalid card data"}})
        return

    card = RetroCard(session_id=session_id, participant_id=participant_id, column=column, text=text)
    db.add(card)
    db.commit()
    db.refresh(card)

    participant = db.query(Participant).filter(Participant.id == participant_id).first()
    await manager.broadcast(session_id, {
        "type": "card_added",
        "data": {
            "id": card.id,
            "session_id": card.session_id,
            "participant_id": card.participant_id,
            "participant_name": participant.name if participant else "",
            "column": card.column,
            "text": card.text,
            "created_at": card.created_at.isoformat(),
            "vote_count": 0,
        },
    })


async def handle_card_edit(db, session_id, participant_id, data, ws):
    card_id = data.get("card_id", "")
    text = data.get("text", "").strip()
    if not card_id or not text:
        return

    card = db.query(RetroCard).filter(RetroCard.id == card_id, RetroCard.session_id == session_id).first()
    if not card:
        return

    # Only author or owner can edit
    session = db.query(Session).filter(Session.id == session_id).first()
    if card.participant_id != participant_id and session.owner_participant_id != participant_id:
        await manager.send_personal(ws, {"type": "error", "data": {"message": "Not authorized"}})
        return

    card.text = text
    db.commit()

    await manager.broadcast(session_id, {
        "type": "card_edited",
        "data": {"card_id": card.id, "text": card.text},
    })


async def handle_card_delete(db, session_id, participant_id, data, ws):
    card_id = data.get("card_id", "")
    if not card_id:
        return

    card = db.query(RetroCard).filter(RetroCard.id == card_id, RetroCard.session_id == session_id).first()
    if not card:
        return

    session = db.query(Session).filter(Session.id == session_id).first()
    if card.participant_id != participant_id and session.owner_participant_id != participant_id:
        await manager.send_personal(ws, {"type": "error", "data": {"message": "Not authorized"}})
        return

    db.delete(card)
    db.commit()

    await manager.broadcast(session_id, {
        "type": "card_deleted",
        "data": {"card_id": card_id},
    })


async def handle_card_vote(db, session_id, participant_id, data, ws):
    card_id = data.get("card_id", "")
    if not card_id:
        return

    card = db.query(RetroCard).filter(RetroCard.id == card_id, RetroCard.session_id == session_id).first()
    if not card:
        return

    existing = db.query(RetroVote).filter(
        RetroVote.card_id == card_id, RetroVote.participant_id == participant_id
    ).first()

    if existing:
        db.delete(existing)
    else:
        vote = RetroVote(card_id=card_id, participant_id=participant_id)
        db.add(vote)

    db.commit()

    vote_count = db.query(RetroVote).filter(RetroVote.card_id == card_id).count()
    voters = [v.participant_id for v in db.query(RetroVote.participant_id).filter(RetroVote.card_id == card_id).all()]

    await manager.broadcast(session_id, {
        "type": "card_voted",
        "data": {"card_id": card_id, "vote_count": vote_count, "voter_ids": voters},
    })


# --- Poker Handlers ---

async def handle_poker_new_round(db, session_id, participant_id, data, ws):
    session = db.query(Session).filter(Session.id == session_id).first()
    if session.owner_participant_id != participant_id:
        await manager.send_personal(ws, {"type": "error", "data": {"message": "Only the owner can create rounds"}})
        return

    title = data.get("story_title", "").strip()
    if not title:
        return

    round_ = PokerRound(session_id=session_id, story_title=title)
    db.add(round_)
    db.commit()
    db.refresh(round_)

    await manager.broadcast(session_id, {
        "type": "poker_round_started",
        "data": {
            "id": round_.id,
            "session_id": round_.session_id,
            "story_title": round_.story_title,
            "status": round_.status,
            "created_at": round_.created_at.isoformat(),
        },
    })


async def handle_poker_vote(db, session_id, participant_id, data, ws):
    round_id = data.get("round_id", "")
    value = data.get("value", "")
    if not round_id or not value:
        return

    round_ = db.query(PokerRound).filter(PokerRound.id == round_id, PokerRound.session_id == session_id).first()
    if not round_ or round_.status != "voting":
        return

    existing = db.query(PokerVote).filter(
        PokerVote.round_id == round_id, PokerVote.participant_id == participant_id
    ).first()

    if existing:
        existing.value = value
    else:
        vote = PokerVote(round_id=round_id, participant_id=participant_id, value=value)
        db.add(vote)

    db.commit()

    # Broadcast that someone voted (no value)
    await manager.broadcast(session_id, {
        "type": "poker_vote_cast",
        "data": {"round_id": round_id, "participant_id": participant_id},
    })

    # Auto-reveal if all connected participants have voted
    connected = manager.get_connected_participant_ids(session_id)
    voted = {v.participant_id for v in db.query(PokerVote.participant_id).filter(PokerVote.round_id == round_id).all()}
    if connected and connected.issubset(voted):
        await do_reveal(db, session_id, round_id)


async def handle_poker_reveal(db, session_id, participant_id, data, ws):
    session = db.query(Session).filter(Session.id == session_id).first()
    if session.owner_participant_id != participant_id:
        await manager.send_personal(ws, {"type": "error", "data": {"message": "Only the owner can reveal"}})
        return

    round_id = data.get("round_id", "")
    if not round_id:
        return

    await do_reveal(db, session_id, round_id)


async def do_reveal(db, session_id, round_id):
    round_ = db.query(PokerRound).filter(PokerRound.id == round_id).first()
    if not round_ or round_.status == "revealed":
        return

    round_.status = "revealed"
    db.commit()

    votes = db.query(PokerVote).filter(PokerVote.round_id == round_id).all()
    vote_data = []
    numeric_values = []
    for v in votes:
        participant = db.query(Participant).filter(Participant.id == v.participant_id).first()
        vote_data.append({
            "participant_id": v.participant_id,
            "participant_name": participant.name if participant else "?",
            "value": v.value,
        })
        try:
            numeric_values.append(float(v.value))
        except (ValueError, TypeError):
            pass

    summary = {}
    if numeric_values:
        summary["average"] = round(sum(numeric_values) / len(numeric_values), 1)
        summary["min"] = min(numeric_values)
        summary["max"] = max(numeric_values)

    await manager.broadcast(session_id, {
        "type": "poker_revealed",
        "data": {
            "round_id": round_id,
            "votes": vote_data,
            "summary": summary,
        },
    })


async def handle_poker_estimate(db, session_id, participant_id, data, ws):
    session = db.query(Session).filter(Session.id == session_id).first()
    if session.owner_participant_id != participant_id:
        await manager.send_personal(ws, {"type": "error", "data": {"message": "Only the owner can set estimate"}})
        return

    round_id = data.get("round_id", "")
    value = data.get("value", "")
    if not round_id or not value:
        return

    round_ = db.query(PokerRound).filter(PokerRound.id == round_id).first()
    if not round_:
        return

    round_.final_estimate = value
    db.commit()

    await manager.broadcast(session_id, {
        "type": "poker_estimated",
        "data": {"round_id": round_id, "value": value},
    })


# --- Timer Handlers (ephemeral, no DB) ---

async def handle_timer_start(db, session_id, participant_id, data, ws):
    session = db.query(Session).filter(Session.id == session_id).first()
    if session.owner_participant_id != participant_id:
        await manager.send_personal(ws, {"type": "error", "data": {"message": "Only the owner can control the timer"}})
        return

    from datetime import datetime, timezone
    await manager.broadcast(session_id, {
        "type": "timer_started",
        "data": {
            "seconds": data.get("seconds", 300),
            "started_at": datetime.now(timezone.utc).isoformat(),
        },
    })


async def handle_timer_stop(db, session_id, participant_id, data, ws):
    session = db.query(Session).filter(Session.id == session_id).first()
    if session.owner_participant_id != participant_id:
        return

    await manager.broadcast(session_id, {
        "type": "timer_stopped",
        "data": {"remaining": data.get("remaining", 0)},
    })


async def handle_timer_reset(db, session_id, participant_id, data, ws):
    session = db.query(Session).filter(Session.id == session_id).first()
    if session.owner_participant_id != participant_id:
        return

    await manager.broadcast(session_id, {
        "type": "timer_reset",
        "data": {},
    })
