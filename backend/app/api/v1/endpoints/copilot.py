from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.models import User
from app.services.ai_copilot import generate_copilot_summary

router = APIRouter()

@router.get("/")
async def get_copilot(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    summary = await generate_copilot_summary(current_user, db)
    return summary
