import { useState, useEffect } from 'react'
import axios from 'axios'
import Login from './Login'

export default function App() {
  const [token, setToken] = useState(null)
  const [conversations, setConversations] = useState([])
  const [cid, setCid] = useState(null)
  const [chat, setChat] = useState([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const API = import.meta.env.VITE_API_URL

  // ✅ 1. Load token from localStorage (once)
  useEffect(() => {
    const t = localStorage.getItem('token')
    if (t && t !== 'undefined' && t !== 'null') {
      setToken(t)
    }
  }, [])

  // ✅ 2. Load conversations after token is ready
  useEffect(() => {
    if (!token) return

    axios.get(`${API}/api/conversations`, {
      headers: { Authorization: token }
    })
    .then(r => setConversations(r.data))
    .catch(() => setErr('Failed to load conversations'))
  }, [token])

  // ✅ logout (restored)
  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setChat([])
    setCid(null)
    setConversations([])
  }

  // ✅ load messages when switching conversation
  const loadMessages = (id) => {
    setCid(id)

    axios.get(`${API}/api/messages/${id}`, {
      headers: { Authorization: token }
    })
    .then(r => {
      const formatted = []
      let current = {}

      r.data.forEach(m => {
        if (m.role === 'user') {
          current = { u: m.content }
        } else if (m.role === 'assistant') {
          current.a = m.content
          formatted.push(current)
          current = {}
        }
      })

      setChat(formatted)
    })
    .catch(() => setErr('Failed to load messages'))
  }

  // ✅ create new chat
  const newChat = async () => {
    try {
      const r = await axios.post(`${API}/api/conversations`, {}, {
        headers: { Authorization: token }
      })

      const newId = r.data.conversation_id

      setCid(newId)
      setChat([])
      setConversations([{ id: newId }, ...conversations])
    } catch {
      setErr('Failed to create chat')
    }
  }

  // ✅ send message
  const send = async () => {
    if (!msg) return

    try {
      const r = await axios.post(
        `${API}/api/chat`,
        { message: msg, conversation_id: cid },
        { headers: { Authorization: token } }
      )

      setCid(r.data.conversation_id)

      setChat(prev => [...prev, { u: msg, a: r.data.response }])
      setMsg('')
      setErr('')
    } catch (e) {
      setErr('Chat failed')
    }
  }

  // ✅ if not logged in → show login
  if (!token) return <Login setToken={setToken} />

  return (
    <div style={{ display: 'flex' }}>
      {/* Sidebar */}
      <div style={{ width: 220, borderRight: '1px solid #ccc', padding: 10 }}>
        <button onClick={newChat}>+ New Chat</button>
        <button onClick={logout} style={{ marginLeft: 10 }}>Logout</button>

        <hr />

        {conversations.map(c => (
          <div
            key={c.id}
            onClick={() => loadMessages(c.id)}
            style={{
              cursor: 'pointer',
              padding: '5px 0',
              fontWeight: cid === c.id ? 'bold' : 'normal'
            }}
          >
            Chat {c.id}
          </div>
        ))}
      </div>

      {/* Chat */}
      <div style={{ flex: 1, padding: 10 }}>
        {chat.map((c, i) => (
          <div key={i}>
            <b>You:</b> {c.u}<br />
            <b>AI:</b> {c.a}
            <hr />
          </div>
        ))}

        <input
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Say something..."
        />

        <button onClick={send}>Send</button>

        {err && <div style={{ color: 'red' }}>{err}</div>}
      </div>
    </div>
  )
}