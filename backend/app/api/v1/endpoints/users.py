from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.api.deps import get_current_user, get_current_active_user
from app.models.models import User, Profile, Friendship, FriendRequest, Report
from app.schemas.user import (
    UserProfileResponse, ProfileUpdate, DiscoverUserResponse,
    ChangeEmailRequest, ChangeEmailVerify, ChangePhoneRequest, ChangePhoneVerify,
    UserReportCreate, UserReportResponse, KeyBackupUpload, KeyBackupResponse,
    RecoveryPhraseResponse
)
from app.services.media_service import upload_file_to_storage
from app.services.otp_service import create_otp, verify_otp

router = APIRouter()

@router.get("/", response_model=List[DiscoverUserResponse])
async def get_users(
    search: Optional[str] = None,
    online_only: bool = False,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    query = db.query(User).filter(User.id != current_user.id, User.is_verified == True)
    
    if search:
        search_filter = f"%{search}%"
        query = query.join(User.profile).filter(
            (User.username.ilike(search_filter)) |
            (User.email.ilike(search_filter)) |
            (User.phone.ilike(search_filter)) |
            (Profile.full_name.ilike(search_filter))
        )
        
    if online_only:
        from app.services.presence_service import get_online_users
        online_ids = await get_online_users()
        query = query.filter(User.id.in_(list(online_ids)))
        
    users = query.offset(skip).limit(limit).all()
    
    # Populate presence data from Redis
    from app.services.presence_service import populate_users_presence
    await populate_users_presence(users)
    
    # Query relationships in batch to avoid N+1 queries
    friendships = db.query(Friendship).filter(
        or_(Friendship.user1_id == current_user.id, Friendship.user2_id == current_user.id)
    ).all()
    
    friends_map = {}
    for fs in friendships:
        friend_id = fs.user2_id if fs.user1_id == current_user.id else fs.user1_id
        friends_map[friend_id] = ("friends", fs.id)
        
    requests = db.query(FriendRequest).filter(
        or_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == current_user.id)
    ).all()
    
    requests_map = {}
    for req in requests:
        if req.sender_id == current_user.id:
            requests_map[req.receiver_id] = ("pending_sent", req.id)
        else:
            requests_map[req.sender_id] = ("pending_received", req.id)
            
    # Serialize results
    results = []
    for u in users:
        rel_status = "none"
        req_id = None
        
        if u.id in friends_map:
            rel_status, req_id = friends_map[u.id]
        elif u.id in requests_map:
            rel_status, req_id = requests_map[u.id]
            
        user_data = DiscoverUserResponse.model_validate(u)
        user_data.relationship_status = rel_status
        user_data.request_id = req_id
        results.append(user_data)
        
    return results


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    from app.services.presence_service import populate_users_presence
    await populate_users_presence([current_user])
    return current_user


@router.put("/me", response_model=UserProfileResponse)
async def update_my_profile(
    profile_in: ProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    profile = current_user.profile
    if not profile:
        profile = Profile(user_id=current_user.id, full_name=current_user.username)
        db.add(profile)
        db.flush()
        
    update_data = profile_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)
        
    db.commit()
    db.refresh(current_user)
    from app.services.presence_service import populate_users_presence
    await populate_users_presence([current_user])
    return current_user


@router.post("/me/avatar", response_model=UserProfileResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed for avatar."
        )
        
    from app.services.file_scanner import scan_file
    try:
        scan_file(file)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
        
    url = upload_file_to_storage(file, folder="avatars")
    
    profile = current_user.profile
    if not profile:
        profile = Profile(user_id=current_user.id, full_name=current_user.username)
        db.add(profile)
        db.flush()
        
    profile.avatar_url = url
    db.commit()
    db.refresh(current_user)
    from app.services.presence_service import populate_users_presence
    await populate_users_presence([current_user])
    return current_user


