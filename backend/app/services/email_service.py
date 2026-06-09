import smtplib
import os
import datetime
import threading
from email.mime.text import MIMEText
from sqlalchemy.orm import Session
from app.core.config import settings

# ✉️ Mailer Configuration
EMAIL_USER = os.getenv("EMAIL_USER") or "chat.end2end@gmail.com"
EMAIL_PASS = os.getenv("EMAIL_PASS") or "fgsd xfpy oazb fcyu"

# Common HTML Head with fonts, styles, reset
HTML_HEADER_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CONNECT-ON</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        body {
            background-color: #070B1A !important;
            margin: 0;
            padding: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #FFFFFF;
            -webkit-font-smoothing: antialiased;
        }
        table {
            border-collapse: collapse;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        .glass-card {
            background-color: #101935;
            background-image: radial-gradient(circle at top left, rgba(124, 77, 255, 0.15), transparent 60%),
                              radial-gradient(circle at bottom right, rgba(255, 77, 166, 0.1), transparent 60%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            padding: 40px 30px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            text-align: center;
        }
        .logo-title {
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 4px;
            margin: 0;
            background: linear-gradient(135deg, #FFFFFF 0%, #A5B4FC 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-transform: uppercase;
        }
        .logo-subtitle {
            font-size: 10px;
            font-weight: 700;
            color: #8A99C0;
            letter-spacing: 5px;
            margin-top: 5px;
            margin-bottom: 30px;
            text-transform: uppercase;
        }
        .divider {
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
            margin: 30px 0;
        }
        .welcome-badge {
            display: inline-block;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.05);
            padding: 10px 24px;
            border-radius: 99px;
            font-size: 14px;
            font-weight: 600;
            color: #E2E8F0;
            margin-bottom: 25px;
        }
        .otp-display {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(124, 77, 255, 0.25);
            padding: 24px;
            border-radius: 16px;
            font-size: 42px;
            font-weight: 800;
            letter-spacing: 12px;
            color: #FFFFFF;
            text-shadow: 0 0 20px rgba(124, 77, 255, 0.5);
            margin: 25px auto;
            width: fit-content;
            max-width: 80%;
            text-align: center;
        }
        .btn-gradient {
            display: inline-block;
            background: linear-gradient(135deg, #FF4DA6 0%, #7C4DFF 100%);
            color: #FFFFFF !important;
            text-decoration: none;
            padding: 16px 36px;
            border-radius: 14px;
            font-weight: 700;
            font-size: 16px;
            letter-spacing: 1px;
            box-shadow: 0 4px 20px rgba(124, 77, 255, 0.4);
            border: none;
            cursor: pointer;
            margin: 25px 0;
        }
        .meta-list {
            text-align: left;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 16px;
            padding: 20px;
            margin: 25px 0;
        }
        .meta-item {
            font-size: 13px;
            color: #8A99C0;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
        }
        .meta-item:last-child {
            margin-bottom: 0;
        }
        .meta-label {
            font-weight: 600;
            color: #E2E8F0;
            margin-left: 8px;
            margin-right: 15px;
            width: 80px;
            display: inline-block;
        }
        .meta-val {
            color: #A5B4FC;
        }
        .diagram-container {
            margin: 30px 0;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 16px;
            padding: 20px;
            border: 1px dashed rgba(255, 255, 255, 0.08);
        }
        .diagram-step {
            display: inline-block;
            vertical-align: middle;
        }
        .diagram-arrow {
            display: inline-block;
            vertical-align: middle;
            color: #7C4DFF;
            margin: 0 15px;
            font-size: 18px;
        }
        .diagram-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #8A99C0;
            margin-top: 6px;
        }
        .footer-text {
            color: #64748B;
            font-size: 11px;
            line-height: 1.8;
            letter-spacing: 1px;
            margin-top: 40px;
            text-align: center;
        }
        .footer-accent {
            color: #8A99C0;
            font-size: 12px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        
        /* Timeline styles */
        .timeline-card {
            background: rgba(255, 255, 255, 0.03);
            border-left: 3px solid #7C4DFF;
            border-radius: 0 12px 12px 0;
            padding: 16px;
            margin: 15px 0;
            text-align: left;
        }
        .timeline-title {
            font-weight: 700;
            font-size: 15px;
            color: #FFFFFF;
        }
        .timeline-desc {
            font-size: 13px;
            color: #8A99C0;
            margin-top: 5px;
        }
        
        /* Stats styles */
        .stat-grid {
            display: table;
            width: 100%;
            margin: 25px 0;
        }
        .stat-box {
            display: table-cell;
            width: 33.33%;
            padding: 15px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 12px;
            text-align: center;
        }
        .stat-val {
            font-size: 28px;
            font-weight: 800;
            color: #FF4DA6;
            text-shadow: 0 0 15px rgba(255, 77, 166, 0.3);
        }
        .stat-lbl {
            font-size: 11px;
            font-weight: 700;
            color: #8A99C0;
            text-transform: uppercase;
            margin-top: 5px;
            letter-spacing: 0.5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="glass-card">
            <!-- HEADER -->
            <div class="logo-title">CONNECT-ON</div>
            <div class="logo-subtitle">PRIVATE • SECURE • ENCRYPTED</div>
            <div class="divider"></div>
"""

HTML_FOOTER_TEMPLATE = """
            <div class="divider"></div>
            <!-- FOOTER -->
            <div class="footer-accent">Built for meaningful connections.</div>
            <div style="color: #FF4DA6; font-weight: 700; font-size: 12px; letter-spacing: 2px; margin-bottom: 20px;">
                ENCRYPTED. PRIVATE. YOURS.
            </div>
            <div class="footer-text">
                &copy; 2026 CONNECT-ON. All rights reserved.<br/>
                This is a secure automated notification. Do not reply to this email.
            </div>
        </div>
    </div>
</body>
</html>
"""

def _send_email_raw(target_email: str, subject: str, html_body: str):
    """Raw sending helper over SMTP with retry and error handling. Runs in thread."""
    try:
        msg = MIMEText(html_body, "html")
        msg["Subject"] = subject
        msg["From"] = f"CONNECT-ON <{EMAIL_USER}>"
        msg["To"] = target_email

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.send_message(msg)
        print(f"[EMAIL SERVICE] Sent email to {target_email} | Subject: {subject}")
    except Exception as e:
        error_msg = str(e)
        print(f"[EMAIL SERVICE] [ERROR] Failed to send email to {target_email}: {error_msg}")
        try:
            from app.core.database import SessionLocal
            from app.models.models import EventLog
            import json
            import uuid
            
            db = SessionLocal()
            log_record = EventLog(
                id=str(uuid.uuid4()),
                event_type="email_error",
                payload=json.dumps({
                    "target_email": target_email,
                    "subject": subject,
                    "error": error_msg
                })
            )
            db.add(log_record)
            db.commit()
            db.close()
            print(f"[EMAIL SERVICE] Logged email error to database event_logs table.")
        except Exception as log_err:
            print(f"[EMAIL SERVICE] [ERROR] Failed to write email error to event_logs: {log_err}")


def send_async_email(target_email: str, subject: str, html_body: str):
    """Fires the email task in a background daemon thread."""
    thread = threading.Thread(target=_send_email_raw, args=(target_email, subject, html_body), daemon=True)
    thread.start()


def send_vault_otp_email(target_email: str, code: str, purpose: str, username: str = "Priyanshu", device_info: str = "Chrome on Windows", location: str = "Bhubaneswar, India"):
    """Sends Premium Vault OTP login/verification email."""
    purpose_label = "Password Reset" if purpose == "password_reset" else "Email Verification"
    purpose_icon = "🔒" if purpose == "password_reset" else "🔱"
    subject = f"{purpose_icon} Secure Vault Access Code: {code}"
    
    # Format OTP nicely with a space in the middle for Apple-style display (e.g. 845 293)
    formatted_code = code
    if len(code) == 6:
        formatted_code = f"{code[:3]} {code[3:]}"

    body = f"""
    {HTML_HEADER_TEMPLATE}
    
    <div class="welcome-badge">Welcome Back, {username}</div>
    
    <h3 style="color: #A5B4FC; font-weight: 500; font-size: 16px; margin: 10px 0;">YOUR SECURE ACCESS CODE</h3>
    
    <div class="otp-display">{formatted_code}</div>
    
    <p style="color: #8A99C0; font-size: 13px; margin: 10px 0 25px 0;">
        Expires in <strong style="color: #FF4DA6;">10 Minutes</strong>. Connect-on will never ask for this code outside the official application.
    </p>

    <!-- Secure Tunnel Diagram -->
    <div class="diagram-container">
        <div class="diagram-step">
            <span style="font-size: 20px;">💻</span>
            <div class="diagram-label">Device</div>
        </div>
        <div class="diagram-arrow">➔</div>
        <div class="diagram-step">
            <span style="font-size: 20px;">🛡️</span>
            <div class="diagram-label">Secure Tunnel</div>
        </div>
        <div class="diagram-arrow">➔</div>
        <div class="diagram-step">
            <span style="font-size: 20px;">💎</span>
            <div class="diagram-label">Vault</div>
        </div>
    </div>

    <!-- Device Details Detection -->
    <div class="meta-list">
        <div style="font-weight: 700; font-size: 12px; color: #FFFFFF; letter-spacing: 1px; margin-bottom: 12px; text-transform: uppercase;">
            🛡️ Security Attempt Details
        </div>
        <div class="meta-item">
            📍 <span class="meta-label">Location</span> <span class="meta-val">{location}</span>
        </div>
        <div class="meta-item">
            💻 <span class="meta-label">Device</span> <span class="meta-val">{device_info}</span>
        </div>
        <div class="meta-item">
            🕒 <span class="meta-label">Timestamp</span> <span class="meta-val">{datetime.datetime.now().strftime("%d %b %Y %I:%M %p")}</span>
        </div>
    </div>

    <a href="#" class="btn-gradient">Access Connect-On</a>

    {HTML_FOOTER_TEMPLATE}
    """
    send_async_email(target_email, subject, body)


def send_welcome_email(target_email: str, username: str):
    """Sends premium Welcome email with roadmap/timeline."""
    subject = "🎉 Welcome to Connect-On | Your digital universe is ready."
    
    body = f"""
    {HTML_HEADER_TEMPLATE}
    
    <div class="welcome-badge">Welcome to the Future</div>
    
    <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-bottom: 10px;">Your digital universe is ready.</h2>
    <p style="color: #8A99C0; font-size: 14px; line-height: 1.6; margin-bottom: 30px;">
        Hey {username}, thank you for choosing CONNECT-ON. We've built an end-to-end encrypted space for your chats, memories, games, and productivity.
    </p>

    <h4 style="color: #FF4DA6; text-transform: uppercase; font-weight: 700; letter-spacing: 2px; text-align: left; margin-bottom: 10px;">
        🚀 Getting Started Roadmap
    </h4>

    <div class="timeline-card">
        <div class="timeline-title">🔒 Setup Secure Keys</div>
        <div class="timeline-desc">Generate your Diffie-Hellman keys inside the Security Hub to enable end-to-end encryption.</div>
    </div>

    <div class="timeline-card">
        <div class="timeline-title">🌐 Connect & Discovery</div>
        <div class="timeline-desc">Search through user discovery cards or matches, unlock stories, and invite friends.</div>
    </div>

    <div class="timeline-card">
        <div class="timeline-title">🎮 Co-Op Gaming Hub</div>
        <div class="timeline-desc">Start real-time gaming sessions directly in your secure chats.</div>
    </div>

    <a href="https://connect-on.render.com" class="btn-gradient">Enter the Vault</a>

    {HTML_FOOTER_TEMPLATE}
    """
    send_async_email(target_email, subject, body)


def send_monthly_story_email(target_email: str, username: str, memories_count: int = 92, conversations_count: int = 18, milestones_count: int = 4):
    """Sends premium AI Memory Monthly Connection Story email."""
    subject = "🔮 Your Monthly Connection Story | Connect-On Insights"
    
    body = f"""
    {HTML_HEADER_TEMPLATE}
    
    <div class="welcome-badge">Monthly Memory Reel</div>
    
    <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-bottom: 10px;">A month worth remembering.</h2>
    <p style="color: #8A99C0; font-size: 14px; line-height: 1.6; margin-bottom: 25px;">
        Hello {username}, here is a beautiful, encrypted recap of your connections and activities this month.
    </p>

    <!-- Stats Grid -->
    <div class="stat-grid">
        <div class="stat-box">
            <div class="stat-val">{memories_count}</div>
            <div class="stat-lbl">Memories</div>
        </div>
        <div class="stat-box" style="border-left: none; border-right: none;">
            <div class="stat-val">{conversations_count}</div>
            <div class="stat-lbl">Chats</div>
        </div>
        <div class="stat-box">
            <div class="stat-val">{milestones_count}</div>
            <div class="stat-lbl">Milestones</div>
        </div>
    </div>

    <h4 style="color: #7C4DFF; text-transform: uppercase; font-weight: 700; letter-spacing: 2px; text-align: left; margin-bottom: 10px;">
        ✨ Key Insights
    </h4>

    <div class="timeline-card">
        <div class="timeline-title">Most Active Connections</div>
        <div class="timeline-desc">Your interaction frequency peaked on weekends, focusing on secure E2EE chats.</div>
    </div>

    <div class="timeline-card">
        <div class="timeline-title">Productivity Highlight</div>
        <div class="timeline-desc">You completed 85% of your Daily Goals and maintained a 7-day habit streak!</div>
    </div>

    <a href="https://connect-on.render.com" class="btn-gradient">View Full Memory Reel</a>

    {HTML_FOOTER_TEMPLATE}
    """
    send_async_email(target_email, subject, body)


def send_anniversary_email(target_email: str, username: str, partner_name: str, years: int = 1):
    """Sends premium cinematic Anniversary email."""
    subject = "❤️ A Memory Worth Celebrating | Anniversary"
    
    body = f"""
    {HTML_HEADER_TEMPLATE}
    
    <div class="welcome-badge" style="background: rgba(255, 77, 166, 0.1); border-color: rgba(255, 77, 166, 0.2); color: #FF4DA6;">
        Anniversary Milestone
    </div>
    
    <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-bottom: 10px;">You connected {years} year{'s' if years > 1 else ''} ago today.</h2>
    
    <!-- Cinematic Photo Frame simulator -->
    <div style="margin: 25px auto; padding: 10px; border-radius: 20px; background: linear-gradient(135deg, #FF4DA6, #7C4DFF); max-width: 320px;">
        <div style="background: #070B1A; border-radius: 12px; padding: 30px 20px; text-align: center;">
            <span style="font-size: 48px;">🥂</span>
            <div style="font-size: 18px; font-weight: 800; color: #FFFFFF; margin-top: 15px;">{username} & {partner_name}</div>
            <div style="font-size: 12px; color: #8A99C0; margin-top: 5px; letter-spacing: 2px;">SINCE 2025</div>
        </div>
    </div>

    <p style="color: #8A99C0; font-size: 14px; line-height: 1.6; margin: 25px 0;">
        From E2EE messages to shared game sessions, every single moment has been secure, private, and yours. Revisit your Relationship Hub memory box to see your time-capsule.
    </p>

    <a href="https://connect-on.render.com" class="btn-gradient">Open Memory Box</a>

    {HTML_FOOTER_TEMPLATE}
    """
    send_async_email(target_email, subject, body)


def send_friend_request_accepted_email(target_email: str, username: str, friend_name: str, friend_avatar_url: str = None):
    """Sends premium Friend Request Accepted email."""
    subject = "🎊 New Connection Unlocked on Connect-On!"
    avatar_src = friend_avatar_url or "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop"
    
    body = f"""
    {HTML_HEADER_TEMPLATE}
    
    <div class="welcome-badge">Connection Unlocked</div>
    
    <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-bottom: 10px;">{friend_name} accepted your request.</h2>
    
    <!-- Profile Card Preview -->
    <div style="max-width: 300px; margin: 30px auto; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 20px; padding: 25px 15px; text-align: center;">
        <img src="{avatar_src}" alt="{friend_name}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #7C4DFF;" />
        <h3 style="color: #FFFFFF; font-size: 16px; margin: 15px 0 5px 0; font-weight: 800;">{friend_name}</h3>
        <span style="font-size: 11px; font-weight: 700; color: #8A99C0; text-transform: uppercase; letter-spacing: 1px;">Ready to Chat</span>
    </div>

    <p style="color: #8A99C0; font-size: 14px; line-height: 1.6; margin-bottom: 25px;">
        You can now start end-to-end encrypted chats, share stories, collaborate on notes, or invite them to a game session.
    </p>

    <a href="https://connect-on.render.com" class="btn-gradient">Start Conversation</a>

    {HTML_FOOTER_TEMPLATE}
    """
    send_async_email(target_email, subject, body)


def send_security_vault_recovery_email(target_email: str, username: str, reset_url: str):
    """Sends premium Password Reset recovery email."""
    subject = "🛡️ Security Vault Recovery Request"
    
    body = f"""
    {HTML_HEADER_TEMPLATE}
    
    <div class="welcome-badge" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #EF4444;">
        Security Notice
    </div>
    
    <h2 style="font-size: 24px; font-weight: 800; color: #FFFFFF; margin-bottom: 10px;">Security Vault Recovery</h2>
    <p style="color: #8A99C0; font-size: 14px; line-height: 1.6; margin-bottom: 25px;">
        Hello {username}, we received a request to unlock and recover access to your CONNECT-ON account. Click the secure button below to reset your password.
    </p>

    <!-- Warning Details -->
    <div style="background: rgba(239, 68, 68, 0.05); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 12px; padding: 15px; text-align: left; margin: 25px 0;">
        <span style="color: #EF4444; font-weight: 700; font-size: 13px;">⚠️ Critical Security Warning</span>
        <p style="color: #8A99C0; font-size: 12px; margin: 5px 0 0 0; line-height: 1.5;">
            If you did not initiate this recovery request, please ignore this email. Your password will remain secure and your encryption keys intact.
        </p>
    </div>

    <a href="{reset_url}" class="btn-gradient" style="background: linear-gradient(135deg, #EF4444 0%, #7C4DFF 100%); box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);">
        Unlock Account
    </div>

    {HTML_FOOTER_TEMPLATE}
    """
    send_async_email(target_email, subject, body)
