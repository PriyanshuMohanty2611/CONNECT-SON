import redis.asyncio as aioredis
from app.core.config import settings

class MockRedis:
    def __init__(self):
        self.data = {}
        self.sets = {}
        
    async def get(self, key):
        return self.data.get(key)
        
    async def set(self, key, value, ex=None):
        self.data[key] = value
        return True
        
    async def delete(self, key):
        if key in self.data:
            del self.data[key]
        return True
        
    async def sadd(self, key, value):
        if key not in self.sets:
            self.sets[key] = set()
        self.sets[key].add(value)
        return 1
        
    async def srem(self, key, value):
        if key in self.sets and value in self.sets[key]:
            self.sets[key].remove(value)
            return 1
        return 0
        
    async def sismember(self, key, value):
        if key in self.sets:
            return value in self.sets[key]
        return False
        
    async def smembers(self, key):
        if key in self.sets:
            return list(self.sets[key])
        return []

    async def incrby(self, key, amount=1):
        val = self.data.get(key, 0)
        try:
            val = int(val) + amount
        except ValueError:
            val = amount
        self.data[key] = val
        return val

    async def expire(self, key, time):
        return True

redis_client = None

def get_redis_client():
    global redis_client
    if redis_client is not None:
        return redis_client
        
    if settings.REDIS_URL:
        try:
            redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            print("[INFO] Redis connection pool initialized.")
        except Exception as e:
            print(f"[WARNING] Failed to connect to Redis, falling back to MockRedis: {e}")
            redis_client = MockRedis()
    else:
        print("[INFO] No REDIS_URL configured, initialized MockRedis.")
        redis_client = MockRedis()
        
    return redis_client
