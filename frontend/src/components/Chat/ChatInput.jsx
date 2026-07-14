import React, { useEffect } from 'react'

import styles from './ChatInput.module.css'

export default function ChatInput({
  textareaRef,
  className = '', // Default to empty string if not provided
  rows = 1,
  msg,
  setMsg,
  isStreaming,
  send,
  finishCurrentStreamingMessage,
  cleanupStream
}) {
  // Auto-resize textarea when msg changes (clean React pattern)
  useEffect(() => {
    const textarea = textareaRef?.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [msg, textareaRef])

  return (
    <div className={styles['input-area-footer']}>
      <div className={styles['input-box-wrapper']}>
        <textarea
          ref={textareaRef}          
          className={`${styles['chat-textarea']} ${className}`} // Combines the component module styles and any parent styling cleanly
          rows={rows}
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
              cleanupStream(true, true) // Flush pending text, interrupt stream[cite: 1]
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
            onClick={send}
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