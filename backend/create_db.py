import psycopg2

try:
    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        user="admin",
        password="admin",
        dbname="postgres"
    )
    conn.autocommit = True
    cur = conn.cursor()
    
    # Check if connect_on DB already exists
    cur.execute("SELECT 1 FROM pg_database WHERE datname='connect_on'")
    exists = cur.fetchone()
    
    if not exists:
        cur.execute("CREATE DATABASE connect_on")
        print("✅ Database 'connect_on' created successfully!")
    else:
        print("✅ Database 'connect_on' already exists.")
    
    conn.close()
    print("✅ PostgreSQL connection successful!")

except Exception as e:
    print(f"❌ Error: {e}")
