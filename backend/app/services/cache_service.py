import time
import json
from typing import Optional, Any
from app.core.config import settings

class InMemoryCache:
    def __init__(self):
        self._data = {}  # key -> (value, expires_at)

    def get(self, key: str) -> Optional[str]:
        if key not in self._data:
            return None
        val, expires_at = self._data[key]
        if expires_at and time.time() > expires_at:
            del self._data[key]
            return None
        return val

    def set(self, key: str, value: str, expire: Optional[int] = None) -> None:
        expires_at = time.time() + expire if expire else None
        self._data[key] = (value, expires_at)

    def delete(self, key: str) -> None:
        if key in self._data:
            del self._data[key]

class CacheService:
    def __init__(self):
        self.redis_client = None
        self.use_redis = False

        if settings.REDIS_URL:
            try:
                import redis
                self.redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
                # Test connection
                self.redis_client.ping()
                self.use_redis = True
                print("CacheService initialized with Redis connection.")
            except Exception as e:
                print(f"Redis cache connection failed: {e}. Falling back to in-memory cache.")
        
        if not self.use_redis:
            self.memory_cache = InMemoryCache()
            print("CacheService initialized with in-memory fallback.")

    def get(self, key: str) -> Optional[Any]:
        try:
            if self.use_redis:
                val = self.redis_client.get(key)
            else:
                val = self.memory_cache.get(key)
            
            if val:
                return json.loads(val)
        except Exception as e:
            print(f"Cache get error: {e}")
        return None

    def set(self, key: str, value: Any, expire: Optional[int] = None) -> None:
        try:
            val_str = json.dumps(value)
            if self.use_redis:
                self.redis_client.set(key, val_str, ex=expire)
            else:
                self.memory_cache.set(key, val_str, expire=expire)
        except Exception as e:
            print(f"Cache set error: {e}")

    def delete(self, key: str) -> None:
        try:
            if self.use_redis:
                self.redis_client.delete(key)
            else:
                self.memory_cache.delete(key)
        except Exception as e:
            print(f"Cache delete error: {e}")

cache = CacheService()
