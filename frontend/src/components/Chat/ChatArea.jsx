import React, { useState } from 'react'
import { Virtuoso } from 'react-virtuoso'

import { useChatStore } from '../../store/useChatStore'
import ChatMessage from './ChatMessage'
import { ErrMessage } from '../UI/FormattedText'
import { MenuDotsIcon, DownArrowIcon } from '../UI/Icons' // Updated icon imports

import styles from './ChatArea.module.css'
import chatMessageStyles from './ChatMessage.module.css' // Needed to perfectly align the action menu

// --- Scrollable Footer ---
const ChatFooter = ({ chat }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const lastMessage = chat[chat.length - 1];

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  return (
    <div className={styles['chat-footer']}>
      {chat.length > 0 && (
        // Reusing the exact layout wrapper from ChatMessage so it perfectly aligns flush-left
        <div className={chatMessageStyles['message-row']}>
          <div className={chatMessageStyles['message-row-inner']} style={{ justifyContent: 'flex-start' }}>
            
            {/* The ... action menu button perfectly aligned with the left edge of assistant text */}
            <div className={styles['action-menu-container']}>
              <button 
                className={styles['action-menu-btn']}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <MenuDotsIcon />
              </button>
              
              {menuOpen && (
                <div className={styles['action-menu-popup']}>
                  {lastMessage?.created_at ? formatTime(lastMessage.created_at) : 'Just now'}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
      
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
  increaseViewportBy,
  children
}) {
  const chat = useChatStore(state => state.chat)
  const err = useChatStore(state => state.err)
  
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
          components={{
            // Injecting the footer so it scrolls cleanly at the bottom
            Footer: () => <ChatFooter chat={chat} />
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

      {/* children renders ChatInput here */}
      {children}
    </div>
  )
}