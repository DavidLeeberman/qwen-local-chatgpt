import React, { useState, useEffect, useRef } from 'react'
import { Virtuoso } from 'react-virtuoso'

import { useChatStore } from '../../store/useChatStore'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ArchivedFooter from './ArchivedFooter'
import { ErrMessage } from '../UI/FormattedText'
import { formatTimestamp } from '../UI/FormattedText'
import { DownArrowIcon } from '../UI/Icons'

import styles from './ChatArea.module.css'

// --- Scrollable Footer ---
const ChatFooter = ({ isArchived }) => {
  return (
    <div 
      className={styles['chat-list-footer-container']}
      style={{ paddingBottom: isArchived ? '130px' : '90px' }}
    >      
      {/* Disclaimer that scrolls with the chat */}
      <div className={styles['disclaimer-text']}>
        ChatGPT can make mistakes. Check important info.
      </div>
    </div>
  );
};

// --- Main Component ---
export default function ChatArea({
  virtuosoRef,
  increaseViewportBy
}) {
  const chat = useChatStore(state => state.chat)
  const err = useChatStore(state => state.err)
  const isBranched = useChatStore(state => state.isBranched)
  const regenerate = useChatStore(state => state.regenerate);
  
  // Determine if the currently viewed chat is archived
  const cid = useChatStore(state => state.cid);
  const conversations = useChatStore(state => state.conversations);
  const activeChat = conversations.find(c => c.id === cid);
  
  // When branching, isArchived evaluates to false to recover active layout
  const isArchived = activeChat?.is_archived && !isBranched;
  
  // autoScroll inherently mirrors isAtBottom since Virtuoso sets it on atBottomStateChange
  const autoScroll = useChatStore(state => state.autoScroll)
  const setAutoScroll = useChatStore(state => state.setAutoScroll)
  
  const scrollToBottom = () => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: chat.length - 1,
        align: 'end',
        behavior: 'smooth'
      })
    }
  }

  return (
    <div className={styles['main-chat-area']}>
      <div className={styles['virtuoso-viewport']}>
        <Virtuoso
          ref={virtuosoRef}
          data={chat}
          increaseViewportBy={increaseViewportBy}
          followOutput={(isAtBottom) => autoScroll && isAtBottom ? 'smooth' : false}
          atBottomStateChange={setAutoScroll}
          computeItemKey={(index, item) => item.id}
          itemContent={(index, item) => {
            // 👈 NEW: Timestamp Gap Logic
            const previousMsg = chat[index - 1];
            const timeDiff = previousMsg 
              ? new Date(item.createdAt) - new Date(previousMsg.createdAt) 
              : 0;
            
            // Show timestamp if it's the first message OR the gap is > 1 hour (3,600,000 ms)
            const showTimestamp = index === 0 || timeDiff > 3600000;

            // Determine if this is the absolute last message in the array
            const isLastMessage = index === chat.length - 1;

            return (
              <React.Fragment key={item.id}>
                {showTimestamp && (
                  <div className={styles['time-break']}>
                    {formatTimestamp(item.createdAt)}
                  </div>
                )}
                <ChatMessage
                  message={item}
                  isLastMessage={isLastMessage}           // <-- Pass boolean
                  onRegenerate={() => regenerate()}       // <-- Pass function
                />
              </React.Fragment>
            );
          }}
          components={{
            // Injecting the footer so it scrolls cleanly at the bottom
            Footer: () => (
              <ChatFooter isArchived={isArchived} />
            )
          }}
        />
      </div>

      {/* Floating Scroll to Bottom Button */}
      <button
        onClick={scrollToBottom}
        className={`${styles['scroll-bottom-btn']} ${autoScroll ? styles['hidden'] : ''}`}
        aria-label="Scroll to bottom"
      >
        <DownArrowIcon />
      </button>

      {err && <ErrMessage err={err} />}

      {/* Renders ChatInput when branched or in an active chat, and ArchivedFooter when viewing archived chat */}
      {isArchived ? (
        <ArchivedFooter />
      ) : (
        <ChatInput /> // ChatInput now manages its own state and refs internally!
      )}
    </div>
  )
}