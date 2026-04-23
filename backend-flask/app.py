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

@app.route('/conversations', methods=['POST'])
def create_conversation():
    token = request.headers.get("Authorization")
    user = verify_token(token)

    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    uid = user['user_id']
    cur = conn.cursor()

    cur.execute(
        "INSERT INTO conversations (user_id) VALUES (%s) RETURNING id",
        (uid,)
    )

    cid = cur.fetchone()[0]
    conn.commit()

    return jsonify({"conversation_id": cid})

@app.route('/conversations', methods=['GET'])
def list_conversations():
    token = request.headers.get("Authorization")
    user = verify_token(token)

    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    uid = user['user_id']
    cur = conn.cursor()

    cur.execute("""
        SELECT id, title, created_at
        FROM conversations
        WHERE user_id=%s
        ORDER BY id DESC
    """, (uid,))

    rows = cur.fetchall()

    return jsonify([
        {"id": r[0], "title": r[1], "created_at": str(r[2])}
        for r in rows
    ])

@app.route('/messages/<int:cid>', methods=['GET'])
def get_messages(cid):
    token = request.headers.get("Authorization")
    user = verify_token(token)

    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    uid = user['user_id']
    cur = conn.cursor()

    # ✅ IMPORTANT: enforce ownership
    cur.execute("""
        SELECT role, content FROM messages
        WHERE conversation_id=%s AND user_id=%s
        ORDER BY id ASC
    """, (cid, uid))

    rows = cur.fetchall()

    return jsonify([
        {"role": r[0], "content": r[1]}
        for r in rows
    ])

@app.route('/chat', methods=['POST'])
def chat():
    token = request.headers.get("Authorization")
    user = verify_token(token)
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    uid = user['user_id']
    msg = request.json.get('message', '')
    cid = request.json.get('conversation_id')

    cur = conn.cursor()

    # create conversation if not provided
    if not cid:
        cur.execute(
            "INSERT INTO conversations (user_id) VALUES (%s) RETURNING id",
            (uid,)
        )
        cid = cur.fetchone()[0]
        conn.commit()

    # store user message
    cur.execute(
        "INSERT INTO messages (user_id, role, content, conversation_id) VALUES (%s,%s,%s,%s)",
        (uid, "user", msg, cid)
    )
    conn.commit()

    # fetch history
    cur.execute("""
        SELECT role, content FROM messages
        WHERE conversation_id=%s
        ORDER BY id DESC
        LIMIT 10
    """, (cid,))

    rows = cur.fetchall()
    rows.reverse()

    history_text = ""
    for role, content in rows:
        if role == "user":
            history_text += f"User: {content}\n"
        else:
            history_text += f"Assistant: {content}\n"

    prompt = f"{history_text}\nAssistant:"

    try:
        r = requests.post(OLLAMA, json={
            "model": "qwen3.5:9b",
            "prompt": prompt,
            "stream": False
        })
        ans = r.json().get("response", "")
    except Exception as e:
        print("OLLAMA ERROR:", e)
        return jsonify({"error": "llm_failed"}), 500

    # store assistant reply
    cur.execute(
        "INSERT INTO messages (user_id, role, content, conversation_id) VALUES (%s,%s,%s,%s)",
        (uid, "assistant", ans, cid)
    )
    conn.commit()

    return jsonify({
        "response": ans,
        "conversation_id": cid
    })


app.run(host="0.0.0.0", port=5000, debug=True)