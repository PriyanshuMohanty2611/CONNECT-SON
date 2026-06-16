import time
import os
from app.services.cache_service import cache

def is_rate_limited(key: str, limit: int, period_seconds: int) -> bool:
    """
    Checks if a request key has exceeded the rate limit using a sliding window.
    Returns True if rate limited (blocked), False if allowed.
    """
    if os.getenv("TESTING") == "True":
        return False
    try:
        cache_key = f"rate_limit:{key}"
        now = time.time()
        
        # Retrieve timestamps of previous requests
        timestamps = cache.get(cache_key) or []
        
        # Remove timestamps older than the sliding window
        cutoff = now - period_seconds
        timestamps = [ts for ts in timestamps if ts > cutoff]
        
        if len(timestamps) >= limit:
            return True
            
        # Append current request timestamp and save back
        timestamps.append(now)
        # Expiry time for the key should cover the full window period
        cache.set(cache_key, timestamps, expire=period_seconds)
        return False
    except Exception as e:
        print(f"[RATE LIMITER] [ERROR] Error checking limit for key {key}: {e}")
        # Fail open in case of cache issues to avoid locking out users
        return False
