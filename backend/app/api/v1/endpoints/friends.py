from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models.models import (
    User, FriendRequest, Friendship, BlockedUser, 
    Notification, Chat, chat_participants
)
from app.schemas.user import UserProfileResponse
from app.schemas.friend import FriendRequestResponse
from app.services.notification_service import create_notification

router = APIRouter()

@router.get("/", response_model=List[UserProfileResponse])
async def get_friends(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Query mutual friendships
    friendships = db.query(Friendship).filter(
        or_(
            Friendship.user1_id == current_user.id,
            Friendship.user2_id == current_user.id
        ),
        Friendship.is_blocked == False
    ).all()
    
    friend_ids = []
    for fs in friendships:
        if fs.user1_id == current_user.id:
            friend_ids.append(fs.user2_id)
        else:
            friend_ids.append(fs.user1_id)
            
    if not friend_ids:
        return []
        
    friends = db.query(User).filter(User.id.in_(friend_ids)).all()
    from app.services.presence_service import populate_users_presence
    await populate_users_presence(friends)
    return friends


@router.get("/requests/pending", response_model=List[FriendRequestResponse])
def get_pending_incoming_requests(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    requests = db.query(FriendRequest).filter(
        FriendRequest.receiver_id == current_user.id,
        FriendRequest.status == "pending"
    ).all()
    return requests


@router.get("/requests/sent", response_model=List[FriendRequestResponse])
def get_pending_outgoing_requests(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    requests = db.query(FriendRequest).filter(
        FriendRequest.sender_id == current_user.id,
        FriendRequest.status == "pending"
    ).all()
    return requests


@router.post("/request/{receiver_id}")
def send_friend_request(
    receiver_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if receiver_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot send a friend request to yourself"
        )
        
    receiver = db.query(User).filter(User.id == receiver_id).first()
    if not receiver:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Receiver user not found"
        )
        
    # Check if blocked
    is_blocked = db.query(BlockedUser).filter(
        or_(
            (BlockedUser.blocker_id == current_user.id) & (BlockedUser.blocked_id == receiver_id),
            (BlockedUser.blocker_id == receiver_id) & (BlockedUser.blocked_id == current_user.id)
        )
    ).first()
    if is_blocked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action blocked"
        )

    # Check if already friends
    existing_friendship = db.query(Friendship).filter(
        or_(
            (Friendship.user1_id == current_user.id) & (Friendship.user2_id == receiver_id),
            (Friendship.user1_id == receiver_id) & (Friendship.user2_id == current_user.id)
        )
    ).first()
    if existing_friendship:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already friends with this user"
        )

    # Check if existing request
    existing_request = db.query(FriendRequest).filter(
        or_(
            (FriendRequest.sender_id == current_user.id) & (FriendRequest.receiver_id == receiver_id),
            (FriendRequest.sender_id == receiver_id) & (FriendRequest.receiver_id == current_user.id)
        )
    ).first()
    
    if existing_request:
        if existing_request.status == "pending":
            return {"message": "Friend request already pending"}
        elif existing_request.status == "accepted":
            return {"message": "Already friends"}
        else:
            # If rejected previously, reset to pending
            existing_request.status = "pending"
            existing_request.sender_id = current_user.id
            existing_request.receiver_id = receiver_id
            db.commit()
            
            # Send notification for re-sent request
            create_notification(
                db=db,
                user_id=receiver_id,
                type="friend_request",
                sender_id=current_user.id,
                target_id=existing_request.id,
                background_tasks=background_tasks
            )
            return {"message": "Friend request sent"}

    # Create new friend request
    new_request = FriendRequest(
        sender_id=current_user.id,
        receiver_id=receiver_id,
        status="pending"
    )
    db.add(new_request)
    db.flush()

    # Trigger notification via notification service
    create_notification(
        db=db,
        user_id=receiver_id,
        type="friend_request",
        sender_id=current_user.id,
        target_id=new_request.id,
        background_tasks=background_tasks
    )

    return {"message": "Friend request sent successfully"}


