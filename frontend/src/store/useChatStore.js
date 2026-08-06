import { create } from 'zustand'
import axios from 'axios'

import { API_URL } from '../utils/constants'

// --- Background Threads (Replaces App.jsx Refs) ---
let abortController = null
let loadMessagesAbort = null
let pendingText = ''
let flushTimer = null
let activeStreamMessageId = null
let streamSessionId = 0

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

export const useChatStore = create((set, get) => ({
  // State
  username: localStorage.getItem('username') || null, // ✅ ADDED: Username state
  token: localStorage.getItem('token') || null,
  conversations: [],
  cid: null,
  chat: [],
  listScrollTrigger: 0,
  isStreaming: false,
  autoScroll: true,
  err: '',
  editingChatId: null,
  editTitleBuffer: '',
  openDropdownCid: null,
  
  // Modal States
  isSettingsOpen: false,
  isArchivedChatsOpen: false, // ✅ ADDED: State for Archived Chats Modal
  confirmModalState: { isOpen: false, title: '', message: '', onConfirm: null }, // ✅ ADDED: State for Confirmation Modal

  // Simple Setters
  setToken: (token) => {
    if (token) localStorage.setItem('token', token)
    else localStorage.removeItem('token')
    set({ token })
  },
  
  // ✅ ADDED: Username setter (Call this in your Login component upon success)
  setUsername: (username) => {
    if (username) localStorage.setItem('username', username)
    else localStorage.removeItem('username')
    set({ username })
  },
  
  setCid: (cid) => set({ cid }),
  setChat: (chat) => set({ chat }),
  setAutoScroll: (autoScroll) => set({ autoScroll }),
  setErr: (err) => set({ err }),
  setEditingChatId: (id) => set({ editingChatId: id }),
  setEditTitleBuffer: (text) => set({ editTitleBuffer: text }),
  setOpenDropdownCid: (id) => set({ openDropdownCid: id }),
  
  // Modal Setters
  setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  setArchivedChatsOpen: (isOpen) => set({ isArchivedChatsOpen: isOpen }), // ✅ ADDED: Setter for Archived Chats
  setConfirmModalState: (modalState) => set((state) => ({ 
    confirmModalState: { ...state.confirmModalState, ...modalState } 
  })), // ✅ ADDED: Setter for Confirmation Modal

  // Computed properties
  getArchivedChats: () => get().conversations.filter(c => c.is_archived),
  getVisibleChats: () => get().conversations.filter(c => !c.is_archived),

  // Actions
  fetchConversations: async (signal = null) => {
    const { token } = get()
    if (!token) {
      set({ conversations: [] })
      return
    }
    try {
      const r = await axios.get(`${API_URL}/api/conversations`, {
        headers: { Authorization: token },
        signal
      })
      set({ conversations: r.data })

      // Auto-create first chat if list is empty
      if (r.data.length === 0) {
        const res = await axios.post(
          `${API_URL}/api/conversations`,
          {},
          {
            headers: { Authorization: token },
            signal
          }
        )
        set({ 
          cid: res.data.conversation_id, 
          conversations: [{ id: res.data.conversation_id, is_archived: false }] 
        })
      }
    } catch (err) {
      // Safely ignore abort cancellations
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
        console.error('Failed to fetch conversations:', err)
      }
    }
  },

  // ✅ load messages when switching conversation
  loadMessages: async (id) => {
    const { token, cleanupStream } = get()
    // Stop any active stream first
    cleanupStream(false, true)

    // Cancel previous loadMessages request
    if (loadMessagesAbort) loadMessagesAbort.abort()
    const controller = new AbortController()
    loadMessagesAbort = controller

    set({ 
      cid: id, 
      err: '' 
    })

    try {
      const r = await axios.get(
        `${API_URL}/api/conversations/${id}/messages`,
        {
          headers: { Authorization: token },
          signal: controller.signal
        }
      )

      // Ignore if another request replaced this one
      if (loadMessagesAbort !== controller) return

      const formatted = []
      let current = null

      r.data.forEach(m => {
        if (m.role === 'user') {
          if (current) formatted.push(current)
          
          current = {
            id: m.id,
            userMessageId: m.id,
            assistantMessageId: null,
            u: m.content,
            a: '',
            createdAt: m.created_at
          }
        } else if (m.role === 'assistant') {
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
      if (current) formatted.push(current)

      // 👈 2. Update the chat AND increment the trigger
      set(state => ({ 
        chat: formatted,
        listScrollTrigger: state.listScrollTrigger + 1 
      }))
    } catch (err) {
      if (err.name !== 'CanceledError' && err.code !== 'ERR_CANCELED') {
        console.error(err)
        set({ err: `Failed to load messages: ${err.response?.data?.error || err.message}` })
      }
    } finally {
      if (loadMessagesAbort === controller) loadMessagesAbort = null
    }
  },

  togglePin: async (id, currentPinStatus) => {
    const { token, fetchConversations } = get()
    // Optimistic UI update
    set(state => ({
      conversations: state.conversations.map(c => c.id === id ? { ...c, is_pinned: !currentPinStatus } : c)
    }))
    try {
      await axios.post(
        `${API_URL}/api/chat/pin`, 
        { conversation_id: id, is_pinned: !currentPinStatus }, 
        { headers: { Authorization: token } }
      )
    } catch (err) {
      console.error("Failed to pin/unpin", err)
      fetchConversations() // Revert on failure
    }
  },

  saveRenamedTitle: async (id, titleToSave) => {
    const { token, editTitleBuffer, fetchConversations } = get()
    // Fall back to state buffer if no explicit title was passed
    const targetText = titleToSave !== undefined ? titleToSave : editTitleBuffer
    if (!targetText || !targetText.trim()) {
      set({ editingChatId: null })
      return
    }
    const trimmedTitle = targetText.trim()
    // Optimistic UI update
    set(state => ({
      editingChatId: null,
      conversations: state.conversations.map(c => c.id === id ? { ...c, title: trimmedTitle } : c)
    }))
    try {
      await axios.post(
        `${API_URL}/api/chat/rename`, 
        { conversation_id: id, title: trimmedTitle }, 
        { headers: { Authorization: token } }
      )
    } catch (err) {
      console.error("Failed to rename", err)
      fetchConversations() // Revert on failure
    }
  },

  archiveConversation: async (id) => {
    const { token, cid, fetchConversations } = get()
    // Optimistically remove it from the local list
    set(state => ({
      openDropdownCid: null,
      conversations: state.conversations.map(c => 
        c.id === id ? { ...c, is_archived: true, updated_at: new Date().toISOString() } : c
      ),
      chat: cid === id ? [] : state.chat,
      cid: cid === id ? null : state.cid
    }))
    try {
      await axios.post(
        `${API_URL}/api/chat/archive`, 
        { conversation_id: id }, 
        { headers: { Authorization: token } }
      )
    } catch (err) {
      console.error("Failed to archive", err)
      fetchConversations() // Revert on failure
    }
  },

  unarchiveConversation: async (id) => {
    const { token, fetchConversations, loadMessages } = get()
    try {
      await axios.post(
        `${API_URL}/api/chat/unarchive`, 
        { conversation_id: id }, 
        { headers: { Authorization: token } }
      )

      set((state) => ({
        conversations: state.conversations.map(c => c.id === id ? { ...c, is_archived: false } : c),
        cid: id // 👈 Sets active conversation ID
        // 'chat' is left untouched here, loadMessages(id) below populates it[cite: 3]
      }));

      // 3. Fetches messages from server and updates state.chat correctly[cite: 3]
      loadMessages(id)
    } catch (error) {
      console.error("Failed to unarchive:", error);
      fetchConversations() // Revert on failure
    }
  },

  archiveAllChats: async () => {
    const { token, fetchConversations } = get()
    try {
      await axios.post(
        `${API_URL}/api/chat/archive_all`, 
        {},
        { headers: { Authorization: token } }
      )

      // Optimistically remove it from the local list
      set(state => ({
        conversations: state.conversations.map(c => ({ ...c, is_archived: true })),
        chat: [],
        cid: null
      }))
    } catch (error) {
      console.error("Failed to archive all:", error);
      fetchConversations() // Revert on failure
    }
  },

  deleteConversation: async (id) => {
    const { token, cid, fetchConversations } = get()
    // Optimistically remove it from the local list
    set(state => ({
      openDropdownCid: null,
      conversations: state.conversations.filter(c => c.id !== id),
      chat: cid === id ? [] : state.chat,
      cid: cid === id ? null : state.cid
    }))
    try {
      await axios.post(
        `${API_URL}/api/chat/delete`, 
        { conversation_id: id }, 
        { headers: { Authorization: token } }
      )
    } catch (err) {
      console.error("Failed to delete", err)
      fetchConversations() // Revert on failure
    }
  },

  deleteAllChats: async () => {
    const { token, fetchConversations } = get()
    try {
      await axios.post(
        `${API_URL}/api/chat/delete_all`, 
        {},
        { headers: { Authorization: token } }
      )
      // Optimistically remove it from the local list
      set(state => ({
        conversations: [],
        chat: [],
        cid: null
      }))
    } catch (err) {
      console.error("Failed to delete all", err)
      fetchConversations() // Revert on failure
    }
  },

  // Streaming Engine Controllers
  flushPendingText: () => {
    if (!pendingText) return
    const text = pendingText
    pendingText = ''
    const targetId = activeStreamMessageId
    if (!targetId) return

    set(state => ({
      chat: state.chat.map(m => m.id === targetId ? { ...m, a: (m.a || '') + text } : m)
    }))
  },

  stopStreaming: (useKeepAlive = false) => {
    const { cid, token } = get()
    if (!cid || !token) return
    if (useKeepAlive) {
      // 🔥 Guarantees the request fires even as the tab is closing
      fetch(
        `${API_URL}/api/chat/stop`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ conversation_id: cid }),
          keepalive: true
        }
      ).catch(err => console.error("Failed to stop generation:", err))
    } else {
      // Standard usage
      axios.post(
        `${API_URL}/api/chat/stop`, 
        { conversation_id: cid }, 
        { headers: { Authorization: token } }
      ).catch(err => console.error("Failed to stop generation:", err))
    }
  },

  cleanupStream: (flushPending = false, isInterrupt = false) => {
    if (flushPending) get().flushPendingText()
    if (abortController) {
      abortController.abort()
      abortController = null

      // 🔥 If we are abruptly aborting an active stream, kill the backend GPU process
      if (isInterrupt) get().stopStreaming()
    }
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    pendingText = ''
    activeStreamMessageId = null
    set({ isStreaming: false })
    streamSessionId++
  },

  finishCurrentStreamingMessage: () => {
    const targetId = activeStreamMessageId
    if (!targetId) return
    set(state => ({
      chat: state.chat.map(m => m.id === targetId ? { ...m, done: true } : m)
    }))
  },

  // ✅ logout (restored)
  logout: () => {
    get().cleanupStream(false, true)
    if (loadMessagesAbort) loadMessagesAbort.abort()
    
    // ✅ ADDED: Clear username from local storage
    localStorage.removeItem('token')
    localStorage.removeItem('username') 
    
    set({  
      username: null, // ✅ ADDED: Clear username state
      token: null, 
      chat: [], 
      cid: null, 
      conversations: [], 
      err: '' 
    })
  },

  // ✅ create new chat
  newChat: async () => {
    const { token, cleanupStream } = get()
    cleanupStream(false, true)
    try {
      const r = await axios.post(
        `${API_URL}/api/conversations`, 
        {}, 
        { headers: { Authorization: token } }
      )
      set(state => ({
        cid: r.data.conversation_id,
        chat: [],
        conversations: [{ id: r.data.conversation_id, title: 'New Chat', is_archived: false }, ...state.conversations]
      }))
    } catch {
      set({ err: 'Failed to create chat' })
    }
  },

  // ✅ send message
  send: async (msg, setMsg) => {
    const { isStreaming, token, cid, flushPendingText, cleanupStream, finishCurrentStreamingMessage } = get()
    if (isStreaming) return

    const userMsg = msg.trim()
    if (!userMsg) return

    const mySession = ++streamSessionId

    // Create the Abort controller
    abortController = new AbortController()

    setMsg('')
    set({ err: '' })

    // add placeholder assistant message
    const tempId = generateId()
    activeStreamMessageId = tempId

    set(state => ({
      chat: [...state.chat, { 
        id: tempId, 
        u: userMsg, 
        a: '', 
        done: false,
        createdAt: new Date().toISOString() // Add the timestamp here
      }],
      autoScroll: true,
      isStreaming: true
    }))

    try {
      const res = await fetch(
        `${API_URL}/api/chat/stream`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token },
          body: JSON.stringify({ message: userMsg, conversation_id: cid }),
          signal: abortController.signal
        }
      )

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
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

      let localBuffer = ''

      while (true) {
        if (mySession !== streamSessionId) return
        const { done, value } = await reader.read()
        if (done) break

        localBuffer += decoder.decode(value, { stream: true })
        const lines = localBuffer.split(SSE_DELIMITER)
        localBuffer = lines.pop()  // keep incomplete line

        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].startsWith(SSE_PREFIX)) continue
          const rawJson = lines[i].slice(SSE_PREFIX.length)
          let data

          try {
            data = JSON.parse(rawJson)
          } catch (e) {
            console.error(e)
            // setErr(`JSON Error: ${lines[i]}` + i === lines.length - 1 ? `` : ` + ${lines[i + 1]}`)
            throw new Error(
                `JSON Error: `
              + `line ${i - 1}: ` + (i === 0 ? `[]` : `[${lines[i - 1]}]`) + `, `
              + `line ${i}: [${lines[i]}], ` 
              + `line ${i + 1}: ` + (i === lines.length - 1 ? `[]` : `[${lines[i + 1]}]`)
            )
          }

          if (data[SSE_META]) {
            const newConversationId = data[SSE_META].conversation_id
            set(state => ({
              cid: newConversationId,
              conversations: state.conversations.some(c => c.id === newConversationId)
                ? state.conversations
                : [{ id: newConversationId, title: userMsg.slice(0, 50), is_archived: false }, ...state.conversations]
            }))
            continue
          }

          if (data[SSE_IDS]) {
            const { user_message_id, assistant_message_id } = data[SSE_IDS]
            set(state => ({
              chat: state.chat.map(m => m.id === tempId ? { ...m, userMessageId: user_message_id, assistantMessageId: assistant_message_id } : m)
            }))
            continue
          }

          if (data[SSE_ERR]) throw new Error(data[SSE_ERR])

          if (data[SSE_DONE]) {
            if (flushTimer) {
              clearTimeout(flushTimer)
              flushTimer = null
            }
            flushPendingText()
            set(state => ({ chat: state.chat.map(m => m.id === tempId ? { ...m, done: true } : m) }))
            cleanupStream() // reset stream state
            return
          }

          // 🔥 live update last message
          pendingText += data[SSE_CHUNK]

          if (!flushTimer) {
            flushTimer = setTimeout(() => {
              flushPendingText()
              flushTimer = null
            }, 50)
          }
        }
      }
      if (pendingText) flushPendingText()
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('Stream cancelled by user')
        finishCurrentStreamingMessage()
      } else {
        console.error(e)
        set({ err: 'Streaming failed: ' + e.message })
      }
      activeStreamMessageId = null
      abortController = null
      pendingText = ''
    } finally {
      set({ isStreaming: false })
    }
  }
}))

// Simple lifecycle utility exporter for component cleanups
export const getActiveStreamingState = () => {
  const s = useChatStore.getState()
  return { isStreaming: s.isStreaming, cid: s.cid, token: s.token }
}