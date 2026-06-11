import time
from typing import Optional, List, Dict, Any
from app.services.cache_service import cache

SESSION_PREFIX = "session:"
USER_SESSIONS_PREFIX = "user_sessions:"

def create_redis_session(
    session_id: str,
    user_id: str,
    device_info: Optional[str],
    ip_address: Optional[str],
    expires_in_days: int = 30
) -> Dict[str, Any]:
    expires_seconds = expires_in_days * 24 * 3600
    now = time.time()
    
    session_data = {
        "id": session_id,
        "user_id": user_id,
        "device_info": device_info or "Unknown Device",
        "ip_address": ip_address or "Unknown IP",
        "last_activity": now,
        "expires_at": now + expires_seconds
    }
    
    # Store session payload in cache
    session_key = f"{SESSION_PREFIX}{session_id}"
    cache.set(session_key, session_data, expire=expires_seconds)
    
    # Store session mapping in user's session list
    user_key = f"{USER_SESSIONS_PREFIX}{user_id}"
    user_sessions = cache.get(user_key) or []
    if session_id not in user_sessions:
        user_sessions.append(session_id)
        cache.set(user_key, user_sessions)
        
    return session_data

def get_redis_session(session_id: str) -> Optional[Dict[str, Any]]:
    session_key = f"{SESSION_PREFIX}{session_id}"
    session_data = cache.get(session_key)
    if session_data:
        # Check if expired
        if time.time() > session_data.get("expires_at", 0):
            revoke_redis_session(session_id)
            return None
        return session_data
    return None

def update_redis_session_activity(session_id: str) -> None:
    session_data = get_redis_session(session_id)
    if session_data:
        session_data["last_activity"] = time.time()
        # Maintain original expiration time
        expires_left = int(session_data["expires_at"] - time.time())
        if expires_left > 0:
            session_key = f"{SESSION_PREFIX}{session_id}"
            cache.set(session_key, session_data, expire=expires_left)

def revoke_redis_session(session_id: str) -> None:
    session_key = f"{SESSION_PREFIX}{session_id}"
    session_data = cache.get(session_key)
    
    # Delete the session key
    cache.delete(session_key)
    
    if session_data:
        user_id = session_data.get("user_id")
        if user_id:
            user_key = f"{USER_SESSIONS_PREFIX}{user_id}"
            user_sessions = cache.get(user_key) or []
            if session_id in user_sessions:
                user_sessions.remove(session_id)
                cache.set(user_key, user_sessions)

def revoke_all_user_redis_sessions(user_id: str) -> None:
    user_key = f"{USER_SESSIONS_PREFIX}{user_id}"
    user_sessions = cache.get(user_key) or []
    for session_id in user_sessions:
        session_key = f"{SESSION_PREFIX}{session_id}"
        cache.delete(session_key)
    cache.delete(user_key)

def list_user_redis_sessions(user_id: str) -> List[Dict[str, Any]]:
    user_key = f"{USER_SESSIONS_PREFIX}{user_id}"
    user_sessions = cache.get(user_key) or []
    valid_sessions = []
    updated_sessions_list = []
    
    for session_id in user_sessions:
        session_data = get_redis_session(session_id)
        if session_data:
            valid_sessions.append(session_data)
            updated_sessions_list.append(session_id)
            
    # Sync cleanup if some sessions were found expired/revoked
    if len(updated_sessions_list) != len(user_sessions):
        cache.set(user_key, updated_sessions_list)
        
    return valid_sessions
