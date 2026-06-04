import datetime
import socketio
from urllib.parse import parse_qs
from anyio.to_thread import run_sync

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import decode_token
from app.models.models import Profile, Chat
from app.sockets import db_helpers
from app.core.redis_client import get_redis_client
from app.services.presence_service import set_user_presence

# Create Socket.IO async server
client_manager = None
if settings.REDIS_URL:
    try:
        client_manager = socketio.AsyncRedisManager(settings.REDIS_URL)
        print("[INFO] Redis manager initialized for Socket.IO.")
    except Exception as e:
        print(f"[WARNING] Failed to initialize Redis manager: {e}. Falling back to in-memory.")
        client_manager = None

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*", # Cors origin handling
    client_manager=client_manager
)

# Wrap with ASGI application
sio_app = socketio.ASGIApp(
    socketio_server=sio,
    socketio_path=""
)

# Connection maps: user_id -> sid and vice-versa
online_users = {}
sid_to_user = {}

async def execute_db(func, *args, **kwargs):
    # Runs the synchronous database function inside a thread pool to avoid blocking the asyncio loop
    db = SessionLocal()
    try:
        res = await run_sync(lambda: func(db, *args, **kwargs))
        return res
    finally:
        db.close()

@sio.event
async def connect(sid, environ, auth=None):
    token = None
    if auth and "token" in auth:
        token = auth["token"]
    else:
        # Fallback to query parameters
        query_string = environ.get("QUERY_STRING", "")
        qs = parse_qs(query_string)
        if "token" in qs:
            token = qs["token"][0]
            
    if not token:
        print(f"Socket.IO connection rejected: missing token. (sid: {sid})")
        return False
        
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        print(f"Socket.IO connection rejected: invalid token. (sid: {sid})")
        return False
        
    user_id = payload.get("sub")
    
    # Save connection details
    online_users[user_id] = sid
    sid_to_user[sid] = user_id
    
    # Update presence in Redis cache
    await set_user_presence(user_id, "online")
        
    # Join user's personal channel room
    await sio.enter_room(sid, user_id)
    
    # Broadcast presence update
    await sio.emit("presence_change", {"user_id": user_id, "status": "online"})
    
    print(f"Socket.IO client connected: {sid} (User: {user_id})")
    return True


@sio.event
async def disconnect(sid):
    user_id = sid_to_user.get(sid)
    if user_id:
        # Clean up mappings
        if online_users.get(user_id) == sid:
            del online_users[user_id]
        del sid_to_user[sid]
        
        # Update Redis presence status
        await set_user_presence(user_id, "offline")
        
        # Update database status to offline
        async def update_status_offline(db):
            profile = db.query(Profile).filter(Profile.user_id == user_id).first()
            if profile:
                profile.presence_status = "offline"
                profile.last_seen = datetime.datetime.utcnow()
                db.commit()
                
        await execute_db(update_status_offline)
            
        # Broadcast status change
        await sio.emit("presence_change", {"user_id": user_id, "status": "offline"})
        
    print(f"Socket.IO client disconnected: {sid}")


@sio.event
async def update_presence(sid, data):
    status_str = data.get("status")
    if status_str not in ["online", "away", "busy", "invisible"]:
        return {"error": "Invalid status"}
        
    user_id = sid_to_user.get(sid)
    if not user_id:
        return {"error": "User session not found"}
        
    # Update Redis presence status
    await set_user_presence(user_id, status_str)
        
    broadcast_status = "offline" if status_str == "invisible" else status_str
    await sio.emit("presence_change", {"user_id": user_id, "status": broadcast_status})
    return {"status": status_str}


@sio.event
async def join_chat(sid, data):
    chat_id = data.get("chat_id")
    user_id = sid_to_user.get(sid)
    if not chat_id or not user_id:
        return {"error": "Invalid request"}
        
    # Verify participant
    is_participant = await execute_db(db_helpers.check_chat_participation, user_id, chat_id)
    if not is_participant:
        return {"error": "Forbidden"}
        
    await sio.enter_room(sid, chat_id)
    print(f"Socket client {sid} (User {user_id}) joined chat room: {chat_id}")
    return {"status": "joined", "chat_id": chat_id}


