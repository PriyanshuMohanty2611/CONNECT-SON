import time
from fastapi import Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.redis_client import get_redis_client, MockRedis
from app.core.security import decode_token

LUA_RATE_LIMITER = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local bucket = redis.call('hgetall', key)
local tokens = capacity
local last_refill = now

if #bucket > 0 then
    local data = {}
    for i = 1, #bucket, 2 do
        data[bucket[i]] = bucket[i+1]
    end
    tokens = tonumber(data['tokens'])
    last_refill = tonumber(data['last_refill'])
end

local elapsed = math.max(0, now - last_refill)
local refilled = elapsed * refill_rate
tokens = math.min(capacity, tokens + refilled)
last_refill = now

if tokens < 1.0 then
    redis.call('hset', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('expire', key, 86400)
    return 0
else
    tokens = tokens - 1.0
    redis.call('hset', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('expire', key, 86400)
    return 1
end
"""

class RateLimiterMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, capacity: int = 40, refill_rate: float = 0.5):
        """
        capacity: Max burst capacity of requests
        refill_rate: Number of tokens refilled per second
        """
        super().__init__(app)
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.buckets = {} # Local fallback: ip/user -> {"tokens": float, "last_refill": float}

    async def dispatch(self, request: Request, call_next):
        import os
        # Apply rate limiting to all auth endpoints
        if not request.url.path.startswith("/api/v1/auth") or os.getenv("TESTING") == "True":
            return await call_next(request)

        # Try to identify user by JWT token, else fall back to IP
        user_id = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = decode_token(token)
                if payload:
                    user_id = payload.get("sub")
            except Exception:
                pass

        ip = request.client.host if request.client else "unknown"
        identifier = f"user:{user_id}" if user_id else f"ip:{ip}"
        redis_key = f"rate_limit:{identifier}"
        now = time.time()

        redis = get_redis_client()
        use_fallback = isinstance(redis, MockRedis)

        if not use_fallback:
            try:
                # Execute atomic Lua script rate limiter on Redis
                allowed = await redis.eval(LUA_RATE_LIMITER, 1, redis_key, self.capacity, self.refill_rate, now)
                if allowed == 0:
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={"detail": "Too many requests. Please try again later."}
                    )
                return await call_next(request)
            except Exception as e:
                # Log error and fall back to local memory rate limiting
                print(f"[WARNING] Redis rate limiter failed, falling back to local memory: {e}")
                use_fallback = True

        # Local memory fallback token bucket implementation
        if identifier not in self.buckets:
            self.buckets[identifier] = {
                "tokens": float(self.capacity),
                "last_refill": now
            }

        bucket = self.buckets[identifier]
        elapsed = now - bucket["last_refill"]
        refilled = elapsed * self.refill_rate
        bucket["tokens"] = min(float(self.capacity), bucket["tokens"] + refilled)
        bucket["last_refill"] = now

        if bucket["tokens"] < 1.0:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please try again later."}
            )

        bucket["tokens"] -= 1.0
        return await call_next(request)
