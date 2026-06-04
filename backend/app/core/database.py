from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# For SQLite, we need to pass connect_args={"check_same_thread": False}
connect_args = {}
pool_kwargs = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    # PostgreSQL connection pooling properties
    pool_kwargs = {
        "pool_size": 20,
        "max_overflow": 10,
        "pool_recycle": 3600
    }

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **pool_kwargs
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Naming convention for database constraints to support batch migrations
naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}
metadata = MetaData(naming_convention=naming_convention)
Base = declarative_base(metadata=metadata)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
