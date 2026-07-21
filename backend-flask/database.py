import atexit
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from config import POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD

db_pool = ThreadedConnectionPool(
    minconn=2,
    maxconn=20,
    host=POSTGRES_HOST,
    dbname=POSTGRES_DB,
    user=POSTGRES_USER,
    password=POSTGRES_PASSWORD
)

@contextmanager
def get_db():
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        db_pool.putconn(conn)

@atexit.register
def close_pool():
    db_pool.closeall()