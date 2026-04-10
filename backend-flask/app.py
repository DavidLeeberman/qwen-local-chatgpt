from flask import Flask, request, jsonify
import psycopg2, requests
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

@app.route('/register', methods=['POST'])
def register():
    d = request.json
    cur = conn.cursor()
    cur.execute("INSERT INTO users (username,password) VALUES (%s,%s) RETURNING id",
                (d['username'], d['password']))
    uid = cur.fetchone()[0]
    conn.commit()
    return jsonify({"token": generate_token(uid)})

@app.route('/login', methods=['POST'])
def login():
    d = request.json
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE username=%s AND password=%s",
                (d['username'], d['password']))
    u = cur.fetchone()
    if not u:
        return jsonify({"error":"invalid"}),401
    return jsonify({"token": generate_token(u[0])})

@app.route('/chat', methods=['POST'])
def chat():
    token = request.headers.get("Authorization")
    user = verify_token(token)
    if not user:
        return jsonify({"error":"unauthorized"}),401

    uid = user['user_id']
    msg = request.json['message']

    if uid not in history:
        history[uid] = []

    memory = retrieve(uid, msg)

    prompt = f"""
User memory:
{memory}

Recent:
{''.join(history[uid][-6:])}

User: {msg}
Assistant:
"""

    r = requests.post(OLLAMA, json={
        "model": "qwen3.5:9b",
        "prompt": prompt,
        "stream": False
    })

    ans = r.json()['response']

    history[uid].append(f"User:{msg}\n")
    history[uid].append(f"Assistant:{ans}\n")

    store(uid, msg)

    return jsonify({"response": ans})

app.run(host="0.0.0.0", port=5000)