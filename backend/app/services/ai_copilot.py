import os
import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.models import User, MessageStatus, Friendship, CalendarEvent, Story, AuditLog
from app.services.presence_service import get_online_users

def calculate_security_score(user: User) -> int:
    score = 25  # Base score for password existence
    if user.is_verified:
        score += 25
    if user.two_factor_enabled:
        score += 25
    if user.profile and user.profile.public_key:
        score += 25
    return score

async def generate_copilot_summary(user: User, db: Session):
    user_id = user.id
    
    # 1. Unread messages count
    unread_messages = db.query(MessageStatus).filter(
        MessageStatus.user_id == user_id,
        MessageStatus.status != "seen"
    ).count()
    
    # 2. Online friends
    friendships = db.query(Friendship).filter(
        or_(Friendship.user1_id == user_id, Friendship.user2_id == user_id)
    ).all()
    friend_ids = [fs.user2_id if fs.user1_id == user_id else fs.user1_id for fs in friendships]
    
    online_users = await get_online_users()
    online_friends_count = len([fid for fid in friend_ids if fid in online_users])
    
    # 3. Upcoming events count (within next 24 hours)
    now = datetime.datetime.utcnow()
    next_24h = now + datetime.timedelta(hours=24)
    upcoming_events_count = db.query(CalendarEvent).filter(
        CalendarEvent.user_id == user_id,
        CalendarEvent.start_time >= now,
        CalendarEvent.start_time <= next_24h
    ).count()
    
    # 4. Active Stories count
    stories_count = db.query(Story).filter(
        Story.expires_at > now
    ).count()
    
    # 5. Security score
    security_score = calculate_security_score(user)

    # 6. Real-time connections (friends) count
    total_connections = db.query(Friendship).filter(
        or_(Friendship.user1_id == user_id, Friendship.user2_id == user_id)
    ).count()

    # 7. Real-time messages count (total messages in user's active chats)
    from app.models.models import chat_participants, Message
    chat_ids = [c[0] for c in db.query(chat_participants.c.chat_id).filter(chat_participants.c.user_id == user_id).all()]
    if chat_ids:
        total_messages = db.query(Message).filter(Message.chat_id.in_(chat_ids)).count()
    else:
        total_messages = 0
    
    # Recommendations checklist (Rule-Based Recommendations)
    recommendations = []
    
    profile_completion = 0
    if user.profile:
        fields = ['full_name', 'bio', 'avatar_url', 'country']
        filled = sum(1 for field in fields if getattr(user.profile, field, None))
        profile_completion = int((filled / len(fields)) * 100)
        
    if profile_completion < 80:
        recommendations.append("Complete your profile")
        
    if unread_messages > 0:
        recommendations.append("Reply to unread messages")
        
    if not user.two_factor_enabled:
        recommendations.append("Enable 2FA")
        
    if not (user.profile and user.profile.public_key):
        recommendations.append("Enable E2EE key sync")
        
    # Generate Summary text
    openai_api_key = os.getenv("OPENAI_API_KEY")
    summary_text = ""
    
    if openai_api_key:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=openai_api_key)
            prompt = f"""
            User Stats:
            Unread Messages: {unread_messages}
            Online Friends: {online_friends_count}
            Upcoming Events: {upcoming_events_count}
            Security Score: {security_score}%
            Stories Count: {stories_count}

            Generate a short personal assistant summary greeting for the user {user.profile.full_name if user.profile else user.username}.
            Make it friendly, brief (2-3 sentences max), and mention the current stats nicely.
            """
            response = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "You are Connect AI, a premium personal assistant."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=150,
                temperature=0.7
            )
            summary_text = response.choices[0].message.content.strip()
        except Exception as e:
            # Fallback if OpenAI call fails or is not installed
            summary_text = generate_rule_based_summary(user, unread_messages, online_friends_count, security_score)
    else:
        summary_text = generate_rule_based_summary(user, unread_messages, online_friends_count, security_score)
        
        # Fetch real activity logs from the audit chain
        user_ids_to_query = [user_id] + friend_ids
        logs = db.query(AuditLog).filter(
            AuditLog.user_id.in_(user_ids_to_query)
        ).order_by(AuditLog.created_at.desc()).limit(5).all()

        recent_activities = []
        for log in logs:
            log_user = db.query(User).filter(User.id == log.user_id).first()
            if log_user:
                display_name = log_user.profile.full_name if (log_user.profile and log_user.profile.full_name) else log_user.username
            else:
                display_name = "System"

            diff = datetime.datetime.utcnow() - log.created_at
            if diff.days > 0:
                time_ago = f"{diff.days}d ago"
            elif diff.seconds >= 3600:
                time_ago = f"{diff.seconds // 3600}h ago"
            elif diff.seconds >= 60:
                time_ago = f"{diff.seconds // 60}m ago"
            else:
                time_ago = "Just now"

            action_text = log.action
            if log.action == "login_success":
                action_text = "signed in securely"
            elif log.action == "register_success":
                action_text = "registered account"
            elif log.action == "otp_verify_success":
                action_text = "verified account security"
            elif log.action.startswith("admin_"):
                action_text = f"performed admin action ({log.action.replace('admin_', '')})"
            else:
                action_text = log.action.replace("_", " ")

            recent_activities.append({
                "display_name": display_name,
                "action": action_text,
                "time_ago": time_ago
            })

        if not recent_activities:
            recent_activities = [
                {
                    "display_name": user.profile.full_name if (user.profile and user.profile.full_name) else user.username,
                    "action": "completed security setup",
                    "time_ago": "Just now"
                }
            ]

        return {
            "messages": unread_messages,
            "online_friends": online_friends_count,
            "events": upcoming_events_count,
            "security_score": security_score,
            "summary": summary_text,
            "recommendations": recommendations,
            "total_connections": total_connections,
            "total_messages": total_messages,
            "total_stories": stories_count,
            "recent_activities": recent_activities
        }

def generate_rule_based_summary(user: User, unread_messages: int, online_friends: int, security_score: int) -> str:
    name = user.profile.full_name.split(' ')[0] if (user.profile and user.profile.full_name) else user.username
    hour = datetime.datetime.now().hour
    
    if hour < 12:
        greeting = "Good Morning"
    elif hour < 17:
        greeting = "Good Afternoon"
    else:
        greeting = "Good Evening"
        
    parts = [f"{greeting}, {name}."]
    
    if unread_messages > 0:
        parts.append(f"You have {unread_messages} unread messages waiting for your response.")
    else:
        parts.append("Your inbox is clean.")
        
    if online_friends > 0:
        parts.append(f"{online_friends} friends are online now.")
    else:
        parts.append("No friends are currently active.")
        
    parts.append(f"Your E2EE security health is excellent at {security_score}%.")
    
    return " ".join(parts)