@router.post("/accept/{request_id}")
def accept_friend_request(
    request_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    request = db.query(FriendRequest).filter(
        FriendRequest.id == request_id,
        FriendRequest.receiver_id == current_user.id
    ).first()
    
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend request not found"
        )
        
    if request.status == "accepted":
        return {"message": "Friend request already accepted"}

    request.status = "accepted"
    
    # Establish friendship (order IDs to keep uniqueness simpler)
    u1, u2 = sorted([request.sender_id, request.receiver_id])
    friendship = Friendship(
        user1_id=u1,
        user2_id=u2
    )
    db.add(friendship)

    # Check if Direct Chat already exists. If not, auto-create one.
    existing_chat = db.query(Chat).filter(Chat.type == "direct").filter(
        Chat.participants.any(id=request.sender_id) & Chat.participants.any(id=request.receiver_id)
    ).first()
    
    if not existing_chat:
        # Create chat
        new_chat = Chat(type="direct")
        db.add(new_chat)
        db.flush()
        
        # Link participants
        p1 = chat_participants.insert().values(chat_id=new_chat.id, user_id=request.sender_id)
        p2 = chat_participants.insert().values(chat_id=new_chat.id, user_id=request.receiver_id)
        db.execute(p1)
        db.execute(p2)
        
    # Trigger notification to the sender
    create_notification(
        db=db,
        user_id=request.sender_id,
        type="friend_accept",
        sender_id=current_user.id,
        target_id=friendship.id,
        background_tasks=background_tasks
    )

    try:
        from app.services.email_service import send_friend_request_accepted_email
        # recipient details (the one who sent the request)
        recipient_user = request.sender
        recipient_name = recipient_user.profile.full_name if recipient_user.profile and recipient_user.profile.full_name else recipient_user.username
        
        # friend details (current_user who is accepting)
        friend_name = current_user.profile.full_name if current_user.profile and current_user.profile.full_name else current_user.username
        friend_avatar = current_user.profile.avatar_url if current_user.profile else None

        send_friend_request_accepted_email(
            target_email=recipient_user.email,
            username=recipient_name,
            friend_name=friend_name,
            friend_avatar_url=friend_avatar
        )
    except Exception as email_err:
        print(f"[ERROR] Failed to send friend accept email: {email_err}")

    return {"message": "Friend request accepted"}


@router.post("/reject/{request_id}")
def reject_friend_request(
    request_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    request = db.query(FriendRequest).filter(
        FriendRequest.id == request_id,
        FriendRequest.receiver_id == current_user.id
    ).first()
    
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend request not found"
        )
        
    request.status = "rejected"
    db.commit()
    return {"message": "Friend request rejected"}


@router.delete("/{friend_id}")
def remove_friend(
    friend_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Find friendship
    u1, u2 = sorted([current_user.id, friend_id])
    friendship = db.query(Friendship).filter(
        Friendship.user1_id == u1,
        Friendship.user2_id == u2
    ).first()
    
    if not friendship:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friendship not found"
        )
        
    db.delete(friendship)
    
    # Delete requests
    db.query(FriendRequest).filter(
        or_(
            (FriendRequest.sender_id == current_user.id) & (FriendRequest.receiver_id == friend_id),
            (FriendRequest.sender_id == friend_id) & (FriendRequest.receiver_id == current_user.id)
        )
    ).delete()
    
    db.commit()
    return {"message": "Friend removed successfully"}


@router.post("/block/{user_id}")
def block_user(
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot block yourself"
        )
        
    # Check if already blocked
    existing_block = db.query(BlockedUser).filter(
        BlockedUser.blocker_id == current_user.id,
        BlockedUser.blocked_id == user_id
    ).first()
    
    if existing_block:
        return {"message": "User already blocked"}

    # Save block
    block = BlockedUser(blocker_id=current_user.id, blocked_id=user_id)
    db.add(block)
    
    # Break friendship
    u1, u2 = sorted([current_user.id, user_id])
    db.query(Friendship).filter(
        Friendship.user1_id == u1,
        Friendship.user2_id == u2
    ).delete()
    
    # Delete pending request
    db.query(FriendRequest).filter(
        or_(
            (FriendRequest.sender_id == current_user.id) & (FriendRequest.receiver_id == user_id),
            (FriendRequest.sender_id == user_id) & (FriendRequest.receiver_id == current_user.id)
        )
    ).delete()
    
    db.commit()
    return {"message": "User blocked successfully"}


@router.get("/blocked", response_model=List[UserProfileResponse])
async def get_blocked_users(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    blocked_relations = db.query(BlockedUser).filter(BlockedUser.blocker_id == current_user.id).all()
    blocked_ids = [rel.blocked_id for rel in blocked_relations]
    if not blocked_ids:
        return []
    users = db.query(User).filter(User.id.in_(blocked_ids)).all()
    from app.services.presence_service import populate_users_presence
    await populate_users_presence(users)
    return users


@router.post("/unblock/{user_id}")
def unblock_user(
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    block = db.query(BlockedUser).filter(
        BlockedUser.blocker_id == current_user.id,
        BlockedUser.blocked_id == user_id
    ).first()
    
    if not block:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blocked relationship not found"
        )
        
    db.delete(block)
    db.commit()
    return {"message": "User unblocked successfully"}

