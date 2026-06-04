from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.models import User, Friendship
from sqlalchemy import or_, and_
from app.services.ai_memory import generate_relationship_recap

router = APIRouter()

@router.get("/recap/{partner_id}")
async def get_ai_recap(
    partner_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify they are friends
    fs = db.query(Friendship).filter(
        or_(
            and_(Friendship.user1_id == current_user.id, Friendship.user2_id == partner_id),
            and_(Friendship.user1_id == partner_id, Friendship.user2_id == current_user.id)
        ),
        Friendship.is_blocked == False
    ).first()
    
    if not fs:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view the AI Memory of this user."
        )
        
    recap = generate_relationship_recap(db, current_user.id, partner_id)
    if "error" in recap:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=recap["error"]
        )
        
    return recap
