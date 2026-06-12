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

  const [editingChatId, setEditingChatId] = useState(null)
  const [editTitleBuffer, setEditTitleBuffer] = useState('')

  const API = import.meta.env.VITE_API_URL

  const abortControllerRef = useRef(null)
  const loadMessagesAbortRef = useRef(null)

  const textareaRef = useRef(null)
  const virtuosoRef = useRef(null)

  const pendingTextRef = useRef('')
  const flushTimerRef = useRef(null)

  const activeStreamMessageIdRef = useRef(null)
  const streamSessionRef = useRef(0)

  // Create a single ref to track real-time streaming state without re-binding listeners
  const lifecycleStateRef = useRef({ isStreaming, cid, token })
  lifecycleStateRef.current = { isStreaming, cid, token }

  const togglePin = async (id, currentPinStatus) => {
    try {
      // Optimistic UI update
      setConversations(prev => prev.map(c => 
        c.id === id ? { ...c, is_pinned: !currentPinStatus } : c
      ))
      
      await axios.post(
        `${API}/api/chat/pin`, 
        { conversation_id: id, is_pinned: !currentPinStatus }, 
        { headers: { Authorization: token } }
      )
    } catch (err) {
      console.error("Failed to pin/unpin", err)
      loadMessages() // Revert on failure
    }
  }

  const saveRenamedTitle = async (id) => {
    if (!editTitleBuffer.trim()) {
      setEditingChatId(null)
      return
    }

    try {
      // Optimistic UI update
      setConversations(prev => prev.map(c => 
        c.id === id ? { ...c, title: editTitleBuffer } : c
      ))
      setEditingChatId(null)

      await axios.post(
        `${API}/api/chat/rename`, 
        { conversation_id: id, title: editTitleBuffer }, 
        { headers: { Authorization: token } }
      )
    } catch (err) {
      console.error("Failed to rename", err)
      loadMessages() // Revert on failure
    }
  }

  const handleAtBottomChange = (isAtBottom) => {
    setAutoScroll(isAtBottom)
  }

  const flushPendingText = () => {
    if (!pendingTextRef.current) return

    const text = pendingTextRef.current
    pendingTextRef.current = ''

    const targetId = activeStreamMessageIdRef.current

    if (!targetId) return

    setChat(prev =>
      prev.map(message =>
        message.id === targetId
          ? {
              ...message,
              a: (message.a || '') + text
            }
          : message
      )
    )
  }

  const stopStreaming = (useKeepAlive = false) => {
    if (!cid || !token) return;

    if (useKeepAlive) {
      // 🔥 Guarantees the request fires even as the tab is closing
      fetch(`${API}/api/chat/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify({ conversation_id: cid }),
        keepalive: true 
      }).catch(() => {})
    } else {
      // Standard usage
      axios.post(
        `${API}/api/chat/stop`, 
        { conversation_id: cid }, 
        { headers: { Authorization: token } }
      ).catch(err => console.error("Failed to stop generation:", err))
    }
  }

  const cleanupStream = (
    flushPending = false,
    isInterrupt = false
  ) => {
    if (flushPending) {
      flushPendingText()
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null

      // 🔥 If we are abruptly aborting an active stream, kill the backend GPU process
      if (isInterrupt) {
        stopStreaming()
      }
    }

    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }

    pendingTextRef.current = ''
    activeStreamMessageIdRef.current = null
    
    setIsStreaming(false)

    streamSessionRef.current ++
  }

  const finishCurrentStreamingMessage = () => {
    const targetId = activeStreamMessageIdRef.current

    if (!targetId) return

    setChat(prev =>
      prev.map(message =>
        message.id === targetId
          ? {
              ...message,
              done: true
            }
          : message
      )
    )
  }

  // ✅ Unified Lifecycle Handler: Binds once on mount, handles tab closures & component unmounting cleanly
  useEffect(() => {
    const handleBeforeUnload = () => {
      const { isStreaming: streaming, cid: currentCid, token: currentToken } = lifecycleStateRef.current
      
      // If a stream is active when the browser tab closes/refreshes, fire the keepalive beacon
      if (streaming && currentCid && currentToken) {
        fetch(`${API}/api/chat/stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': currentToken
          },
          body: JSON.stringify({ conversation_id: currentCid }),
          keepalive: true 
        }).catch(() => {})
      }
    }

    // Bind browser listener exactly once
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      // Clean up browser listener when component unmounts
      window.removeEventListener('beforeunload', handleBeforeUnload)

      // Clean up all active React stream intervals, abort controllers, and timers
      cleanupStream()
      loadMessagesAbortRef.current?.abort()
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
      }
    }
  }, [API]) // API is stable, so this effect runs exactly once on mount

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

    const controller = new AbortController()

    axios.get(`${API}/api/conversations`, {
      headers: {
        Authorization: token
      },
      signal: controller.signal
    })
    .then(async r => {
      setConversations(r.data)

      if (r.data.length === 0) {
        const res = await axios.post(
          `${API}/api/conversations`,
          {},
          {
            headers: {
              Authorization: token
            },
            signal: controller.signal
          }
        )

        setCid(res.data.conversation_id)

        setConversations([
          {
            id: res.data.conversation_id
          }
        ])
      }
    })
    .catch(err => {
      if (
        err.name === 'CanceledError' ||
        err.code === 'ERR_CANCELED'
      ) {
        return
      }

      console.error(err)
    })

    return () => {
      controller.abort()
    }
  }, [token, API])

  // ✅ logout (restored)
  const logout = () => {
    cleanupStream(false, true)

    loadMessagesAbortRef.current?.abort()

    localStorage.removeItem('token')
    
    setToken(null)
    setChat([])
    setCid(null)
    setConversations([])
  }

  // ✅ load messages when switching conversation
  const loadMessages = async (id) => {
    // Stop any active stream first
    cleanupStream(false, true)

    // Cancel previous loadMessages request
    loadMessagesAbortRef.current?.abort()

    const controller = new AbortController()
    loadMessagesAbortRef.current = controller

    setCid(id)
    setErr('')

    try {
      const r = await axios.get(
        `${API}/api/conversations/${id}/messages`,
        {
          headers: {
            Authorization: token
          },
          signal: controller.signal
        }
      )

      // Ignore if another request replaced this one
      if (loadMessagesAbortRef.current !== controller) {
        return
      }

      const formatted = []
      let current = null

      r.data.forEach(m => {
        if (m.role === 'user') {
          if (current) {
            formatted.push(current)
          }

          current = {
            id: m.id,
            userMessageId: m.id,
            assistantMessageId: null,
            u: m.content,
            a: '',
            createdAt: m.created_at
          }
        }
        else if (m.role === 'assistant') {
          if (!current) {
            formatted.push({
              id: m.id,
              userMessageId: null,
              assistantMessageId: m.id,
              u: '',
              a: m.content,
              createdAt: m.created_at
            })

            return
          }

          current.assistantMessageId = m.id
          current.a = m.content

          formatted.push(current)
          current = null
        }
      })

      if (current) {
        formatted.push(current)
      }

      setChat(formatted)

      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: Math.max(formatted.length - 1, 0),
          align: 'end'
        })
      })
    }
    catch (err) {
      if (
        err.name === 'CanceledError' ||
        err.code === 'ERR_CANCELED'
      ) {
        return
      }

      console.error(err)

      setErr(
        `Failed to load messages: ${
          err.response?.data?.error ||
          err.message
        }`
      )
    }
    finally {
      if (loadMessagesAbortRef.current === controller) {
        loadMessagesAbortRef.current = null
      }
    }
  }

  // ✅ create new chat
  const newChat = async () => {
    cleanupStream(false, true)

    try {
      const r = await axios.post(`${API}/api/conversations`, {}, {
        headers: { Authorization: token }
      })

      setCid(r.data.conversation_id)
      setChat([])
      setConversations(prev => [
        {
          id: r.data.conversation_id,
          title: 'New Chat'
        },
        ...prev
      ])
    } catch {
      setErr('Failed to create chat')
    }
  }

  // ✅ send message
  const send = async () => {
    if (isStreaming) return

    const userMsg = msg.trim()
    if (!userMsg) return

    const mySession = ++streamSessionRef.current

    // Create the Abort controller
    abortControllerRef.current = new AbortController()

    setMsg('')
    setErr('')

    // add placeholder assistant message
    const tempId = generateId()

    activeStreamMessageIdRef.current = tempId

    setChat(prev => [
      ...prev,
      {
        id: tempId,
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

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')

      const SSE_PREFIX = import.meta.env.VITE_SSE_PREFIX || 'data: '
      const SSE_DELIMITER = import.meta.env.VITE_SSE_DELIMITER || '\n\n\n\n'
      const SSE_CHUNK = import.meta.env.VITE_SSE_CHUNK || 'chunk'
      const SSE_DONE = import.meta.env.VITE_SSE_DONE || 'done'
      const SSE_IDS = import.meta.env.VITE_SSE_IDS || 'message_ids'
      const SSE_META = import.meta.env.VITE_SSE_META || 'meta'
      const SSE_ERR = import.meta.env.VITE_SSE_ERR || 'error'

      let buffer = ''

      while (true) {
        if (mySession !== streamSessionRef.current) return

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split(SSE_DELIMITER)
        buffer = lines.pop()  // keep incomplete line

        for (let i = 0; i < lines.length; i ++) {
          if (!lines[i].startsWith(SSE_PREFIX)) continue

          const rawJson = lines[i].slice(SSE_PREFIX.length)
          let data

          try {
            data = JSON.parse(rawJson)
          } catch (e) {
            console.error(e)
            // setErr(`JSON Error: ${lines[i]}` + i === lines.length - 1 ? `` : ` + ${lines[i + 1]}`)
            throw new Error(`JSON Error: `
                          + `line ${i - 1}: ` + (i === 0 ? `[]` : `[${lines[i - 1]}]`) + `, `
                          + `line ${i}: [${lines[i]}], ` 
                          + `line ${i + 1}: ` + (i === lines.length - 1 ? `[]` : `[${lines[i + 1]}]`))
          }

          if (data[SSE_META]) {
            const newConversationId = data[SSE_META].conversation_id

            setCid(newConversationId)

            setConversations(prev => {
              if (prev.some(c => c.id === newConversationId))
                return prev

              return [
                {
                  id: newConversationId,
                  title: userMsg.slice(0, 50)
                },
                ...prev
              ]
            })

            continue
          }

          if (data[SSE_IDS]) {
            const {
              user_message_id,
              assistant_message_id
            } = data[SSE_IDS]

            const targetId = activeStreamMessageIdRef.current

            setChat(prev =>
              prev.map(message =>
                message.id === targetId
                  ? {
                      ...message,
                      userMessageId: user_message_id,
                      assistantMessageId: assistant_message_id
                    }
                  : message
              )
            )
            
            continue
          }
          
          if (data[SSE_ERR]) {
            throw new Error(data[SSE_ERR])
          }

          if (data[SSE_DONE]) {
            if (flushTimerRef.current) {
                clearTimeout(flushTimerRef.current)
                flushTimerRef.current = null
            }
            flushPendingText()

            const targetId = activeStreamMessageIdRef.current

            setChat(prev =>
              prev.map(message =>
                message.id === targetId
                  ? {
                      ...message,
                      done: true
                    }
                  : message
              )
            )

            cleanupStream() // reset stream state
            
            return
          }

          // 🔥 live update last message
          const contentChunk = data[SSE_CHUNK]

          pendingTextRef.current += contentChunk

          if (!flushTimerRef.current) {
            flushTimerRef.current = setTimeout(() => {
              flushPendingText()
              flushTimerRef.current = null
            }, 50)
          }
        }
      }

      if (pendingTextRef.current) {
        flushPendingText()
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('Stream cancelled by user')
        finishCurrentStreamingMessage()
      } else {
        console.error(e)
        setErr('Streaming failed: ' + e.message)
      }

      activeStreamMessageIdRef.current = null
      abortControllerRef.current = null
      pendingTextRef.current = ''
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

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {[...conversations]
            // Sort pinned items to the top
            .sort((a, b) => {
              if (a.is_pinned === b.is_pinned) return 0;
              return a.is_pinned ? -1 : 1;
            })
            .map((c) => (
              <div 
                key={c.id} 
                className={`chat-list-item ${c.id === cid ? 'active' : ''}`}
                onClick={() => {
                  if (editingChatId !== c.id) {
                    loadMessages(c.id)
                  }
                }}
              >
                
                {/* Feature 4: Rename Input vs Normal Title */}
                {editingChatId === c.id ? (
                  <input
                    className="chat-title-input"
                    value={editTitleBuffer}
                    onChange={(e) => setEditTitleBuffer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRenamedTitle(c.id)
                      if (e.key === 'Escape') setEditingChatId(null)
                    }}
                    onClick={(e) => e.stopPropagation()} // Prevent loading chat while clicking input
                    autoFocus
                  />
                ) : (
                  <div className="chat-title-text">
                    {c.is_pinned ? '📌 ' : ''}
                    {c.title || 'New Chat'}
                  </div>
                )}

                {/* Feature 3 & 4: Action Buttons */}
                <div className="chat-list-actions" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={() => togglePin(c.id, c.is_pinned)}
                    title={c.is_pinned ? "Unpin" : "Pin"}
                  >
                    {c.is_pinned ? '📍' : '📌'}
                  </button>
                  
                  {editingChatId === c.id ? (
                    <button onClick={() => saveRenamedTitle(c.id)}>✅</button>
                  ) : (
                    <button onClick={() => {
                      setEditingChatId(c.id)
                      setEditTitleBuffer(c.title || '')
                    }}>✏️</button>
                  )}
                </div>

              </div>
            ))
          }
        </div>
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
                finishCurrentStreamingMessage()
                cleanupStream(true, true)
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