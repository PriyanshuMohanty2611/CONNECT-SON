import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.models.models import User, Friendship, RelationshipMemory, Anniversary, Chat, Message

def generate_relationship_recap(db: Session, user1_id: str, user2_id: str):
    user1 = db.query(User).filter(User.id == user1_id).first()
    user2 = db.query(User).filter(User.id == user2_id).first()
    
    if not user1 or not user2:
        return {"error": "Users not found"}
        
    # Get direct chat
    chat = db.query(Chat).filter(Chat.type == "direct").filter(
        Chat.participants.any(id=user1_id) & Chat.participants.any(id=user2_id)
    ).first()
    
    total_messages = 0
    first_message_date = None
    if chat:
        total_messages = db.query(Message).filter(Message.chat_id == chat.id).count()
        first_msg = db.query(Message).filter(Message.chat_id == chat.id).order_by(Message.created_at.asc()).first()
        if first_msg:
            first_message_date = first_msg.created_at
            
    # Get memories
    memories = db.query(RelationshipMemory).filter(
        or_(
            and_(RelationshipMemory.user_id == user1_id, RelationshipMemory.partner_id == user2_id),
            and_(RelationshipMemory.user_id == user2_id, RelationshipMemory.partner_id == user1_id)
        )
    ).order_by(RelationshipMemory.created_at.asc()).all()
    
    # Get anniversaries
    anniversaries = db.query(Anniversary).filter(
        or_(
            and_(Anniversary.user_id == user1_id, Anniversary.partner_id == user2_id),
            and_(Anniversary.user_id == user2_id, Anniversary.partner_id == user1_id)
        )
    ).all()
    
    # Compare interests
    def parse_list(val):
        if not val:
            return []
        return [x.strip() for x in val.split(",") if x.strip()]
        
    u1_interests = parse_list(user1.interests)
    u2_interests = parse_list(user2.interests)
    common_interests = list(set(u1_interests).intersection(set(u2_interests)))
    
    u1_music = parse_list(user1.music)
    u2_music = parse_list(user2.music)
    common_music = list(set(u1_music).intersection(set(u2_music)))
    
    u1_movies = parse_list(user1.movies)
    u2_movies = parse_list(user2.movies)
    common_movies = list(set(u1_movies).intersection(set(u2_movies)))
    
    u1_hobbies = parse_list(user1.hobbies)
    u2_hobbies = parse_list(user2.hobbies)
    common_hobbies = list(set(u1_hobbies).intersection(set(u2_hobbies)))
    
    # Generate timeline
    timeline = []
    # Start of friendship
    fs = db.query(Friendship).filter(
        or_(
            and_(Friendship.user1_id == user1_id, Friendship.user2_id == user2_id),
            and_(Friendship.user1_id == user2_id, Friendship.user2_id == user1_id)
        )
    ).first()
    
    friendship_start = fs.created_at if fs else (first_message_date or datetime.datetime.utcnow())
    timeline.append({
        "date": friendship_start.isoformat(),
        "title": "Beginning of a beautiful connection",
        "description": f"{user1.username} and {user2.username} officially connected on Connect-On.",
        "type": "connection"
    })
    
    # Add anniversaries
    for ann in anniversaries:
        timeline.append({
            "date": datetime.datetime.combine(ann.anniversary_date, datetime.time.min).isoformat(),
            "title": ann.title,
            "description": f"A special anniversary celebrated by {user1.username} and {user2.username}.",
            "type": "anniversary"
        })
        
    # Add memories
    for mem in memories:
        timeline.append({
            "date": mem.created_at.isoformat(),
            "title": mem.title,
            "description": mem.description or f"Shared a memory in the vault.",
            "file_url": mem.file_url,
            "file_type": mem.file_type,
            "type": "memory"
        })
        
    # Sort timeline by date
    timeline.sort(key=lambda x: x["date"])
    
    # Generate dynamic recap texts
    name1 = user1.profile.full_name if user1.profile else user1.username
    name2 = user2.profile.full_name if user2.profile else user2.username
    
    interests_str = ", ".join(common_interests) if common_interests else "shared vibes"
    
    summary = f"What a journey it has been for {name1} and {name2}! From the moment they connected, they've shared over {total_messages} messages and created {len(memories)} memories in the vault. They bond over their mutual interest in {interests_str}."
    
    yearly_summary = {
        "text": f"This year, {name1} and {name2} have shown incredible relationship depth. Their communication frequency puts them in the top 5% of active friends. With consistent messages and memory shares, their bond remains stronger than ever.",
        "sentiment": "Extremely Positive",
        "communication_rank": "Soulmates" if total_messages > 1000 else ("Besties" if total_messages > 100 else "Buddies")
    }
    
    friendship_recap = {
        "common_interests": common_interests,
        "common_music": common_music,
        "common_movies": common_movies,
        "common_hobbies": common_hobbies,
        "description": f"It looks like you both enjoy listening to {', '.join(common_music) if common_music else 'all music'} and watching {', '.join(common_movies) if common_movies else 'movies together'}!"
    }
    
    life_journal = []
    # Generate a journal entry for each memory
    for i, mem in enumerate(memories):
        life_journal.append({
            "title": f"Entry #{i+1}: {mem.title}",
            "content": mem.description or f"Captured on Connect-On. A picture is worth a thousand words, but this shared moment holds a lifetime of friendship.",
            "date": mem.created_at.strftime("%B %d, %Y"),
            "media_url": mem.file_url,
            "media_type": mem.file_type
        })
        
    if not life_journal:
        life_journal.append({
            "title": "Chapter 1: The Beginning",
            "content": f"The journey of {name1} and {name2} has officially begun. Start uploading photos in the vault to write the first pages of your joint life journal!",
            "date": friendship_start.strftime("%B %d, %Y"),
            "media_url": None,
            "media_type": None
        })
        
    return {
        "summary": summary,
        "metrics": {
            "total_messages": total_messages,
            "total_memories": len(memories),
            "shared_anniversaries": len(anniversaries),
            "common_interests_count": len(common_interests)
        },
        "timeline": timeline,
        "yearly_summary": yearly_summary,
        "friendship_recap": friendship_recap,
        "life_journal": life_journal
    }
