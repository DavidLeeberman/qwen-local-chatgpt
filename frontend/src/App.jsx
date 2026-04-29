import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import axios from 'axios'
import Login from './Login'

export default function App() {
  const [token, setToken] = useState(null)
  const [conversations, setConversations] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [cid, setCid] = useState(null)
  const [chat, setChat] = useState([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const API = import.meta.env.VITE_API_URL

  const bottomRef = useRef(null)

  const isNearBottom = () => {
    const el = bottomRef.current?.parentElement
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }

  useEffect(() => {
    if (isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chat])

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
    .then(async r => {
      setConversations(r.data)

      if (r.data.length === 0) {
        // 👇 auto-create first chat
        const res = await axios.post(`${API}/api/conversations`, {}, {
          headers: { Authorization: token }
        })

        setCid(res.data.conversation_id)
        setConversations([{ id: res.data.conversation_id }])
      }
    })
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

    axios.get(`${API}/api/conversations/${id}/messages`, {
      headers: { Authorization: token }
    })
    .then(r => {
      const formatted = []
      let current = null

      r.data.forEach(m => {
        if (m.role === 'user') {
          if (current) formatted.push(current)
          current = { u: m.content, a: '' }
        } else if (m.role === 'assistant') {
          if (!current) current = { u: '', a: '' }
          current.a = m.content
          formatted.push(current)
          current = null
        }
      })

      if (current) formatted.push(current)

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

      setCid(r.data.conversation_id)
      setChat([])
    } catch {
      setErr('Failed to create chat')
    }
  }

  // ✅ send message
  const send = async () => {
    if (!msg) return

    const userMsg = msg
    setMsg('')
    setErr('')

    // add placeholder assistant message
    setChat(prev => [...prev, { u: userMsg, a: '', done: false }])

    setIsStreaming(true)

    try {
      const res = await fetch(`${API}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({
          message: userMsg,
          conversation_id: cid
        })
      })

      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')

      const SSE_PREFIX = import.meta.env.VITE_SSE_PREFIX || 'data: '
      const SSE_DELIMITER = import.meta.env.VITE_SSE_DELIMITER || '\n\n\n\n'
      const SSE_CHUNK = import.meta.env.VITE_SSE_CHUNK || 'chunk'
      const SSE_DONE = import.meta.env.VITE_SSE_DONE || 'done'

      let buffer = ''
      let assistantText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split(SSE_DELIMITER)
        buffer = lines.pop()  // keep incomplete line

        for (let i = 0; i < lines.length; i ++) {
          if (!lines[i].startsWith(SSE_PREFIX)) continue

          const rawJson = lines[i].slice(SSE_PREFIX.length)

          try {
            const data = JSON.parse(rawJson)
            if (data[SSE_DONE]) {
              setChat(prev => {
                const updated = [...prev]
                updated[updated.length - 1].done = true
                return updated
              })

              setIsStreaming(false)
              return
            }

            assistantText += data[SSE_CHUNK]

            // 🔥 live update last message
            setChat(prev => {
              const updated = [...prev]
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                a: assistantText
              }
              return updated
            })
          } catch (e) {
            console.error(e)
            // setErr(`JSON Error: ${lines[i]}` + i === lines.length - 1 ? `` : ` + ${lines[i + 1]}`)
            throw new Error(`JSON Error: `
                          + `line ${i - 1}: ` + (i === 0 ? `[]` : `[${lines[i - 1]}]`) + `, `
                          + `line ${i}: [${lines[i]}], ` 
                          + `line ${i + 1}: ` + (i === lines.length - 1 ? `[]` : `[${lines[i + 1]}]`))
          }
        }
      }

    } catch (e) {
      console.error(e)
      setErr('Streaming failed: ' + e.message)
    } finally {
      setIsStreaming(false)
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
            {c.title || ''}
          </div>
        ))}
      </div>

      {/* Chat */}
      <div style={{ flex: 1, padding: 10, overflowY: 'auto', height: '100vh' }}>
        {chat.map((c, i) => (
          <div key={i}>
            <div style={{ marginBottom: 12 }}>
              <div><b>You:</b> {c.u}</div>
              <div style={{ background: '#f5f5f5', padding: 8 }}>
                {isStreaming && i === chat.length - 1 ? (
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5',
                    fontFamily: 'system-ui'
                  }}>
                    {c.a}
                  </div>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {c.a}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          </div>
        ))}

        <div ref={bottomRef}></div>

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