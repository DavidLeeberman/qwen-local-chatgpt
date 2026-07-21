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