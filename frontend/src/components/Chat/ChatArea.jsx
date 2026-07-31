import React from 'react'
import { Virtuoso } from 'react-virtuoso'

import { useChatStore } from '../../store/useChatStore'
import ChatMessage from './ChatMessage'
import { ErrMessage } from '../UI/FormattedText'

import styles from './ChatArea.module.css'

export default function ChatArea({
  virtuosoRef,
  increaseViewportBy,
  children
}) {
  const chat = useChatStore(state => state.chat)
  const err = useChatStore(state => state.err)
  const autoScroll = useChatStore(state => state.autoScroll)
  const setAutoScroll = useChatStore(state => state.setAutoScroll)
  
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
          atBottomStateChange={setAutoScroll}
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

      {err && <ErrMessage err={err} />}

      {children}
    </div>
  )
}