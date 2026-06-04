import random
import datetime
import smtplib
import os
import threading
from email.mime.text import MIMEText
from sqlalchemy.orm import Session
from app.models.models import OTP
from dotenv import load_dotenv

load_dotenv()

# ✉️ MAILER CONFIG — chat.end2end@gmail.com
EMAIL_USER = os.getenv("EMAIL_USER", "chat.end2end@gmail.com")
EMAIL_PASS = os.getenv("EMAIL_PASS", "fgsd xfpy oazb fcyu")


def generate_otp_code() -> str:
    return f"{random.randint(100000, 999999)}"


def _send_otp_email(target_email: str, code: str, purpose: str):
    """Sends OTP email via Gmail SMTP. Runs in background thread."""
    try:
        purpose_label = "Password Reset" if purpose == "password_reset" else "Email Verification"
        purpose_icon = "🔒" if purpose == "password_reset" else "🔱"

        html_content = f"""
        <html>
        <body style="background-color:#050505;color:#ffffff;font-family:'Inter',sans-serif;padding:40px;text-align:center;">
            <div style="max-width:500px;margin:0 auto;background:#0a0a0a;padding:40px;border-radius:40px;border:1px solid #1a1a1a;box-shadow:0 20px 40px rgba(0,0,0,0.5);">
                <h1 style="font-size:48px;margin:0 0 20px 0;">{purpose_icon}</h1>
                <h2 style="color:#00f2ff;letter-spacing:2px;font-weight:950;margin:0 0 10px 0;">CONNECT-ON</h2>
                <p style="color:#64748b;font-size:14px;font-weight:bold;margin-bottom:30px;">{purpose_label.upper()}</p>

                <div style="background:rgba(255,255,255,0.03);border:2px dashed #9333ea;padding:25px;border-radius:20px;margin-bottom:30px;">
                    <span style="font-size:36px;font-weight:950;letter-spacing:12px;color:#ffffff;">{code}</span>
                </div>

                <p style="color:#64748b;font-size:12px;line-height:1.6;">
                    Use this OTP to complete your {purpose_label.lower()}.<br/>
                    <b>This code expires in 10 minutes. Do NOT share it with anyone.</b>
                </p>

                <div style="margin-top:40px;border-top:1px solid #1a1a1a;padding-top:20px;">
                    <span style="color:#334155;font-size:10px;font-weight:900;letter-spacing:2px;">CONNECT-ON • Secure Platform</span>
                </div>
            </div>
        </body>
        </html>
        """

        msg = MIMEText(html_content, "html")
        msg["Subject"] = f"{purpose_icon} Your CONNECT-ON {purpose_label} Code"
        msg["From"] = f"CONNECT-ON <{EMAIL_USER}>"
        msg["To"] = target_email

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.send_message(msg)

        print(f"[OTP EMAIL] [SUCCESS] Sent to {target_email} | Purpose: {purpose}")

    except Exception as e:
        print(f"[OTP EMAIL] [ERROR] Failed to send to {target_email}: {e}")


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

    # Send email in background thread (non-blocking)
    thread = threading.Thread(target=_send_otp_email, args=(email, code, purpose), daemon=True)
    thread.start()

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
