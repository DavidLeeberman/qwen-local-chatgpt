import React, { useState, useEffect, useRef } from 'react'
import { Virtuoso } from 'react-virtuoso'

import { useChatStore } from '../../store/useChatStore'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ArchivedFooter from './ArchivedFooter'
import { ErrMessage } from '../UI/FormattedText'
import { MenuDotsIcon, DownArrowIcon } from '../UI/Icons' // Updated icon imports

import styles from './ChatArea.module.css'
import chatMessageStyles from './ChatMessage.module.css' // Needed to perfectly align the action menu

// --- Scrollable Footer ---
const ChatFooter = ({ chat, isArchived }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null); // 1. Create a ref for the menu container
  const lastMessage = chat[chat.length - 1];

  // 2. Add an effect to listen for clicks outside the referenced element
  useEffect(() => {
    const handleClickOutside = (event) => {
      // If the menu is open, the ref exists, and the clicked target is OUTSIDE the ref
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    // Only attach the listener if the menu is actually open
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Cleanup listener on unmount or when menu closes
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const formatTime = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  return (
    <div 
      className={styles['chat-list-footer-container']}
      style={{ paddingBottom: isArchived ? '130px' : '90px' }}
    >
      
      {/* Action Menu (Only renders if there are messages) */}
      {chat.length > 0 && (
        <div className={styles['chat-footer']}>
          {/* Reusing the exact layout wrapper from ChatMessage so it perfectly aligns flush-left */}
          <div className={chatMessageStyles['message-row']}>
            <div className={chatMessageStyles['message-row-inner']} style={{ justifyContent: 'flex-start' }}>              
              
              {/* The ... action menu button perfectly aligned with the left edge of assistant text */}
              {/* 3. Attach the ref to the container holding both the button and the popup */}
              <div className={styles['action-menu-container']} ref={menuRef}>
                <button 
                  className={styles['action-menu-btn']}
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  <MenuDotsIcon />
                </button>
                
                {menuOpen && (
                  <div className={styles['action-menu-popup']}>
                    {lastMessage?.createdAt ? formatTime(lastMessage.createdAt) : 'Just now'}
                  </div>
                )}
              </div>

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
  increaseViewportBy
}) {
  const chat = useChatStore(state => state.chat)
  const err = useChatStore(state => state.err)
  
  // Determine if the currently viewed chat is archived
  const cid = useChatStore(state => state.cid);
  const conversations = useChatStore(state => state.conversations);
  const activeChat = conversations.find(c => c.id === cid);
  const isArchived = activeChat?.is_archived;
  
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
            Footer: () => <ChatFooter chat={chat} isArchived={isArchived} />
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

      {/* ChatInput loads here, remaining completely stationary */}
      {isArchived ? (
        <ArchivedFooter />
      ) : (
        <ChatInput /> // ChatInput now manages its own state and refs internally!
      )}
    </div>
  )
}