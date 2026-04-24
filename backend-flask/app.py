from flask import Flask, request, jsonify
import psycopg2, requests, hashlib
from auth import generate_token, verify_token

app = Flask(__name__)

conn = psycopg2.connect(
    host="postgres",
    dbname="qwen",
    user="admin",
    password="password"
)

OLLAMA = "http://ollama:11434/api/generate"

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()
    
# ========================
# AUTH
# ========================

@app.route('/register', methods=['POST'])
def register():
    d = request.get_json()

    if not d or 'username' not in d or 'password' not in d:
        return jsonify({"error": "invalid request"}), 400

    cur = conn.cursor()

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


@app.route('/login', methods=['POST'])
def login():
    d = request.get_json()

    if not d or 'username' not in d or 'password' not in d:
        return jsonify({"error": "invalid request"}), 400

    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM users WHERE username=%s AND password=%s",
        (d['username'], hash_password(d['password']))
    )
    u = cur.fetchone()

    if not u:
        return jsonify({"error": "invalid credentials"}), 401

    return jsonify({"token": generate_token(u[0])})

# ========================
# CONVERSATIONS
# ========================

@app.route('/conversations', methods=['POST'])
def create_conversation():
    user = verify_token(request.headers.get("Authorization"))

    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    cur = conn.cursor()

    cur.execute(
        "INSERT INTO conversations (user_id) VALUES (%s) RETURNING id",
        (user['user_id'],)
    )

    cid = cur.fetchone()[0]
    conn.commit()

    return jsonify({"conversation_id": cid})

@app.route('/conversations', methods=['GET'])
def list_conversations():
    user = verify_token(request.headers.get("Authorization"))

    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    cur = conn.cursor()

    cur.execute("""
        SELECT id, title, updated_at
        FROM conversations
        WHERE user_id=%s
        ORDER BY updated_at DESC
    """, (user['user_id'],))

    rows = cur.fetchall()

    return jsonify([
        {"id": r[0], "title": r[1], "updated_at": str(r[2])}
        for r in rows
    ])


# ========================
# MESSAGES
# ========================

@app.route('/conversations/<int:cid>/messages', methods=['GET'])
def get_messages(cid):
    user = verify_token(request.headers.get("Authorization"))

    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    cur = conn.cursor()

    # ownership check
    cur.execute("""
        SELECT 1 FROM conversations
        WHERE id=%s AND user_id=%s
    """, (cid, user['user_id']))

    if not cur.fetchone():
        return jsonify({"error": "forbidden"}), 403

    # ✅ IMPORTANT: enforce ownership
    cur.execute("""
        SELECT role, content FROM messages
        WHERE conversation_id=%s
        ORDER BY id ASC
    """, (cid,))

    rows = cur.fetchall()

    return jsonify([
        {"role": r[0], "content": r[1]}
        for r in rows
    ])

# ========================
# CHAT
# ========================

@app.route('/chat', methods=['POST'])
def chat():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    uid = user['user_id']
    data = request.get_json()

    msg = data.get('message', '')
    cid = data.get('conversation_id')

    cur = conn.cursor()

    # create conversation if not provided
    if not cid:
        cur.execute(
            "INSERT INTO conversations (user_id) VALUES (%s) RETURNING id",
            (uid,)
        )
        cid = cur.fetchone()[0]
        conn.commit()

    else:
        # ownership check
        cur.execute("""
            SELECT 1 FROM conversations
            WHERE id=%s AND user_id=%s
        """, (cid, uid))

        if not cur.fetchone():
            return jsonify({"error": "forbidden"}), 403

    # store user message
    cur.execute(
        "INSERT INTO messages (conversation_id, role, content) VALUES (%s,%s,%s)",
        (cid, "user", msg)
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
        history_text += f"{role.capitalize()}: {content}\n"

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
        "INSERT INTO messages (conversation_id, role, content) VALUES (%s,%s,%s)",
        (cid, "assistant", ans)
    )

    # update conversation timestamp
    cur.execute("""
        UPDATE conversations SET updated_at=NOW()
        WHERE id=%s
    """, (cid,))

    conn.commit()

    return jsonify({
        "response": ans,
        "conversation_id": cid
    })


app.run(host="0.0.0.0", port=5000, debug=True)