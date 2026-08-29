import json
import requests
from flask import Blueprint, request, jsonify, Response, stream_with_context
from database import get_db
from auth import verify_token
from config import (
    MODEL_NAME, MODEL_CHAT_URL, MAX_CONTEXT_MESSAGES,
    SSE_PREFIX, SSE_DELIMITER, SSE_CHUNK, SSE_DONE, SSE_IDS, SSE_ERR, SSE_META
)

chat_bp = Blueprint('chat', __name__)
active_streams = {}

@chat_bp.route('/chat/stream', methods=['POST'])
def chat():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json()
    msg = data.get('message', '').strip()
    if not msg:
        return jsonify({"error": "empty message"}), 400
    
    uid = user['user_id']
    cid = data.get('conversation_id')
    history = data.get('history', []) # ✅ 1. Extract history from the frontend payload
    
    # ✅ Extract regeneration flags from frontend
    is_regenerate = data.get('is_regenerate', False)
    req_user_msg_id = data.get('user_message_id')
    
    # Extract original_title from the frontend payload (Option 1)
    original_title = data.get('original_title', None)
    new_title = f"[Branched]: {original_title} -> {msg}" if original_title else msg


    with get_db() as conn:
        with conn.cursor() as cur:

            # ✅ 2. Create conversation if not provided (Branching or New Chat triggers this)
            if not cid:
                cur.execute(
                    "INSERT INTO conversations (user_id) VALUES (%s) RETURNING id",
                    (uid,)
                )
                cid = cur.fetchone()[0]
                
                # ✅ 3. If history was passed (from a branched chat), save it to the DB first
                if history:
                    for h_msg in history:
                        h_role = h_msg.get('role')
                        h_content = h_msg.get('content')
                        if h_role and h_content:
                            cur.execute(
                                """
                                INSERT INTO messages
                                (conversation_id, role, content)
                                VALUES (%s,%s,%s)
                                """,
                                (cid, h_role, h_content)
                            )
                
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

            # 🔥 THE FIX: Aggressive Regeneration Fallbacks
            if is_regenerate:
                if req_user_msg_id:
                    user_message_id = req_user_msg_id
                else:
                    # Fallback: Frontend lost the ID (likely due to a stopped stream). 
                    # Grab the LAST user message in this specific conversation.
                    cur.execute(
                        "SELECT id FROM messages WHERE conversation_id=%s AND role='user' ORDER BY id DESC LIMIT 1",
                        (cid,)
                    )
                    row = cur.fetchone()
                    if row:
                        user_message_id = row[0]
                    else:
                        cur.execute(
                            "INSERT INTO messages (conversation_id, role, content) VALUES (%s,%s,%s) RETURNING id",
                            (cid, "user", msg)
                        )
                        user_message_id = cur.fetchone()[0]

                # Aggressively delete ALL assistant messages that came AFTER this user prompt.
                # This ensures partial/stopped responses are completely wiped from the DB and context window.
                cur.execute(
                    "DELETE FROM messages WHERE conversation_id=%s AND role='assistant' AND id > %s",
                    (cid, user_message_id)
                )
                conn.commit()
            else:
                # Standard flow: Store the NEW user message securely
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
                if new_id:
                    meta_data = json.dumps({
                        SSE_META: {
                            "conversation_id": cid,
                            "title": new_title
                        }
                    })
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
                            if decoded_line.startswith(SSE_PREFIX):
                                decoded_line = decoded_line[len(SSE_PREFIX):]

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
                        (new_title, cid)
                    )
                    conn.commit()
            except Exception as e:
                print("CONVERSATION TITLE UPDATE ERROR:", e)

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@chat_bp.route('/chat/stop', methods=['POST'])
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