@sio.event
async def send_message(sid, data):
    chat_id = data.get("chat_id")
    encrypted_content = data.get("encrypted_content")
    nonce = data.get("nonce")
    is_encrypted = data.get("is_encrypted", True)
    reply_to_id = data.get("reply_to_id")
    attachment_ids = data.get("attachment_ids")
    client_msg_id = data.get("client_msg_id")
    
    user_id = sid_to_user.get(sid)
    if not chat_id or not user_id:
        return {"error": "Invalid request"}
        
    # Verify participant
    is_participant = await execute_db(db_helpers.check_chat_participation, user_id, chat_id)
    if not is_participant:
        return {"error": "Forbidden"}
        
    # Atomically increment or fetch sequence number in Redis
    redis = get_redis_client()
    try:
        # Check if the sequence key exists (guard against catastrophic Redis restarts starting at 0)
        exists = await redis.exists(f"chat_seq:{chat_id}")
        if not exists:
            # Redis key doesn't exist; recover from persistent DB fallback
            message_sequence = await execute_db(db_helpers.get_next_chat_sequence, chat_id)
            # Sync key back to Redis
            await redis.set(f"chat_seq:{chat_id}", str(message_sequence))
        else:
            # Key exists in Redis; increment atomically
            message_sequence = await redis.incrby(f"chat_seq:{chat_id}", 1)
    except Exception:
        # Fallback to persistent DB fallback sequence if Redis is completely down
        message_sequence = await execute_db(db_helpers.get_next_chat_sequence, chat_id)


    # Save message in DB
    try:
        msg_dict = await execute_db(
            db_helpers.store_message, 
            user_id, 
            chat_id, 
            encrypted_content, 
            nonce, 
            is_encrypted, 
            reply_to_id, 
            attachment_ids,
            client_msg_id,
            message_sequence
        )
    except ValueError as e:
        return {"error": str(e)}
    
    # Broadcast to room (including sender)
    await sio.emit("new_message", msg_dict, room=chat_id)
    
    # Broadcast notifications to other participants
    async def get_and_emit_notifs(db):
        return db_helpers.get_notifications_by_target(db, msg_dict["id"], "new_message")
        
    notifs = await execute_db(get_and_emit_notifs)
    for notif in notifs:
        await sio.emit("new_notification", notif, room=notif["user_id"])
        
    return {"status": "sent", "message": msg_dict}


@sio.event
async def typing(sid, data):
    chat_id = data.get("chat_id")
    is_typing = data.get("is_typing", False)
    
    user_id = sid_to_user.get(sid)
    if not chat_id or not user_id:
        return
        
    # Cache typing status in Redis
    redis = get_redis_client()
    if is_typing:
        await redis.set(f"typing:{chat_id}:{user_id}", "1", ex=10)
    else:
        await redis.delete(f"typing:{chat_id}:{user_id}")
        
    # Broadcast typing state to others in chat room (skip sender)
    await sio.emit(
        "typing", 
        {"chat_id": chat_id, "user_id": user_id, "is_typing": is_typing}, 
        room=chat_id, 
        skip_sid=sid
    )


@sio.event
async def message_status(sid, data):
    message_id = data.get("message_id")
    status_str = data.get("status") # delivered or seen
    
    user_id = sid_to_user.get(sid)
    if not message_id or not status_str or not user_id:
        return {"error": "Invalid request"}
        
    status_dict = await execute_db(
        db_helpers.update_status, 
        user_id, 
        message_id, 
        status_str
    )
    
    chat_id = status_dict.get("chat_id")
    if chat_id:
        # Broadcast status tick change to chat room
        await sio.emit("status_change", status_dict, room=chat_id)
        
    return {"status": "updated"}


