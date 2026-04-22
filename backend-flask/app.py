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
    token = request.headers.get("Authorization")
    user = verify_token(token)
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    uid = user['user_id']
    msg = request.json.get('message', '')

    cur = conn.cursor()

    # 1️⃣ store user message
    cur.execute(
        "INSERT INTO messages (user_id, role, content) VALUES (%s, %s, %s)",
        (uid, "user", msg)
    )
    conn.commit()

    # 2️⃣ fetch last N messages
    cur.execute("""
        SELECT role, content FROM messages
        WHERE user_id=%s
        ORDER BY id DESC
        LIMIT 10
    """, (uid,))
    
    rows = cur.fetchall()
    rows.reverse()

    # 3️⃣ build prompt
    history_text = ""
    for role, content in rows:
        if role == "user":
            history_text += f"User: {content}\n"
        else:
            history_text += f"Assistant: {content}\n"

    prompt = f"""
{history_text}
Assistant:
"""

    # 4️⃣ call Ollama
    try:
        r = requests.post(OLLAMA, json={
            "model": "qwen3.5:9b",
            "prompt": prompt,
            "stream": False
        })

        data = r.json()
        ans = data.get("response", "")

    except Exception as e:
        print("OLLAMA ERROR:", e)
        return jsonify({"error": "llm_failed"}), 500

    # 5️⃣ store assistant response
    cur.execute(
        "INSERT INTO messages (user_id, role, content) VALUES (%s, %s, %s)",
        (uid, "assistant", ans)
    )
    conn.commit()

    return jsonify({"response": ans})


app.run(host="0.0.0.0", port=5000, debug=True)