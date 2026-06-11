from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_active_user, get_current_admin_user
from app.models.models import User
from app.services.ai_copilot import generate_copilot_summary, get_ai_metrics, reset_ai_metrics

router = APIRouter()

@router.get("/")
async def get_copilot(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get AI Copilot dashboard summary.
    - First call: generates and caches AI summary (15 min TTL)
    - Subsequent calls: returns cached summary if stats unchanged
    - Falls back to rule-based engine if OpenAI unavailable or rate-limited
    """
    summary = await generate_copilot_summary(current_user, db)
    return summary


@router.get("/metrics")
def get_copilot_metrics(
    _: User = Depends(get_current_admin_user)
):
    """
    Admin-only: Get AI usage metrics.
    Returns total requests, cache hits, OpenAI calls, tokens used, estimated cost saved.
    """
    return get_ai_metrics()


@router.post("/metrics/reset")
def reset_copilot_metrics(
    _: User = Depends(get_current_admin_user)
):
    """Admin-only: Reset all AI usage metric counters."""
    reset_ai_metrics()
    return {"message": "AI usage metrics have been reset."}
