import os

from flask import Flask, request, jsonify, Response, stream_with_context
import requests, hashlib, bcrypt, json
from auth import generate_token, verify_token
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
import atexit

app = Flask(__name__)

active_streams = {}

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

MAX_CONTEXT_MESSAGES = 20

def hash_password(password):
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")

def verify_password(password, stored_hash):

    if stored_hash.startswith("$2"):
        return bcrypt.checkpw(
            password.encode(),
            stored_hash.encode()
        ), None

    legacy_hash = hashlib.sha256(
        password.encode()
    ).hexdigest()

    return legacy_hash == stored_hash, legacy_hash
    
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
                SELECT id, title, updated_at, system_prompt, is_pinned, is_archived
                FROM conversations
                WHERE user_id=%s
                ORDER BY updated_at DESC
            """, (user['user_id'],))

            rows = cur.fetchall()

    return jsonify([
        {
            "id": r[0], 
            "title": r[1], 
            "updated_at": str(r[2]), 
            "system_prompt": r[3], 
            "is_pinned": bool(r[4]), # ✅ Ensure boolean mapping
            "is_archived": bool(r[5]) if r[5] is not None else False # ✅ Map archived status safely
        }
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
                SELECT id, role, content, created_at
                FROM messages
                WHERE conversation_id=%s
                ORDER BY id ASC
            """, (cid,))

            rows = cur.fetchall()

    return jsonify([
        {
            "id": r[0],
            "role": r[1],
            "content": r[2],
            "created_at": r[3].isoformat()
        }
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

                new_id = True
            else:
                # Ownership check
                cur.execute("""
                    SELECT 1 FROM conversations
                    WHERE id=%s AND user_id=%s
                """, (cid, uid))

                if not cur.fetchone():
                    return jsonify({"error": "forbidden"}), 403
                
                new_id = False

            # ✅ 2. Store user message securely using parameterization
            cur.execute(
                """
                INSERT INTO messages
                (conversation_id, role, content)
                VALUES (%s,%s,%s)
                RETURNING id
                """,
                (cid, "user", msg)
            )

            user_message_id = cur.fetchone()[0]
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
                SSE_IDS = os.getenv("SSE_IDS", "message_ids")
                SSE_ERR = os.getenv("SSE_ERR", "error")

                if new_id:
                    SSE_META = os.getenv("SSE_META", "meta")
                    meta_data = json.dumps({SSE_META: {"conversation_id": cid}})
                    yield f"{SSE_PREFIX}{meta_data}{SSE_DELIMITER}"

                llm_response = None
                cancelled = False

                full_response = ""

                try:
                    payload = {
                        "model": MODEL_NAME,
                        "messages": engine_messages,
                        "stream": True
                    }
                    
                    llm_response = requests.post(
                        MODEL_CHAT_URL,
                        json=payload,
                        stream=True,
                        timeout=(10, 600)
                    )
                    llm_response.raise_for_status()

                    # Register the active stream for potential cancellation if client disconnects
                    active_streams[cid] = llm_response

                    for line in llm_response.iter_lines():
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

                except (
                    GeneratorExit,
                    BrokenPipeError,
                    ConnectionResetError
                ):
                    cancelled = True
                    llm_response.close() if llm_response else None
                    return
                
                except Exception as e:
                    print("LLM ENGINE CHAT STREAM ERROR:", e)
                    error_data = json.dumps({SSE_ERR: f"LLM ENGINE CHAT STREAM ERROR: {str(e)}"})
                    yield f"{SSE_PREFIX}{error_data}{SSE_DELIMITER}"

                # 7. Store assistant metrics (full response) once pipeline yields empty/done statuses safely
                finally:
                    # Cleanup active stream registry to prevent memory leaks
                    active_streams.pop(cid, None)

                    if full_response:
                        with get_db() as save_conn:
                            try:
                                with save_conn.cursor() as db_cur:
                                    db_cur.execute(
                                        """
                                        INSERT INTO messages
                                        (conversation_id, role, content)
                                        VALUES (%s,%s,%s)
                                        RETURNING id
                                        """,
                                        (cid, "assistant", full_response)
                                    )

                                    assistant_message_id = db_cur.fetchone()[0]
                                    
                                    # Timestamp bookkeeping updates
                                    db_cur.execute("""
                                        UPDATE conversations SET updated_at=NOW() WHERE id=%s
                                    """, (cid,))
                                    save_conn.commit()

                                    # Prevent RuntimeErrors by yielding ONLY if not interrupted natively
                                    if not cancelled:
                                        ids_data = json.dumps({
                                            SSE_IDS: {
                                                "user_message_id": user_message_id,
                                                "assistant_message_id": assistant_message_id
                                            }
                                        })

                                        yield f"{SSE_PREFIX}{ids_data}{SSE_DELIMITER}"
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
                    cur.execute(
                        "UPDATE conversations SET title=%s WHERE id=%s",
                        (msg, cid)
                    )
                    conn.commit()
            except Exception as e:
                print("CONVERSATION TITLE UPDATE ERROR:", e)

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/chat/stop', methods=['POST'])
def stop_chat():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401
    
    data = request.get_json()
    cid = data.get('conversation_id')
    
    if not cid:
        return jsonify({"error": "missing conversation_id"}), 400
        
    # Verify ownership to prevent maliciously stopping others' streams
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM conversations
                WHERE id=%s AND user_id=%s
            """, (cid, user['user_id']))
            if not cur.fetchone():
                return jsonify({"error": "forbidden"}), 403

    # Close the HTTP socket directly, which instantly interrupts the generator and stops the GPU
    resp = active_streams.pop(cid, None)
    if resp:
        resp.close() 
        return jsonify({"status": "stopped"})
        
    return jsonify({"status": "not_found"})

@app.route('/chat/rename', methods=['POST'])
def rename_conversation():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401
    
    data = request.get_json()
    cid = data.get('conversation_id')
    new_title = data.get('title')

    if not cid or not new_title:
        return jsonify({"error": "missing conversation_id or title"}), 400

    # ✅ Securely update title belonging ONLY to this user
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE conversations 
                SET title = %s 
                WHERE id = %s AND user_id = %s
            """, (new_title, cid, user['user_id']))
            conn.commit()
            
    return jsonify({"status": "success"})


@app.route('/chat/pin', methods=['POST'])
def pin_conversation():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401
    
    data = request.get_json()
    cid = data.get('conversation_id')
    is_pinned = data.get('is_pinned', False)

    if not cid:
        return jsonify({"error": "missing conversation_id"}), 400

    # ✅ Securely update pin status belonging ONLY to this user
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE conversations 
                SET is_pinned = %s 
                WHERE id = %s AND user_id = %s
            """, (is_pinned, cid, user['user_id']))
            conn.commit()
            
    return jsonify({"status": "success"})

# ✅ New Endpoint: Archive Conversation
@app.route('/chat/archive', methods=['POST'])
def archive_conversation():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401
    
    data = request.get_json()
    cid = data.get('conversation_id')

    if not cid:
        return jsonify({"error": "missing conversation_id"}), 400

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE conversations 
                SET is_archived = TRUE 
                WHERE id = %s AND user_id = %s
            """, (cid, user['user_id']))
            conn.commit()
            
    return jsonify({"status": "success"})

# ✅ New Endpoint: Delete Conversation Permanently
@app.route('/chat/delete', methods=['POST'])
def delete_conversation():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401
    
    data = request.get_json()
    cid = data.get('conversation_id')

    if not cid:
        return jsonify({"error": "missing conversation_id"}), 400

    with get_db() as conn:
        with conn.cursor() as cur:
            # 1. Delete associated messages first to prevent foreign key errors (if CASCADE is not configured)
            cur.execute("""
                DELETE FROM messages 
                WHERE conversation_id = %s
            """, (cid,))
            
            # 2. Delete the conversation itself, enforcing ownership
            cur.execute("""
                DELETE FROM conversations 
                WHERE id = %s AND user_id = %s
            """, (cid, user['user_id']))
            
            conn.commit()
            
    return jsonify({"status": "success"})


if __name__ == '__main__':
    # Toggle debug setting safely for containerized runtimes
    flask_debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=5000, debug=flask_debug)