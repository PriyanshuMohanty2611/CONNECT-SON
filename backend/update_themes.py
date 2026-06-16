import sqlite3

def run_update():
    conn = sqlite3.connect('connect_on.db')
    c = conn.cursor()
    c.execute("UPDATE profiles SET theme_preference = 'tiimi'")
    conn.commit()
    print("Updated rows count:", c.rowcount)
    conn.close()

if __name__ == '__main__':
    run_update()
