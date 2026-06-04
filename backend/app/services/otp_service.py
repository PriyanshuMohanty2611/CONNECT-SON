import random
import datetime
from sqlalchemy.orm import Session
from app.models.models import OTP, User
from app.services.email_service import send_vault_otp_email

def generate_otp_code() -> str:
    return f"{random.randint(100000, 999999)}"

def create_otp(db: Session, email: str, purpose: str) -> str:
    # Delete old OTPs for this email + purpose (prevent spam reuse)
    db.query(OTP).filter(OTP.email == email, OTP.purpose == purpose).delete()

    code = generate_otp_code()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)

    otp_record = OTP(
        email=email,
        code=code,
        purpose=purpose,
        expires_at=expires_at
    )

    db.add(otp_record)
    db.commit()

    # Try to fetch username or profile full name dynamically
    username = "Priyanshu"
    try:
        db_user = db.query(User).filter(User.email == email).first()
        if db_user:
            if db_user.profile and db_user.profile.full_name:
                username = db_user.profile.full_name.split()[0]
            else:
                username = db_user.username
    except Exception as e:
        print(f"[OTP SERVICE] Failed to query user name: {e}")

    # Send Premium Vault OTP email (non-blocking, handled inside send_vault_otp_email)
    send_vault_otp_email(
        target_email=email,
        code=code,
        purpose=purpose,
        username=username
    )

    print(f"\n==========================================")
    print(f"OTP EMAIL QUEUED TO: {email}")
    print(f"PURPOSE: {purpose.upper()}")
    print(f"CODE: {code}")
    print(f"EXPIRES IN: 10 minutes")
    print(f"==========================================\n")

    # Developer utility: Write to file in workspace root for real-time access
    try:
        with open("otp_code.txt", "w", encoding="utf-8") as f:
            f.write(code)
    except Exception as e:
        print(f"[DEVELOPER WARNING] Failed to write OTP to otp_code.txt: {e}")

    return code


def verify_otp(db: Session, email: str, code: str, purpose: str) -> bool:
    now = datetime.datetime.utcnow()
    otp_record = db.query(OTP).filter(
        OTP.email == email,
        OTP.code == code,
        OTP.purpose == purpose,
        OTP.expires_at > now
    ).first()

    if not otp_record:
        return False

    # Valid — delete after use (one-time use only)
    db.delete(otp_record)
    db.commit()
    return True
