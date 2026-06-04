from celery import Celery
from kombu import Queue
from app.core.config import settings

celery_app = Celery(
    "connect_on_tasks",
    broker=settings.REDIS_URL or "redis://localhost:6379/0",
    backend=settings.REDIS_URL or "redis://localhost:6379/0"
)

# Celery Configurations & Dead Letter Queue (DLQ) Setup
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_default_queue="default",
    task_queues=(
        Queue("default", routing_key="default"),
        Queue("dlq", routing_key="dlq"),
    ),
    task_publish_retry=True,
    task_publish_retry_policy={
        "max_retries": 3,
        "interval_start": 2,
        "interval_step": 2,
        "interval_max": 10
    }
)

# Configure daily purge schedule for soft-deleted messages
celery_app.conf.beat_schedule = {
    "purge-deleted-messages-nightly": {
        "task": "app.core.celery_app.purge_deleted_messages",
        "schedule": 86400.0, # Run once every 24 hours
    }
}

@celery_app.task(name="app.core.celery_app.purge_deleted_messages")
def purge_deleted_messages():
    """
    Nightly purge worker to remove soft-deleted messages older than 30 days.
    """
    from app.core.database import SessionLocal
    from app.models.models import Message
    import datetime

    db = SessionLocal()
    try:
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=30)
        deleted_count = db.query(Message).filter(
            Message.deleted_at.isnot(None),
            Message.deleted_at < cutoff
        ).delete(synchronize_session=False)
        db.commit()
        return f"Purged {deleted_count} messages older than 30 days."
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

@celery_app.task(name="app.core.celery_app.send_to_dlq_task")
def send_to_dlq_task(failed_task_name: str, task_args: list, error_message: str):
    """
    Logs failed tasks sent to the Dead Letter Queue for analysis and alerting.
    """
    import logging
    logger = logging.getLogger("celery.dlq")
    logger.error(
        f"[DLQ ALERT] Task {failed_task_name} failed with args: {task_args}. "
        f"Reason: {error_message}"
    )
    return "Logged to DLQ"

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    name="app.core.celery_app.send_notification_task"
)
def send_notification_task(self, user_id: str, payload: dict):
    """
    Worker task to dispatch notifications to users, with failure retry logic
    and routing to the Dead Letter Queue if max retries are exceeded.
    """
    try:
        # notification delivery simulation/logic
        # e.g., print(f"Sending notification to {user_id}: {payload}")
        pass
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            # Route task payload to Dead Letter Queue (DLQ)
            send_to_dlq_task.apply_async(
                args=[self.name, [user_id, payload], str(exc)],
                queue="dlq"
            )
            return "Task failed permanently, routed to DLQ"
        else:
            raise self.retry(exc=exc)

