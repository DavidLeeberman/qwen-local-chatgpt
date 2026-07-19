import React, { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../../store/useChatStore'
import styles from './ChatInput.module.css'

export default function ChatInput({ className = '', rows = 1 }) {
  // ✅ 1. Fully isolated local state and DOM refs (Moved from App.jsx)
  // This prevents the entire app from re-rendering on every keystroke!
  const [msg, setMsg] = useState('')
  const textareaRef = useRef(null)

  // ✅ 2. Grab only the necessary actions/state from the global store
  const isStreaming = useChatStore(state => state.isStreaming)
  const send = useChatStore(state => state.send)
  const finishCurrentStreamingMessage = useChatStore(state => state.finishCurrentStreamingMessage)
  const cleanupStream = useChatStore(state => state.cleanupStream)

  // ✅ 3. Auto-resize textarea when msg changes (clean React pattern)
  useEffect(() => {
    const textarea = textareaRef?.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [msg]) // textareaRef doesn't change, so it's safely omitted from dependencies

  // Helper to trigger the Zustand send action with local state
  const handleSend = () => {
    if (!isStreaming && msg.trim()) {
      send(msg, setMsg) 
    }
  }

  return (
    <div className={styles['input-area-footer']}>
      <div className={styles['input-box-wrapper']}>
        <textarea
          ref={textareaRef}          
          className={`${styles['chat-textarea']} ${className}`} 
          rows={rows}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Say something..."
          disabled={isStreaming}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />

        {isStreaming ? (
          <button 
            onClick={() => {
              finishCurrentStreamingMessage()
              cleanupStream(true, true) // Flush pending text, interrupt stream[cite: 4]
            }}
            style={{ 
              background: '#ececf1', 
              color: '#000', 
              border: 'none', 
              borderRadius: '50%', 
              width: '32px', 
              height: '32px',
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              flexShrink: 0
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        ) : (
          <button 
            onClick={handleSend}
            disabled={!msg.trim()}
            style={{ 
              background: msg.trim() ? '#ececf1' : '#494949', 
              color: msg.trim() ? '#000' : '#212121', 
              border: 'none', 
              borderRadius: '50%', 
              width: '32px', 
              height: '32px',
              cursor: msg.trim() ? 'pointer' : 'default', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              flexShrink: 0, 
              transition: 'background-color 0.2s, color 0.2s'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4l-8 8h6v8h4v-8h6z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}