@router.post("/me/cover", response_model=UserProfileResponse)
async def upload_cover(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files are allowed for cover image."
        )
        
    from app.services.file_scanner import scan_file
    try:
        scan_file(file)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
        
    url = upload_file_to_storage(file, folder="covers")
    
    profile = current_user.profile
    if not profile:
        profile = Profile(user_id=current_user.id, full_name=current_user.username)
        db.add(profile)
        db.flush()
        
    profile.cover_url = url
    db.commit()
    db.refresh(current_user)
    from app.services.presence_service import populate_users_presence
    await populate_users_presence([current_user])
    return current_user


@router.get("/{username}", response_model=UserProfileResponse)
async def get_user_by_username(
    username: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    from app.services.presence_service import populate_users_presence
    await populate_users_presence([user])
    return user


@router.post("/me/change-email-request")
def change_email_request(
    request_in: ChangeEmailRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify not registered already
    if db.query(User).filter(User.email == request_in.new_email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address already registered"
        )
    # Generate OTP with purpose 'change_email'
    create_otp(db, request_in.new_email, "change_email")
    return {"message": "OTP sent to the new email address. Please verify it to complete the change."}


@router.post("/me/change-email-verify")
def change_email_verify(
    verify_in: ChangeEmailVerify,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify OTP
    is_valid = verify_otp(db, verify_in.new_email, verify_in.code, "change_email")
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code"
        )
    # Update email
    current_user.email = verify_in.new_email
    db.commit()
    db.refresh(current_user)
    return {"message": "Email address updated successfully"}


@router.post("/me/change-phone-request")
def change_phone_request(
    request_in: ChangePhoneRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify not registered already
    if request_in.new_phone and db.query(User).filter(User.phone == request_in.new_phone).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number already registered"
        )
    # Generate OTP with purpose 'change_phone'
    create_otp(db, request_in.new_phone, "change_phone")
    return {"message": "OTP sent to the new phone number. Please verify it to complete the change."}


@router.post("/me/change-phone-verify")
def change_phone_verify(
    verify_in: ChangePhoneVerify,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Verify OTP
    is_valid = verify_otp(db, verify_in.new_phone, verify_in.code, "change_phone")
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP code"
        )
    # Update phone
    current_user.phone = verify_in.new_phone
    db.commit()
    db.refresh(current_user)
    return {"message": "Phone number updated successfully"}


@router.post("/report", response_model=UserReportResponse, status_code=status.HTTP_201_CREATED)
def report_user(
    report_in: UserReportCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if report_in.reported_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot report yourself"
        )
        
    reported_user = db.query(User).filter(User.id == report_in.reported_id).first()
    if not reported_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reported user not found"
        )
        
    report = Report(
        reporter_id=current_user.id,
        reported_id=report_in.reported_id,
        reason=report_in.reason,
        status="pending"
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("/me/recovery-phrase", response_model=RecoveryPhraseResponse)
def get_recovery_phrase(
    current_user: User = Depends(get_current_active_user)
):
    """
    Generates a secure 12-word recovery phrase for client-side key derivation.
    """
    from app.services.e2ee_service import generate_recovery_phrase
    phrase = generate_recovery_phrase()
    return {"recovery_phrase": phrase}


@router.post("/me/key-backup", response_model=KeyBackupResponse)
def upload_key_backup(
    backup_in: KeyBackupUpload,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Saves the user's encrypted private key backup.
    """
    from app.services.e2ee_service import store_key_backup
    store_key_backup(db, current_user.id, backup_in.ciphertext)
    return {"ciphertext": backup_in.ciphertext, "status": "success"}


@router.get("/me/key-backup", response_model=KeyBackupResponse)
def download_key_backup(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves the user's encrypted private key backup.
    """
    from app.services.e2ee_service import retrieve_key_backup
    ciphertext = retrieve_key_backup(db, current_user.id)
    if not ciphertext:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No private key backup found for this user."
        )
    return {"ciphertext": ciphertext, "status": "success"}


