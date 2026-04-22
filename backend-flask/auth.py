import jwt, datetime
import os

SECRET = os.getenv("JWT_SECRET", "fallback-very-long-random-string-123456")

def generate_token(user_id):
    return jwt.encode({
        "user_id": user_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=1)
    }, SECRET, algorithm="HS256")


def verify_token(token):
    try:
        return jwt.decode(token, SECRET, algorithms=["HS256"])
    except Exception as e:
        print("JWT ERROR:", str(e))   # 👈 ADD THIS
        return {"error": str(e)}