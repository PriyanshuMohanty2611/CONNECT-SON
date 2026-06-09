from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.models.models import RelationshipMemory

def cap_records(db: Session, model, filter_by: dict = None, limit: int = 100):
    """
    Keeps only the latest 'limit' records for a given SQLAlchemy model matching filter_by dictionary.
    Deletes the oldest records if they exceed the limit.
    """
    try:
        query = db.query(model)
        if filter_by:
            for key, val in filter_by.items():
                query = query.filter(getattr(model, key) == val)
                
        # Order by created_at desc, then id desc to guarantee newest records first
        if hasattr(model, "created_at"):
            query = query.order_by(model.created_at.desc(), model.id.desc())
        else:
            query = query.order_by(model.id.desc())
            
        records = query.all()
        if len(records) > limit:
            to_delete = records[limit:]
            for record in to_delete:
                db.delete(record)
            db.commit()
            print(f"[CLEANUP] Capped {model.__tablename__} (filter: {filter_by}) to {limit} records.")
    except Exception as e:
        print(f"[CLEANUP] [ERROR] Failed to cap {model.__tablename__}: {e}")
        db.rollback()

def cap_memories(db: Session, user_id: str, partner_id: str, limit: int = 100):
    """
    Keeps only the latest 'limit' relationship memories between two users.
    """
    try:
        memories = db.query(RelationshipMemory).filter(
            or_(
                and_(RelationshipMemory.user_id == user_id, RelationshipMemory.partner_id == partner_id),
                and_(RelationshipMemory.user_id == partner_id, RelationshipMemory.partner_id == user_id)
			)
        ).order_by(RelationshipMemory.created_at.desc(), RelationshipMemory.id.desc()).all()
        
        if len(memories) > limit:
            for m in memories[limit:]:
                db.delete(m)
            db.commit()
            print(f"[CLEANUP] Capped relationship memories between {user_id} and {partner_id} to {limit} records.")
    except Exception as e:
        print(f"[CLEANUP] [ERROR] Failed to cap relationship memories: {e}")
        db.rollback()
