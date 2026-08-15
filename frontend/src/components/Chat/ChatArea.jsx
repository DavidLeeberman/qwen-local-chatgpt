import React, { useState, useEffect, useRef } from 'react'
import { Virtuoso } from 'react-virtuoso'

import { useChatStore } from '../../store/useChatStore'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ArchivedFooter from './ArchivedFooter'
import { ErrMessage } from '../UI/FormattedText'
import { ActionTooltip } from '../Tooltip/Tooltip'
import { useActionTooltip } from '../../hooks/useTooltip'
import { formatDate, formatTime, formatTimestamp } from '../UI/FormattedText'
import { MenuDotsIcon, DownArrowIcon, BranchIcon } from '../UI/Icons'

import styles from './ChatArea.module.css'
import chatMessageStyles from './ChatMessage.module.css' // Needed to perfectly align the action menu

// --- Scrollable Footer ---
const ChatFooter = ({ chat, isArchived, onBranch }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null); // 1. Create a ref for the menu container
  const lastMessage = chat[chat.length - 1];

  const {
    actionTooltip,
    handleActionMouseEnter,
    handleActionMouseLeave,
    hideActionTooltip
  } = useActionTooltip();

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

  const formatDateTime = (isoString) => { return formatDate(isoString) + ', ' + formatTime(isoString); };

  const handleBranchClick = () => {
    setMenuOpen(false); // Closes popup menu
    if (onBranch) onBranch();
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
                  onClick={() => {
                    hideActionTooltip(); // Hide any lingering tooltip when toggling the menu
                    setMenuOpen(!menuOpen)
                  }}
                  onMouseEnter={(e) => handleActionMouseEnter(e, 'More actions', { offsetY: 60 })} // Tooltip appears below the button
                  onMouseLeave={handleActionMouseLeave}
                >
                  <MenuDotsIcon />
                </button>
                
                {menuOpen && (
                  <div className={styles['action-menu-popup']}>
                    <div className={styles['action-menu-timestamp']}>
                      {lastMessage?.createdAt ? formatDateTime(lastMessage.createdAt) : 'Just now'}
                    </div>

                    {isArchived && (
                      <button 
                        className={styles['action-menu-item']}
                        onClick={handleBranchClick}
                      >
                        <BranchIcon />
                        <span>Branch in new chat</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>

          <ActionTooltip {...actionTooltip} />
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
  const isBranched = useChatStore(state => state.isBranched)
  const branchChat = useChatStore(state => state.branchChat)
  
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

            return (
              <React.Fragment key={item.id}>
                {showTimestamp && (
                  <div className={styles['time-break']}>
                    {formatTimestamp(item.createdAt)}
                  </div>
                )}
                <ChatMessage
                  message={item}
                  isLastStreaming={!item.done && index === chat.length - 1}
                />
              </React.Fragment>
            );
          }}
          components={{
            // Injecting the footer so it scrolls cleanly at the bottom
            Footer: () => (
              <ChatFooter 
                chat={chat} 
                isArchived={isArchived} 
                // 🔥 UPDATED: Dynamically pass the active chat's title down to the store
                onBranch={() => branchChat(activeChat?.title)} 
              />
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