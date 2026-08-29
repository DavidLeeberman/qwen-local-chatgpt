from flask import Blueprint, request, jsonify
from database import get_db
from auth import verify_token

conv_bp = Blueprint('conv', __name__)

@conv_bp.route('/conversations', methods=['POST'])
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

@conv_bp.route('/conversations', methods=['GET'])
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

@conv_bp.route('/conversations/<int:cid>/messages', methods=['GET'])
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

@conv_bp.route('/chat/rename', methods=['POST'])
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


@conv_bp.route('/chat/pin', methods=['POST'])
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

@conv_bp.route('/chat/archive', methods=['POST'])
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

@conv_bp.route('/chat/delete', methods=['POST'])
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
            # Delete the conversation itself, enforcing ownership
            # PostgreSQL will automatically cascade this deletion to the 'messages' table.
            cur.execute("""
                DELETE FROM conversations 
                WHERE id = %s AND user_id = %s
            """, (cid, user['user_id']))
            
            conn.commit()
            
    return jsonify({"status": "success"})

@conv_bp.route('/chat/unarchive', methods=['POST'])
def unarchive_conversation():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401
    
    data = request.get_json()
    cid = data.get('conversation_id')

    if not cid:
        return jsonify({"error": "missing conversation_id"}), 400

    with get_db() as conn:
        with conn.cursor() as cur:
            # We set is_archived to FALSE and update the timestamp 
            # so the UI can automatically float it to the top of Recents
            cur.execute("""
                UPDATE conversations 
                SET is_archived = FALSE
                WHERE id = %s AND user_id = %s
            """, (cid, user['user_id']))
            conn.commit()
            
    return jsonify({"status": "success"})

@conv_bp.route('/chat/archive_all', methods=['POST'])
def archive_all_conversations():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    with get_db() as conn:
        with conn.cursor() as cur:
            # Archives all chats belonging to the current user
            cur.execute("""
                UPDATE conversations 
                SET is_archived = TRUE 
                WHERE user_id = %s
            """, (user['user_id'],))
            conn.commit()
            
    return jsonify({"status": "success"})

@conv_bp.route('/chat/delete_all', methods=['POST'])
def delete_all_conversations():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    with get_db() as conn:
        with conn.cursor() as cur:
            # Because 'messages' has ON DELETE CASCADE for conversation_id,
            # deleting the conversations safely drops all associated messages too.
            cur.execute("""
                DELETE FROM conversations 
                WHERE user_id = %s
            """, (user['user_id'],))
            conn.commit()
            
    return jsonify({"status": "success"})

@conv_bp.route('/conversations/search', methods=['GET'])
def search_conversations():
    user = verify_token(request.headers.get("Authorization"))
    if not user or 'user_id' not in user:
        return jsonify({"error": "unauthorized"}), 401

    query_str = request.args.get('q', '').strip()
    if not query_str:
        return jsonify([])

    search_pattern = f"%{query_str}%"
    user_id = user['user_id']

    with get_db() as conn:
        with conn.cursor() as cur:
            # SQL Architecture: Use a CTE to isolate exactly ONE row per matched conversation
            # before applying the LIMIT 100, preventing a single long chat from hoarding the limit.
            cur.execute("""
                WITH RankedMatches AS (
                    SELECT 
                        c.id AS conversation_id,
                        c.title,
                        c.updated_at,
                        c.is_archived,
                        m.id AS message_id,
                        m.role,
                        m.content,
                        m.created_at AS message_created_at,
                        ROW_NUMBER() OVER(
                            PARTITION BY c.id 
                            ORDER BY 
                                -- Prioritize rows where the message content actually matches so we get a useful snippet
                                CASE WHEN m.content ILIKE %s THEN 0 ELSE 1 END,
                                m.created_at DESC
                        ) as rn
                    FROM conversations c
                    LEFT JOIN messages m ON c.id = m.conversation_id
                    WHERE c.user_id = %s 
                      AND (c.title ILIKE %s OR m.content ILIKE %s)
                )
                SELECT 
                    conversation_id, title, updated_at, is_archived, 
                    message_id, role, content, message_created_at
                FROM RankedMatches
                WHERE rn = 1
                ORDER BY COALESCE(message_created_at, updated_at) DESC
                LIMIT 100
            """, (search_pattern, user_id, search_pattern, search_pattern))

            rows = cur.fetchall()

    results = []
    
    # We no longer need 'seen_cids' because the SQL CTE guarantees 1 row per conversation
    for r in rows:
        cid, title, updated_at, is_archived, msg_id, role, content, msg_created_at = r

        snippet = ""
        match_type = "title"

        if content:
            match_index = content.lower().find(query_str.lower())
            if match_index != -1:
                start = max(0, match_index - 40)
                end = min(len(content), match_index + len(query_str) + 60)
                snippet = ("..." if start > 0 else "") + content[start:end] + ("..." if end < len(content) else "")
                match_type = "content"
            else:
                snippet = content[:100] + ("..." if len(content) > 100 else "")

        results.append({
            "conversation_id": cid,
            "title": title or "New Chat",
            "updated_at": str(updated_at),
            "is_archived": bool(is_archived),
            "matched_message_id": msg_id,
            "matched_role": role,
            "match_type": match_type,
            "snippet": snippet
        })

    return jsonify(results)