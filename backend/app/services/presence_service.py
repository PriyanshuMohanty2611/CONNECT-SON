import datetime
from typing import List, Optional, Set
from app.core.redis_client import get_redis_client
from app.models.models import User

async def set_user_presence(user_id: str, status: str):
    try:
        redis = get_redis_client()
        # Cache presence status
        await redis.set(f"presence:{user_id}", status)
        
        # Maintain online users set
        if status in ["online", "away", "busy"]:
            await redis.sadd("online_users_set", user_id)
        else:
            await redis.srem("online_users_set", user_id)
            
        if status in ["offline", "invisible"]:
            await redis.set(f"last_seen:{user_id}", datetime.datetime.utcnow().isoformat())
    except Exception as e:
        print(f"[WARNING] Failed to set user presence in Redis: {e}")

async def get_user_presence(user_id: str, default_status: str = "offline") -> str:
    try:
        redis = get_redis_client()
        status = await redis.get(f"presence:{user_id}")
        return status if status else default_status
    except Exception as e:
        print(f"[WARNING] Failed to get user presence from Redis: {e}")
        return default_status

async def get_user_last_seen(user_id: str, default_val: Optional[datetime.datetime] = None) -> Optional[datetime.datetime]:
    try:
        redis = get_redis_client()
        val = await redis.get(f"last_seen:{user_id}")
        if val:
            try:
                return datetime.datetime.fromisoformat(val)
            except ValueError:
                pass
    except Exception as e:
        print(f"[WARNING] Failed to get user last seen from Redis: {e}")
    return default_val

async def get_online_users() -> Set[str]:
    try:
        redis = get_redis_client()
        members = await redis.smembers("online_users_set")
        return set(members)
    except Exception as e:
        print(f"[WARNING] Failed to get online users from Redis: {e}")
        return set()

async def populate_users_presence(users: List[User]):
    """
    Populates user profile presence_status and last_seen from Redis cache.
    """
    for user in users:
        if user.profile:
            status = await get_user_presence(user.id, user.profile.presence_status)
            user.profile.presence_status = status
            
            last_seen = await get_user_last_seen(user.id, user.profile.last_seen)
            user.profile.last_seen = last_seen
