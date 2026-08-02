from flask import Blueprint, request, jsonify
from database import get_db
from utils.security import hash_password, verify_password
from auth import generate_token

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    d = request.get_json()

    if not d or 'username' not in d or 'password' not in d:
        return jsonify({"error": "invalid request"}), 400

    with get_db() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "INSERT INTO users (username,password) VALUES (%s,%s) RETURNING id",
                    (d['username'], hash_password(d['password']))
                )
                uid = cur.fetchone()[0]
                conn.commit()
            except Exception:
                conn.rollback()
                return jsonify({"error": "user exists"}), 400

    return jsonify({"token": generate_token(uid)})


@auth_bp.route('/login', methods=['POST'])
def login():
    d = request.get_json()

    if not d or 'username' not in d or 'password' not in d:
        return jsonify({"error": "invalid request"}), 400

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id,password
                FROM users
                WHERE username=%s
                """,
                (d['username'],)
            )

            u = cur.fetchone()

    if not u:
        return jsonify({"error": "invalid credentials"}), 401

    uid, stored_hash = u

    is_valid, legacy_hash = verify_password(
        d['password'],
        stored_hash
    )
    
    if not is_valid:
        return jsonify({"error": "invalid credentials"}), 401
    
    if legacy_hash:
        with get_db() as conn:
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        "UPDATE users SET password=%s WHERE id=%s",
                        (hash_password(d['password']), uid)
                    )
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    print("LEGACY PASSWORD HASH UPGRADE FAILED:", e)
                    return jsonify({"error": "legacy password hash upgrade failed"}), 500

    return jsonify({"token": generate_token(uid)})