@sio.event
async def add_reaction(sid, data):
    message_id = data.get("message_id")
    reaction = data.get("reaction")
    
    user_id = sid_to_user.get(sid)
    if not message_id or not reaction or not user_id:
        return {"error": "Invalid request"}
        
    reaction_dict = await execute_db(
        db_helpers.store_reaction, 
        user_id, 
        message_id, 
        reaction
    )
    
    chat_id = reaction_dict.get("chat_id")
    if chat_id:
        # Broadcast reaction change to chat room
        await sio.emit("new_reaction", reaction_dict, room=chat_id)
        
        # Broadcast reaction notifications to relevant users
        async def get_and_emit_reaction_notifs(db):
            return db_helpers.get_notifications_by_target(db, message_id, "reaction")
            
        notifs = await execute_db(get_and_emit_reaction_notifs)
        for notif in notifs:
            await sio.emit("new_notification", notif, room=notif["user_id"])
        
    return {"status": "reacted"}


# ========================================================
# 9. REAL-TIME GAMING SOCKETS
# ========================================================

import uuid
import json
from sqlalchemy import func, and_, or_

def create_game_session(db, chat_id, game_type, player1_id):
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise ValueError("Chat not found")
    player2 = next((p for p in chat.participants if p.id != player1_id), None)
    if not player2:
        raise ValueError("No partner found in chat")
        
    session_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow().isoformat()
    
    board_state = ""
    if game_type == "tictactoe":
        board_state = json.dumps([""] * 9)
    elif game_type == "connect4":
        board_state = json.dumps([[""] * 7 for _ in range(6)])
    elif game_type == "chess":
        board_state = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        
    db.execute(
        func.insert(func.table("game_sessions")).values(
            id=session_id,
            chat_id=chat_id,
            game_type=game_type,
            status="pending",
            board_state=board_state,
            player1_id=player1_id,
            player2_id=player2.id,
            turn_player_id=player1_id,
            winner_id=None,
            created_at=now,
            updated_at=now
        )
    )
    db.commit()
    return {
        "id": session_id,
        "chat_id": chat_id,
        "game_type": game_type,
        "status": "pending",
        "board_state": board_state,
        "player1_id": player1_id,
        "player2_id": player2.id,
        "turn_player_id": player1_id,
        "winner_id": None
    }

def accept_game_session(db, session_id):
    db.execute(
        func.update(func.table("game_sessions")).where(
            func.literal_column("id") == session_id
        ).values(
            status="playing",
            updated_at=datetime.datetime.utcnow().isoformat()
        )
    )
    db.commit()
    
    row = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("chat_id"),
            func.literal_column("game_type"),
            func.literal_column("player1_id"),
            func.literal_column("player2_id")
        ).select_from(func.table("game_sessions")).where(func.literal_column("id") == session_id)
    ).first()
    if row:
        return {
            "id": row[0],
            "chat_id": row[1],
            "game_type": row[2],
            "status": "playing",
            "player1_id": row[3],
            "player2_id": row[4]
        }
    return None

def update_game_state(db, session_id, board_state, turn_player_id, winner_id=None):
    status_str = "completed" if winner_id else "playing"
    
    db.execute(
        func.update(func.table("game_sessions")).where(
            func.literal_column("id") == session_id
        ).values(
            board_state=board_state,
            turn_player_id=turn_player_id,
            winner_id=winner_id,
            status=status_str,
            updated_at=datetime.datetime.utcnow().isoformat()
        )
    )
    db.commit()
    
    if winner_id:
        sess = db.execute(
            func.select(
                func.literal_column("player1_id"),
                func.literal_column("player2_id"),
                func.literal_column("game_type")
            ).select_from(func.table("game_sessions")).where(func.literal_column("id") == session_id)
        ).first()
        
        if sess:
            p1, p2, gtype = sess
            def update_stats(uid, w, l, d):
                exists = db.execute(
                    func.select(1).select_from(func.table("game_leaderboards")).where(
                        func.literal_column("user_id") == uid
                    )
                ).first()
                if exists:
                    db.execute(
                        func.update(func.table("game_leaderboards")).where(
                            func.literal_column("user_id") == uid
                        ).values(
                            wins=func.literal_column("wins") + w,
                            losses=func.literal_column("losses") + l,
                            draws=func.literal_column("draws") + d
                        )
                    )
                else:
                    db.execute(
                        func.insert(func.table("game_leaderboards")).values(
                            id=str(uuid.uuid4()),
                            user_id=uid,
                            wins=w,
                            losses=l,
                            draws=d,
                            game_type=gtype
                        )
                    )
            if winner_id == "draw":
                update_stats(p1, 0, 0, 1)
                update_stats(p2, 0, 0, 1)
            else:
                loser = p2 if winner_id == p1 else p1
                update_stats(winner_id, 1, 0, 0)
                update_stats(loser, 0, 1, 0)
            db.commit()
            
    row = db.execute(
        func.select(
            func.literal_column("id"),
            func.literal_column("chat_id"),
            func.literal_column("game_type"),
            func.literal_column("board_state"),
            func.literal_column("player1_id"),
            func.literal_column("player2_id"),
            func.literal_column("turn_player_id"),
            func.literal_column("winner_id"),
            func.literal_column("status")
        ).select_from(func.table("game_sessions")).where(func.literal_column("id") == session_id)
    ).first()
    
    if row:
        return {
            "id": row[0],
            "chat_id": row[1],
            "game_type": row[2],
            "board_state": row[3],
            "player1_id": row[4],
            "player2_id": row[5],
            "turn_player_id": row[6],
            "winner_id": row[7],
            "status": row[8]
        }
    return None

