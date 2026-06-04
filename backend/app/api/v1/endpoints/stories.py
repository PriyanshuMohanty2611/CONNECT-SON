import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.models import User, Friendship, Story, StoryView
from app.schemas.story import StoryResponse, StoryViewResponse
from app.services.media_service import upload_file_to_storage

router = APIRouter()

@router.post("/", response_model=StoryResponse, status_code=status.HTTP_201_CREATED)
def upload_story(
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    filter_preset: Optional[str] = Form("none"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Validation checks
    # Whitelist MIME types
    if not file.content_type.startswith("image/") and not file.content_type.startswith("video/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image or video files are allowed for stories."
        )
        
    # File size limit (20MB)
    MAX_SIZE = 20 * 1024 * 1024
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 20MB limit."
        )
        
    # Upload to storage
    media_url = upload_file_to_storage(file, folder="stories")
    media_type = "image" if file.content_type.startswith("image/") else "video"
    
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    
    db_story = Story(
        user_id=current_user.id,
        media_url=media_url,
        media_type=media_type,
        filter_preset=filter_preset,
        caption=caption,
        expires_at=expires_at
    )
    
    db.add(db_story)
    db.commit()
    db.refresh(db_story)
    
    return db_story


@router.get("/", response_model=List[StoryResponse])
def get_active_stories(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Get active friendships to find friend IDs
    friendships = db.query(Friendship).filter(
        or_(
            Friendship.user1_id == current_user.id,
            Friendship.user2_id == current_user.id
        ),
        Friendship.is_blocked == False
    ).all()
    
    user_ids = [current_user.id]
    for fs in friendships:
        friend_id = fs.user2_id if fs.user1_id == current_user.id else fs.user1_id
        user_ids.append(friend_id)
        
    # Query stories belonging to current_user or friends, which are not expired
    now = datetime.datetime.utcnow()
    stories = db.query(Story).filter(
        Story.user_id.in_(user_ids),
        Story.expires_at > now
    ).order_by(desc(Story.created_at)).all()
    
    return stories


@router.post("/{story_id}/view")
def view_story(
    story_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Check if story exists
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found"
        )
        
    # Check if view already logged
    existing_view = db.query(StoryView).filter(
        StoryView.story_id == story_id,
        StoryView.viewer_id == current_user.id
    ).first()
    
    if not existing_view:
        new_view = StoryView(
            story_id=story_id,
            viewer_id=current_user.id
        )
        db.add(new_view)
        db.commit()
        
    return {"message": "Story view registered"}


@router.get("/{story_id}/views", response_model=List[StoryViewResponse])
def get_story_views(
    story_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    story = db.query(Story).filter(Story.id == story_id).first()
    if not story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found"
        )
        
    if story.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view metrics of your own story"
        )
        
    views = db.query(StoryView).filter(StoryView.story_id == story_id).all()
    return views
