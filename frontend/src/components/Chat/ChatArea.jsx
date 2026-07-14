import React from 'react'
import { Virtuoso } from 'react-virtuoso'

import ChatMessage from './ChatMessage'
import styles from './ChatArea.module.css'

export default function ChatArea({
  virtuosoRef,
  chat,
  increaseViewportBy,
  autoScroll,
  handleAtBottomChange,
  err,
  children
}) {
  return (
    <div className={styles['main-chat-area']}>
      <div className={styles['virtuoso-viewport']}>
        <Virtuoso
          ref={virtuosoRef}
          data={chat}
          increaseViewportBy={increaseViewportBy}
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
        <div style={{ color: '#ff4d4f', padding: '8px 12px', textAlign: 'center' }}>
          {err}
        </div>
      )}

      {children}
    </div>
  )
}