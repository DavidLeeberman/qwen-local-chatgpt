import { useState, useEffect, useRef } from 'react'
import { Virtuoso } from 'react-virtuoso'
import axios from 'axios'
import Login from './Login'

// import { atomDark } from ...
// import { vscDarkPlus } from ...
// import { materialDark } from ...

import ChatMessage from './components/ChatMessage'

import './App.css'

const generateId = () =>
  Date.now().toString(36) +
  Math.random().toString(36).slice(2)

export default function App() {
  const [token, setToken] = useState(null)
  const [conversations, setConversations] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [cid, setCid] = useState(null)
  const [chat, setChat] = useState([])
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const API = import.meta.env.VITE_API_URL

  const abortControllerRef = useRef(null)

  const textareaRef = useRef(null)
  const virtuosoRef = useRef(null)

  const handleAtBottomChange = (isAtBottom) => {
    setAutoScroll(isAtBottom)
  }

  useEffect(() => {
    if (!textareaRef.current) return

    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height =
      `${textareaRef.current.scrollHeight}px`
  }, [msg])

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
          current = {
            id: generateId(),
            u: m.content,
            a: ''
          }
        } else if (m.role === 'assistant') {
          if (!current) {
            current = {
              id: generateId(),
              u: '',
              a: ''
            }
          }
          current.a = m.content
          formatted.push(current)
          current = null
        }
      })

      if (current) formatted.push(current)

      setChat(formatted)

      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: Math.max(formatted.length - 1, 0),
          align: 'end'
        })
      })
    })
    .catch(err => {
      console.error(err)
      setErr(`Failed to load messages: ${err.message}`)
    })
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

    // Create the Abort controller
    abortControllerRef.current = new AbortController()

    const userMsg = msg
    setMsg('')
    setErr('')

    // add placeholder assistant message
    setChat(prev => [
      ...prev,
      {
        id: generateId(),
        u: userMsg,
        a: '',
        done: false
      }
    ])

    setAutoScroll(true)

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
        }),
        signal: abortControllerRef.current.signal // 🔥 Link the signal
      })

      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')

      const SSE_PREFIX = import.meta.env.VITE_SSE_PREFIX || 'data: '
      const SSE_DELIMITER = import.meta.env.VITE_SSE_DELIMITER || '\n\n\n\n'
      const SSE_CHUNK = import.meta.env.VITE_SSE_CHUNK || 'chunk'
      const SSE_DONE = import.meta.env.VITE_SSE_DONE || 'done'

      let buffer = ''

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

            // 🔥 live update last message
            const contentChunk = data[SSE_CHUNK];

            setChat(prev => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              
              // Directly append the chunk onto the actual previous UI state
              const currentText = updated[lastIndex]?.a || '';
              updated[lastIndex] = {
                ...updated[lastIndex],
                a: currentText + contentChunk
              };
              return updated;
            });
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
      if (e.name === 'AbortError') {
        console.log('Stream cancelled by user')
      } else {
        console.error(e)
        setErr('Streaming failed: ' + e.message)
      }
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
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh'
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0
          }}
        >
          <Virtuoso
            ref={virtuosoRef}
            data={chat}
            increaseViewportBy={800}
            followOutput={(isAtBottom) =>
              autoScroll && isAtBottom ? 'smooth' : false
            }
            atBottomStateChange={handleAtBottomChange}
            computeItemKey={(index, item) => item.id}
            itemContent={(index, item) => (
              <ChatMessage
                message={item}
                isLastStreaming={
                  !item.done &&
                  index === chat.length - 1
                }
              />
            )}
          />
        </div>

        {err && (
          <div
            style={{
              color: 'red',
              padding: '8px 12px'
            }}
          >
            {err}
          </div>
        )}

        {/* --- CHAT INPUT AREA --- */}
        <div
          style={{
            borderTop: '1px solid #ddd',
            padding: '12px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-end'
          }}
        >
          <textarea
            ref={textareaRef}
            style={{
              flex: 1,
              padding: '10px',
              fontSize: '16px',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              resize: 'none',
              overflow: 'hidden',
              minHeight: '44px',
              maxHeight: '200px'
            }}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Say something..."
            disabled={isStreaming}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.ctrlKey &&
                !e.altKey
              ) {
                e.preventDefault()

                if (!isStreaming && msg.trim()) {
                  send()
                }
              }
            }}
          />

          {isStreaming ? (
            <button 
              onClick={() => {
                if (abortControllerRef.current) {
                  abortControllerRef.current.abort();
                }
              }}
              style={{ 
                padding: '10px 20px', 
                backgroundColor: '#ff4d4f', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Stop
            </button>
          ) : (
            <button 
              onClick={send}
              style={{ 
                padding: '10px 20px', 
                backgroundColor: '#007bff', 
                color: 'white', 
                border: 'none', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}