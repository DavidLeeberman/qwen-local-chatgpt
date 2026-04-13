from flask import Flask, request, jsonify
import psycopg2, requests, hashlib
from auth import generate_token, verify_token
from memory import store, retrieve

app = Flask(__name__)

conn = psycopg2.connect(
    host="postgres",
    dbname="qwen",
    user="admin",
    password="password"
)

OLLAMA = "http://ollama:11434/api/generate"

history = {}

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()


@app.route('/register', methods=['POST'])
def register():
    d = request.get_json()

    if not d or 'username' not in d or 'password' not in d:
        return jsonify({"error": "invalid request"}), 400

    username = d['username']
    password = hash_password(d['password'])

    cur = conn.cursor()

    try:
        cur.execute(
            "INSERT INTO users (username,password) VALUES (%s,%s) RETURNING id",
            (username, password)
        )
        uid = cur.fetchone()[0]
        conn.commit()
    except Exception:
        conn.rollback()
        return jsonify({"error": "user exists"}), 400

    return jsonify({"token": generate_token(uid)})


@app.route('/login', methods=['POST'])
def login():
    d = request.get_json()

    if not d or 'username' not in d or 'password' not in d:
        return jsonify({"error": "invalid request"}), 400

    username = d['username']
    password = hash_password(d['password'])

    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM users WHERE username=%s AND password=%s",
        (username, password)
    )
    u = cur.fetchone()

    if not u:
        return jsonify({"error": "invalid credentials"}), 401

    return jsonify({"token": generate_token(u[0])})


@app.route('/chat', methods=['POST'])
def chat():
    try:
        print("=== /chat called ===")

        token = request.headers.get("Authorization")
        print("TOKEN:", token)

        user = verify_token(token)
        print("USER:", user)

        if not user:
            return jsonify({"error":"unauthorized"}),401

        uid = user['user_id']
        msg = request.json.get('message')
        print("MSG:", msg)

        if uid not in history:
            history[uid] = []

        memory = ""

        prompt = f"""
User memory:
{memory}

Recent:
{''.join(history[uid][-6:])}

User: {msg}
Assistant:
"""

        print("PROMPT OK")

        r = requests.post("http://ollama:11434/api/generate", json={
            "model": "qwen3.5:9b",
            "prompt": prompt,
            "stream": False
        })

        print("OLLAMA STATUS:", r.status_code)

        data = r.json()
        print("OLLAMA DATA:", data)

        ans = data.get("response", "NO RESPONSE")

        history[uid].append(f"User:{msg}\n")
        history[uid].append(f"Assistant:{ans}\n")

        return jsonify({"response": ans})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


app.run(host="0.0.0.0", port=5000, debug=True)