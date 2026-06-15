import { useState, useEffect, useRef } from 'react'
import { Virtuoso } from 'react-virtuoso'
import axios from 'axios'
import Login from './Login'

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
    
  // Added state for handling the 3-dots dropdown menu
  const [openDropdownCid, setOpenDropdownCid] = useState(null)

  // ✅ Feature 2: State for the custom hover tooltip
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 })

  // Sidebar collapsible states
  const [isPinnedOpen, setIsPinnedOpen] = useState(true)
  const [isRecentsOpen, setIsRecentsOpen] = useState(true)

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

  // ✅ Standalone implementation with AbortController support and auto-creation
  const fetchConversations = async (signal = null) => {
    if (!token) {
      setConversations([])
      return
    }

    try {
      const r = await axios.get(`${API}/api/conversations`, {
        headers: { Authorization: token },
        signal
      })

      setConversations(r.data)

      // Auto-create first chat if list is empty
      if (r.data.length === 0) {
        const res = await axios.post(
          `${API}/api/conversations`,
          {},
          {
            headers: { Authorization: token },
            signal
          }
        )

        setCid(res.data.conversation_id)
        setConversations([{ id: res.data.conversation_id }])
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        return // Safely ignore abort cancellations
      }
      console.error('Failed to fetch conversations:', err)
    }
  }

  const togglePin = async (e, id, currentPinStatus) => {
    e.stopPropagation()
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
      fetchConversations() // Revert on failure
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
      fetchConversations() // Revert on failure
    }
  }
  
  // ✅ New Feature: Archive Conversation
  const archiveConversation = async (id) => {
    // Optimistically remove it from the local list
    setConversations(prev => prev.filter(c => c.id !== id))
    if (cid === id) {
      setCid(null)
      setChat([])
    }
    setOpenDropdownCid(null)

    try {
      await axios.post(
        `${API}/api/chat/archive`, 
        { conversation_id: id }, 
        { headers: { Authorization: token } }
      )
    } catch (err) {
      console.error("Failed to archive", err)
      fetchConversations() // Revert on failure
    }
  }

  // ✅ New Feature: Delete Conversation
  const deleteConversation = async (id) => {
    // Optimistically remove it from the local list
    setConversations(prev => prev.filter(c => c.id !== id))
    if (cid === id) {
      setCid(null)
      setChat([])
    }
    setOpenDropdownCid(null)

    try {
      await axios.post(
        `${API}/api/chat/delete`, 
        { conversation_id: id }, 
        { headers: { Authorization: token } }
      )
    } catch (err) {
      console.error("Failed to delete", err)
      fetchConversations() // Revert on failure
    }
  }

  // ✅ Feature 2: Handlers to calculate and display the Tooltip only if truncated
  const handleTitleMouseEnter = (e, text) => {
    const titleEl = e.currentTarget; // The <span> (.conversation-title-text)
    const rowEl = titleEl.closest('.conversation-item');
    
    if (titleEl && rowEl) {
      const actionsEl = rowEl.querySelector('.conversation-actions');
      const actionsWidth = actionsEl ? actionsEl.getBoundingClientRect().width : 0;
      
      // Accounts for the margin-left: 8px applied to actions on hover in your CSS
      const actionsMargin = actionsWidth > 0 ? 8 : 0;
      
      // Calculate the exact maximum width available for text when actions are width: 0
      const maxUnhoveredWidth = titleEl.getBoundingClientRect().width + actionsWidth + actionsMargin;

      // Only trigger the custom tooltip if the full text overflows the unhovered layout
      if (titleEl.scrollWidth > Math.ceil(maxUnhoveredWidth)) {
        // Find the parent item so we can position the tooltip outside the right edge of the sidebar
        const parentItem = titleEl.closest('.conversation-item')
        if (parentItem) {
          const rect = parentItem.getBoundingClientRect()
          setTooltip({
            visible: true,
            text: text,
            x: rect.right + 12, // 12px padding away from the sidebar scrollbar
            y: rect.top + (rect.height / 2) // Vertically center it with the item
          })
        }
      }
    }
  }

  const handleTitleMouseLeave = () => {
    setTooltip({ visible: false, text: '', x: 0, y: 0 })
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
  
  // ✅ Robust Dropdown Menu Interaction Catchers
  useEffect(() => {
    const handleOutsideClick = (e) => {
      // If clicking anywhere outside the 3-dots action area, close the menu.
      // NOTE: Because mousedown captures BOTH left and right clicks, this fulfills the mouse requirement perfectly.
      if (!e.target.closest('.conversation-actions')) {
        setOpenDropdownCid(null)
      }
    }

    const handleEscapeKey = (e) => {
      if (e.key === 'Escape') {
        setOpenDropdownCid(null)
      }
    }

    // Capture Left Click, Right Click, and ESC to dismiss the menu
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('contextmenu', handleOutsideClick)
    document.addEventListener('keydown', handleEscapeKey)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('contextmenu', handleOutsideClick)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [])

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

  // ✅ 2. Load conversations after token is ready (passing the signal)
  useEffect(() => {
    const controller = new AbortController()

    fetchConversations(controller.signal)

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

  // --- REUSABLE COMPONENT: Renders individual items for both sections ---
  const renderChatItem = (c) => (
    <div 
      key={c.id} 
      // ✅ Feature 1 Fix: Appends 'dropdown-open' class so CSS keeps the actions visible
      className={`conversation-item ${c.id === cid ? 'active' : ''} ${openDropdownCid === c.id ? 'dropdown-open' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        if (editingChatId !== c.id) {
          loadMessages(c.id)
          setOpenDropdownCid(null)
        }
      }}
    >
      <div className="conversation-title-wrapper">
        {/* Only mark pinned conversations with a bubble icon */}
        {c.is_pinned && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}

        {editingChatId === c.id ? (
          <input
            className="chat-rename-input"
            value={editTitleBuffer}
            onChange={(e) => setEditTitleBuffer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveRenamedTitle(c.id)
              if (e.key === 'Escape') setEditingChatId(null)
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          /* ✅ Feature 2: Removed native HTML title, replaced with custom handlers */
          <span 
            className="conversation-title-text" 
            onMouseEnter={(e) => handleTitleMouseEnter(e, c.title || 'New Chat')}
            onMouseLeave={handleTitleMouseLeave}
          >
            {c.title || 'New Chat'}
          </span>
        )}
      </div>

      {/* Context Controls: Pin on left, 3 horizontal dots on right */}
      <div className="conversation-actions" onClick={(e) => e.stopPropagation()}>
        <button 
          className="action-btn"
          onClick={(e) => togglePin(e, c.id, c.is_pinned)}
          title={c.is_pinned ? "Unpin Chat" : "Pin Chat"}
        >
          {/* Tilted Pin, with vertical crossing line for "Unpin" state */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(45deg)' }}>
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76Z" />
            {c.is_pinned && <line x1="4" y1="12" x2="20" y2="12" />}
          </svg>
        </button>
        
        <button 
          className="action-btn"
          onClick={(e) => {
            e.stopPropagation()
            setOpenDropdownCid(openDropdownCid === c.id ? null : c.id)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="19" cy="12" r="2"/>
          </svg>
        </button>

        {/* Droplist Popover Menu */}
        {openDropdownCid === c.id && (
          <div className="dropdown-menu">
            <div className="dropdown-item" onClick={(e) => togglePin(e, c.id, c.is_pinned)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(45deg)' }}>
                <path d="M12 17v5" />
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76Z" />
                {c.is_pinned && <line x1="4" y1="12" x2="20" y2="12" />}
              </svg>
              {c.is_pinned ? 'Unpin' : 'Pin'}
            </div>
            
            <div className="dropdown-item" onClick={(e) => {
              e.stopPropagation()
              setEditingChatId(c.id)
              setEditTitleBuffer(c.title || '')
              setOpenDropdownCid(null)
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Rename
            </div>

            {/* ✅ New Feature: Archive Button */}
            <div className="dropdown-item" onClick={(e) => {
              e.stopPropagation()
              archiveConversation(c.id)
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
              Archive
            </div>

            {/* ✅ New Feature: Delete Button */}
            <div className="dropdown-item danger" onClick={(e) => {
              e.stopPropagation()
              deleteConversation(c.id)
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Delete
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ✅ if not logged in → show login
  if (!token) return <Login setToken={setToken} />

  // Split logic for the sidebar groups, filtering out potentially archived ones 
  // (Assuming your backend eventually returns is_archived, or we just remove them locally)
  const pinnedChats = conversations.filter(c => c.is_pinned && !c.is_archived)
  const recentChats = conversations.filter(c => !c.is_pinned && !c.is_archived)

  return (
    <div className="app-container">
      
      {/* Sidebar Framework */}
      <div className="sidebar">
        <div style={{ padding: '12px' }}>
          <button
            onClick={() => {
              if (!isStreaming) {
                setCid(null)
                setChat([])
                setErr('')
              }
            }}
            style={{ width: '100%', padding: '10px', backgroundColor: 'transparent', color: '#ececf1', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', textAlign: 'left', transition: 'background-color 0.2s' }}
            onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.05)'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            + New Chat
          </button>
        </div>

        {/* Scroll Bar Area containing collapsible groups */}
        <div className="sidebar-scroll-area">
          
          {/* PINNED GROUP */}
          {pinnedChats.length > 0 && (
            <div className="sidebar-group">
              <div className="sidebar-group-header" onClick={() => setIsPinnedOpen(!isPinnedOpen)}>
                <span>Pinned</span>
                <svg className={`chevron ${isPinnedOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              {isPinnedOpen && pinnedChats.map(c => renderChatItem(c))}
            </div>
          )}

          {/* RECENTS GROUP */}
          <div className="sidebar-group">
            <div className="sidebar-group-header" onClick={() => setIsRecentsOpen(!isRecentsOpen)}>
              <span>Recents</span>
              <svg className={`chevron ${isRecentsOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
            {isRecentsOpen && recentChats.map(c => renderChatItem(c))}
          </div>
        </div>
        
        <div style={{ padding: '12px' }}>
          <button
            onClick={logout}
            style={{ width: '100%', padding: '10px', background: 'transparent', color: '#ececf1', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', transition: 'background-color 0.2s' }}
            onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.05)'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="main-chat-area">
        <div style={{ flex: 1, minHeight: 0 }}>
          <Virtuoso
            ref={virtuosoRef}
            data={chat}
            increaseViewportBy={800}
            followOutput={(isAtBottom) => autoScroll && isAtBottom ? 'smooth' : false }
            atBottomStateChange={handleAtBottomChange}
            computeItemKey={(index, item) => item.id}
            itemContent={(index, item) => (
              <ChatMessage
                message={item}
                isLastStreaming={!item.done && index === chat.length - 1}
              />
            )}
          />
        </div>

        {err && (
          <div style={{ color: '#ff4d4f', padding: '8px 12px', textAlign: 'center' }}>
            {err}
          </div>
        )}

        {/* Input Footer Area */}
        <div className="input-area-footer">
          <div className="input-box-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              rows={1}
              value={msg}
              onChange={(e) => {
                setMsg(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${e.target.scrollHeight}px`
              }}
              placeholder="Message ChatGPT..."
              disabled={isStreaming}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                  e.preventDefault()
                  if (!isStreaming && msg.trim()) send()
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
                  background: '#ececf1', color: '#000', border: 'none', borderRadius: '50%', width: '32px', height: '32px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            ) : (
              <button 
                onClick={send}
                disabled={!msg.trim()}
                style={{ 
                  background: msg.trim() ? '#ececf1' : '#494949', color: msg.trim() ? '#000' : '#212121', border: 'none', borderRadius: '50%', width: '32px', height: '32px',
                  cursor: msg.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background-color 0.2s'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4l-8 8h6v8h4v-8h6z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ✅ Feature 2: Tooltip Overlay */}
      {tooltip.visible && (
        <div 
          className="custom-tooltip"
          style={{ top: tooltip.y, left: tooltip.x }}
        >
          {tooltip.text}
        </div>
      )}

    </div>
  )
}