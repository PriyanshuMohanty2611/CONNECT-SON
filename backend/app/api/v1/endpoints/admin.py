from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.database import get_db
from app.api.deps import get_current_admin_user
from app.models.models import User, Report, AuditLog, UserSession
from app.services.backup_service import get_backups_list, trigger_db_backup
from app.services.audit_service import log_action
from pydantic import BaseModel

router = APIRouter()

class ReportActionRequest(BaseModel):
    action: str  # 'resolve' or 'dismiss'
    suspend_user: bool = False

@router.get("/reports")
def get_reports(
    current_admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    reports = db.query(Report).order_by(desc(Report.created_at)).all()
    
    serialized = []
    for r in reports:
        reporter = db.query(User).filter(User.id == r.reporter_id).first()
        reported = db.query(User).filter(User.id == r.reported_id).first()
        serialized.append({
            "id": r.id,
            "reporter_username": reporter.username if reporter else "deleted_user",
            "reported_id": r.reported_id,
            "reported_username": reported.username if reported else "deleted_user",
            "reason": r.reason,
            "status": r.status,
            "created_at": r.created_at.isoformat()
        })
    return serialized

@router.post("/reports/{report_id}/action")
def action_report(
    report_id: str,
    req: ReportActionRequest,
    current_admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
        
    if req.action not in ["resolve", "dismiss"]:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'resolve' or 'dismiss'.")
        
    report.status = "resolved" if req.action == "resolve" else "dismissed"
    
    reported_user = db.query(User).filter(User.id == report.reported_id).first()
    if req.suspend_user and reported_user:
        # Toggling is_verified to False suspends the user's login access
        reported_user.is_verified = False
        # Revoke all their active sessions immediately in DB and Redis
        db.query(UserSession).filter(UserSession.user_id == reported_user.id).update(
            {UserSession.is_revoked: True}, synchronize_session=False
        )
        from app.services.session_service import revoke_all_user_redis_sessions
        revoke_all_user_redis_sessions(reported_user.id)
        log_action(db, f"admin_suspend_user_{reported_user.username}", current_admin.id)
        
    db.commit()
    log_action(db, f"admin_report_action_{req.action}_{report_id}", current_admin.id)
    return {"message": f"Report successfully {report.status}"}

@router.get("/audit-logs")
def get_audit_logs(
    skip: int = 0,
    limit: int = 100,
    current_admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    logs = db.query(AuditLog).order_by(desc(AuditLog.created_at)).offset(skip).limit(limit).all()
    
    serialized = []
    for log in logs:
        user = db.query(User).filter(User.id == log.user_id).first() if log.user_id else None
        serialized.append({
            "id": log.id,
            "username": user.username if user else "anonymous",
            "action": log.action,
            "ip_address": log.ip_address,
            "device_info": log.device_info,
            "created_at": log.created_at.isoformat()
        })
    return serialized

@router.get("/backups")
def get_backups(
    current_admin: User = Depends(get_current_admin_user)
):
    return get_backups_list()

@router.post("/backup")
def run_backup(
    current_admin: User = Depends(get_current_admin_user)
):
    try:
        res = trigger_db_backup()
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/users")
def get_all_users_admin(
    current_admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    users = db.query(User).order_by(User.username).all()
    
    serialized = []
    for u in users:
        serialized.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "phone": u.phone,
            "is_verified": u.is_verified,
            "is_admin": u.is_admin,
            "presence_status": u.profile.presence_status if u.profile else "offline",
            "created_at": u.created_at.isoformat()
        })
    return serialized

@router.post("/users/{user_id}/toggle-status")
def toggle_user_verification(
    user_id: str,
    current_admin: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="You cannot toggle your own status.")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.is_verified = not user.is_verified
    
    # If suspended, revoke all active sessions immediately in DB and Redis
    if not user.is_verified:
        db.query(UserSession).filter(UserSession.user_id == user.id).update(
            {UserSession.is_revoked: True}, synchronize_session=False
        )
        from app.services.session_service import revoke_all_user_redis_sessions
        revoke_all_user_redis_sessions(user.id)
        
    db.commit()
    status_str = "activated" if user.is_verified else "deactivated/suspended"
    log_action(db, f"admin_toggle_user_{user.username}_{status_str}", current_admin.id)
    return {"message": f"User successfully {status_str}", "is_verified": user.is_verified}