@sio.event
async def game_invite(sid, data):
    chat_id = data.get("chat_id")
    game_type = data.get("game_type")
    user_id = sid_to_user.get(sid)
    
    if not chat_id or not game_type or not user_id:
        return {"error": "Invalid game request"}
        
    try:
        game_sess = await execute_db(create_game_session, chat_id, game_type, user_id)
        # Broadcast game invite to room
        await sio.emit("game_invite_received", game_sess, room=chat_id)
        return {"status": "invited", "session": game_sess}
    except Exception as e:
        return {"error": str(e)}

@sio.event
async def game_accept(sid, data):
    session_id = data.get("session_id")
    user_id = sid_to_user.get(sid)
    if not session_id or not user_id:
        return {"error": "Invalid session"}
        
    game_sess = await execute_db(accept_game_session, session_id)
    if game_sess:
        chat_id = game_sess["chat_id"]
        # Notify room that the game has started
        await sio.emit("game_started", game_sess, room=chat_id)
        return {"status": "started", "session": game_sess}
    return {"error": "Game session not found"}

@sio.event
async def game_move(sid, data):
    session_id = data.get("session_id")
    board_state = data.get("board_state")
    turn_player_id = data.get("turn_player_id")
    winner_id = data.get("winner_id")
    user_id = sid_to_user.get(sid)
    
    if not session_id or not board_state or not user_id:
        return {"error": "Invalid move"}
        
    game_sess = await execute_db(update_game_state, session_id, board_state, turn_player_id, winner_id)
    if game_sess:
        chat_id = game_sess["chat_id"]
        # Broadcast updated board state
        await sio.emit("game_state_update", game_sess, room=chat_id)
        return {"status": "moved"}
    return {"error": "Game session not found"}


# ========================================================
# 10. REAL-TIME NOTES COLLABORATION & SCREENSHOTS
# ========================================================

@sio.event
async def join_note_edit(sid, data):
    note_id = data.get("note_id")
    user_id = sid_to_user.get(sid)
    if not note_id or not user_id:
        return {"error": "Invalid request"}
    room_name = f"note_{note_id}"
    await sio.enter_room(sid, room_name)
    return {"status": "joined", "room": room_name}

@sio.event
async def note_edit_change(sid, data):
    note_id = data.get("note_id")
    content = data.get("content")
    cursor_position = data.get("cursor_position")
    user_id = sid_to_user.get(sid)
    if not note_id or not user_id:
        return
        
    room_name = f"note_{note_id}"
    await sio.emit(
        "note_collaborator_edit", 
        {"note_id": note_id, "content": content, "cursor_position": cursor_position, "user_id": user_id},
        room=room_name,
        skip_sid=sid
    )

@sio.event
async def screenshot_taken(sid, data):
    chat_id = data.get("chat_id")
    user_id = sid_to_user.get(sid)
    if not chat_id or not user_id:
        return
        
    # Send screenshot warning alert to the chat room
    await sio.emit(
        "screenshot_alert",
        {"chat_id": chat_id, "user_id": user_id, "message": "Screenshot warning: A participant took a screenshot of this chat!"},
        room=chat_id,
        skip_sid=sid
    )

