import hashlib
import json
from sqlalchemy.orm import Session
from app.models.models import AuditLog
from fastapi import Request

def log_action(
    db: Session,
    action: str,
    user_id: str = None,
    request: Request = None
):
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    device_info = user_agent[:255] if user_agent else None
    
    # 1. Fetch previous log's hash (or seed hash if no logs exist)
    latest_log = db.query(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).first()
    previous_hash = latest_log.current_hash if (latest_log and latest_log.current_hash) else "0" * 64
    
    # 2. Formulate stable JSON payload representation
    payload_dict = {
        "user_id": user_id or "",
        "action": action,
        "ip_address": ip_address or "",
        "device_info": device_info or ""
    }
    payload_str = json.dumps(payload_dict, sort_keys=True)
    
    # 3. Compute SHA256 current hash
    hash_input = f"{payload_str}{previous_hash}".encode("utf-8")
    current_hash = hashlib.sha256(hash_input).hexdigest()
    
    log = AuditLog(
        user_id=user_id,
        action=action,
        ip_address=ip_address,
        device_info=device_info,
        previous_hash=previous_hash,
        current_hash=current_hash
    )
    db.add(log)
    db.commit()
    try:
        from app.services.cleanup_service import cap_records
        cap_records(db, AuditLog, {}, 100)
    except Exception as cleanup_err:
        print(f"[CLEANUP ERROR] Failed to cap audit logs: {cleanup_err}")

def verify_audit_chain(db: Session) -> bool:
    """
    Verifies the cryptographic integrity of the entire audit log chain.
    Returns True if valid, False if any log has been tampered with or modified.
    """
    logs = db.query(AuditLog).order_by(AuditLog.created_at.asc(), AuditLog.id.asc()).all()
    expected_prev = "0" * 64
    for log in logs:
        # Reconstruct original payload representation
        payload_dict = {
            "user_id": log.user_id or "",
            "action": log.action,
            "ip_address": log.ip_address or "",
            "device_info": log.device_info or ""
        }
        payload_str = json.dumps(payload_dict, sort_keys=True)
        
        # Verify previous_hash
        if log.previous_hash != expected_prev:
            return False
            
        # Recompute SHA256 current hash
        hash_input = f"{payload_str}{expected_prev}".encode("utf-8")
        calc_hash = hashlib.sha256(hash_input).hexdigest()
        
        if log.current_hash != calc_hash:
            return False
            
        expected_prev = log.current_hash
    return True

