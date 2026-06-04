import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "connect_on.db")

def migrate():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Helper function to add columns safely
    def add_column_if_not_exists(table, column, definition):
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            print(f"[OK] Added column '{column}' to table '{table}'")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower() or "already exists" in str(e).lower():
                print(f"[INFO] Column '{column}' in '{table}' already exists.")
            else:
                print(f"[ERROR] Error adding column '{column}' to table '{table}': {e}")

    # 1. Update existing tables
    print("Migrating users table...")
    add_column_if_not_exists("users", "two_factor_enabled", "BOOLEAN DEFAULT 0")
    add_column_if_not_exists("users", "two_factor_secret", "VARCHAR(255) NULL")
    add_column_if_not_exists("users", "hidden_chat_pin", "VARCHAR(255) NULL")
    add_column_if_not_exists("users", "interests", "TEXT NULL")
    add_column_if_not_exists("users", "music", "TEXT NULL")
    add_column_if_not_exists("users", "movies", "TEXT NULL")
    add_column_if_not_exists("users", "hobbies", "TEXT NULL")

    print("Migrating chats table...")
    add_column_if_not_exists("chats", "is_hidden", "BOOLEAN DEFAULT 0")
    add_column_if_not_exists("chats", "hidden_by_user_id", "VARCHAR(36) NULL")

    print("Migrating messages table...")
    add_column_if_not_exists("messages", "available_at", "DATETIME NULL")

    print("Migrating stories table...")
    add_column_if_not_exists("stories", "music_url", "VARCHAR(255) NULL")
    add_column_if_not_exists("stories", "poll_question", "TEXT NULL")
    add_column_if_not_exists("stories", "poll_options", "TEXT NULL") # JSON array of string options
    add_column_if_not_exists("stories", "poll_votes", "TEXT NULL") # JSON dictionary option_index -> list of user_ids
    add_column_if_not_exists("stories", "qa_question", "TEXT NULL")
    add_column_if_not_exists("stories", "qa_answers", "TEXT NULL") # JSON list of answers with user details

    # 2. Create new tables
    print("Creating new tables...")
    
    # Real-time Gaming
    cur.execute("""
    CREATE TABLE IF NOT EXISTS game_sessions (
        id VARCHAR(36) PRIMARY KEY,
        chat_id VARCHAR(36),
        game_type VARCHAR(50),
        status VARCHAR(20),
        board_state TEXT,
        player1_id VARCHAR(36),
        player2_id VARCHAR(36),
        turn_player_id VARCHAR(36),
        winner_id VARCHAR(36),
        created_at DATETIME,
        updated_at DATETIME
    )
    """)
    
    cur.execute("""
    CREATE TABLE IF NOT EXISTS game_leaderboards (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) UNIQUE,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        game_type VARCHAR(50)
    )
    """)

    # Relationship Hub
    cur.execute("""
    CREATE TABLE IF NOT EXISTS love_calculations (
        id VARCHAR(36) PRIMARY KEY,
        user1_id VARCHAR(36),
        user2_id VARCHAR(36),
        percentage INTEGER,
        created_at DATETIME
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS anniversaries (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        partner_id VARCHAR(36),
        title VARCHAR(255),
        anniversary_date DATE,
        reminder_days_before INTEGER,
        created_at DATETIME
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS relationship_memories (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        partner_id VARCHAR(36),
        title VARCHAR(255),
        description TEXT,
        file_url VARCHAR(255),
        file_type VARCHAR(50),
        is_encrypted BOOLEAN DEFAULT 0,
        created_at DATETIME
    )
    """)

    # Smart Calendar
    cur.execute("""
    CREATE TABLE IF NOT EXISTS calendar_events (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        title VARCHAR(255),
        description TEXT,
        event_type VARCHAR(50),
        start_time DATETIME,
        reminder_minutes_before INTEGER,
        is_notified BOOLEAN DEFAULT 0,
        created_at DATETIME
    )
    """)

    # Notes Hub
    cur.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255),
        content TEXT,
        note_type VARCHAR(20),
        owner_id VARCHAR(36),
        is_encrypted BOOLEAN DEFAULT 0,
        created_at DATETIME,
        updated_at DATETIME
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS note_collaborators (
        note_id VARCHAR(36),
        user_id VARCHAR(36),
        PRIMARY KEY (note_id, user_id)
    )
    """)

    # Productivity Hub
    cur.execute("""
    CREATE TABLE IF NOT EXISTS daily_goals (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        title VARCHAR(255),
        is_completed BOOLEAN DEFAULT 0,
        date DATE,
        created_at DATETIME
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS habits (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        name VARCHAR(255),
        streak INTEGER DEFAULT 0,
        max_streak INTEGER DEFAULT 0,
        last_done_date DATE,
        created_at DATETIME
    )
    """)

    # Personal Cloud Vault
    cur.execute("""
    CREATE TABLE IF NOT EXISTS cloud_files (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        file_name VARCHAR(255),
        file_url VARCHAR(255),
        file_size INTEGER,
        file_type VARCHAR(50),
        is_encrypted BOOLEAN DEFAULT 0,
        created_at DATETIME
    )
    """)

    conn.commit()
    conn.close()
    print("Database migration completed successfully!")

if __name__ == "__main__":
    migrate()
