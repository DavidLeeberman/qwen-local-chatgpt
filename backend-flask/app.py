import os

from flask import Flask, request, jsonify, Response, stream_with_context
import requests, hashlib, json
from auth import generate_token, verify_token
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
import atexit

app = Flask(__name__)

# ✅ SECURITY FIX: Read from environment variables populated via env_file (.env)
db_pool = ThreadedConnectionPool(
    minconn=2,
    maxconn=20,
    host=os.getenv("POSTGRES_HOST", "postgres"),
    dbname=os.getenv("POSTGRES_DB", "qwen"),
    user=os.getenv("POSTGRES_USER", "admin"),
    password=os.getenv("POSTGRES_PASSWORD", "password")
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

# OLLAMA = "http://ollama:11434/api/generate"

# ✅ MODEL ROUTING FIX: Switched endpoint to /api/chat to let LLM engine manage ChatML/Gemma templates natively
# MODEL_CHAT_URL = os.getenv("OLLAMA_CHAT_URL", "http://ollama:11434/api/chat")
# MODEL_NAME = os.getenv("OLLAMA_QWEN_NAME", "qwen3.5:9b")
MODEL_CHAT_URL = os.getenv("VLLM_CHAT_URL", "http://vllm:10000/v1/chat/completions")
MODEL_NAME = os.getenv("VLLM_QWEN_NAME", "Qwen/Qwen3.5-9B")

MAX_CONTEXT_MESSAGES = 10

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


@app.route('/login', methods=['POST'])
def login():
    d = request.get_json()

    if not d or 'username' not in d or 'password' not in d:
        return jsonify({"error": "invalid request"}), 400

    with get_db() as conn:
        with conn.cursor() as cur:
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

    with get_db() as conn:
        with conn.cursor() as cur:
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

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, title, updated_at, system_prompt
                FROM conversations
                WHERE user_id=%s
                ORDER BY updated_at DESC
            """, (user['user_id'],))

            rows = cur.fetchall()

    return jsonify([
        {"id": r[0], "title": r[1], "updated_at": str(r[2]), "system_prompt": r[3]}
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

    with get_db() as conn:
        with conn.cursor() as cur:
            # Ownership check
            cur.execute("""
                SELECT 1 FROM conversations
                WHERE id=%s AND user_id=%s
            """, (cid, user['user_id']))

            if not cur.fetchone():
                return jsonify({"error": "forbidden"}), 403

            # ✅ IMPORTANT: Enforce ownership
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

@app.route('/chat/stream', methods=['POST'])
def chat():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    uid = user['user_id']
    data = request.get_json()

    cid = data.get('conversation_id')
    msg = data.get('message', '').strip()

    if not msg:
        return jsonify({"error": "empty message"}), 400

    with get_db() as conn:
        with conn.cursor() as cur:

            # ✅ 1. Create conversation if not provided
            if not cid:
                cur.execute(
                    "INSERT INTO conversations (user_id) VALUES (%s) RETURNING id",
                    (uid,)
                )
                cid = cur.fetchone()[0]
                conn.commit()

            else:
                # Ownership check
                cur.execute("""
                    SELECT 1 FROM conversations
                    WHERE id=%s AND user_id=%s
                """, (cid, uid))

                if not cur.fetchone():
                    return jsonify({"error": "forbidden"}), 403

            # ✅ 2. Store user message securely using parameterization
            cur.execute(
                "INSERT INTO messages (conversation_id, role, content) VALUES (%s,%s,%s)",
                (cid, "user", msg)
            )
            conn.commit()

            # 3. Pull System Instructions for this Conversation
            cur.execute("SELECT system_prompt FROM conversations WHERE id=%s", (cid,))
            system_prompt_row = cur.fetchone()
            system_prompt = system_prompt_row[0] if system_prompt_row else "You are a helpful assistant."

            # 4. Fetch history - last N messages (context) with ownership check already done, ordered oldest to newest for proper conversation flow
            cur.execute("""
                SELECT role, content FROM messages
                WHERE conversation_id=%s
                ORDER BY id DESC
                LIMIT %s
            """, (cid, MAX_CONTEXT_MESSAGES))
            message_rows = cur.fetchall()
            message_rows.reverse()

            # 5. Build agnostic structured message array payload
            engine_messages = []
            
            # Inject the system guidelines first
            if system_prompt:
                engine_messages.append({"role": "system", "content": system_prompt})
                
            # Append past message sequences dynamically
            for role, content in message_rows:
                engine_messages.append({"role": role, "content": content})

            # 6. Call LLM engine and generate streaming response with the agnostic Chat API schema
            def generate():
                SSE_PREFIX = os.getenv("SSE_PREFIX", "data: ")
                SSE_DELIMITER = os.getenv("SSE_DELIMITER", "\n\n\n\n")
                SSE_CHUNK = os.getenv("SSE_CHUNK", "chunk")
                SSE_DONE = os.getenv("SSE_DONE", "done")

                full_response = ""

                try:
                    payload = {
                        "model": MODEL_NAME,
                        "messages": engine_messages,
                        "stream": True
                    }
                    
                    with requests.post(
                        MODEL_CHAT_URL,
                        json=payload,
                        stream=True,
                        timeout=(10, 600)
                    ) as r:
                        for line in r.iter_lines():
                            if not line:
                                continue

                            # Handles Ollama streaming only
                            # try:
                            #     line_data = json.loads(line.decode("utf-8"))
                            #     # Note: /api/chat payload yields chunk fragments nested in a 'message' object
                            #     chunk = line_data.get("message", {}).get("content", "")
                            # except Exception:
                            #     continue

                            # Handles both vLLM and Ollama streaming
                            try:
                                # 1. Handles standard OpenAI SSE trimming to cleanly decode and trim the SSE prefix
                                decoded_line = line.decode("utf-8")

                                prefix = "data: "
                                if decoded_line.startswith(prefix):
                                    decoded_line = decoded_line[len(prefix):]

                                decoded_line = decoded_line.strip()
                                
                                # 🔥 CRITICAL GUARD: Catch vLLM/OpenAI completion signal before parsing JSON
                                if decoded_line == "[DONE]":
                                    break

                                line_data = json.loads(decoded_line)
                                
                                # 2. Handle standard OpenAI/vLLM nested stream fragment dictionary structure
                                choices = line_data.get("choices", [])
                                if choices:
                                    # vLLM/OpenAI structure path
                                    chunk = choices[0].get("delta", {}).get("content", "")
                                else:
                                    # Fallback to standard Ollama response architecture if you switch back
                                    chunk = line_data.get("message", {}).get("content", "")
                                    
                            except Exception:
                                continue

                            if chunk:
                                full_response += chunk
                                chunk_data = json.dumps({SSE_CHUNK: chunk, SSE_DONE: False})
                                yield f"{SSE_PREFIX}{chunk_data}{SSE_DELIMITER}"

                except Exception as e:
                    print("LLM ENGINE CHAT STREAM ERROR:", e)
                    yield f"{SSE_PREFIX}[ERROR: {e}]{SSE_DELIMITER}"

                # 7. Store assistant metrics (full response) once pipeline yields empty/done statuses safely
                if full_response:
                    with get_db() as save_conn:
                        try:
                            with save_conn.cursor() as db_cur:
                                db_cur.execute(
                                    "INSERT INTO messages (conversation_id, role, content) VALUES (%s,%s,%s)",
                                    (cid, "assistant", full_response)
                                )
                                
                                # Timestamp bookkeeping updates
                                db_cur.execute("""
                                    UPDATE conversations SET updated_at=NOW() WHERE id=%s
                                """, (cid,))
                                save_conn.commit()
                        except Exception as db_err:
                            save_conn.rollback()
                            print("POST-STREAM DB SAVE CRITICAL FAILURE:", db_err)

                # Signal stream completion and handle 'jailbreak'
                done_data = json.dumps({SSE_CHUNK: "", SSE_DONE: True})
                yield f"{SSE_PREFIX}{done_data}{SSE_DELIMITER}"

            # 8. Auto-generate conversation title (ONLY if empty) based on first user message for better UX
            try:
                cur.execute("SELECT title FROM conversations WHERE id=%s", (cid,))
                row = cur.fetchone()
                if row and not row[0]:
                    title = msg[:50]
                    cur.execute(
                        "UPDATE conversations SET title=%s WHERE id=%s",
                        (title, cid)
                    )
                    conn.commit()
            except Exception as e:
                print("TITLE UPDATE ERROR:", e)

    return Response(stream_with_context(generate()), mimetype='text/event-stream')


if __name__ == '__main__':
    # Toggle debug setting safely for containerized runtimes
    flask_debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=5000, debug=flask_debug)