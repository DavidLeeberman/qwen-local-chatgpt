import React, { useState, useRef } from 'react'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Added imports for Store, Hooks, and UI components
import { useChatStore } from '../../store/useChatStore'
import { useDropdown } from '../../hooks/useDropdown'
import { ActionTooltip } from '../Tooltip/Tooltip'
import { useActionTooltip } from '../../hooks/useTooltip'
import { formatDate, formatTime } from '../UI/FormattedText'
import { MoreActionsIcon, BranchIcon } from '../UI/Icons'

import styles from './ChatMessage.module.css'

const markdownComponents = {
  code({ className, children }) {
    const match = /language-(\w+)/.exec(className || '')

    return match ? (
      <SyntaxHighlighter
        style={oneDark}
        language={match[1]}
        PreTag="div"
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className={className}>
        {children}
      </code>
    )
  }
}

function ChatMessage({ message, isLastStreaming }) {
  // Action Menu State & Refs
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Store actions & state
  const branchChat = useChatStore(state => state.branchChat);
  const cid = useChatStore(state => state.cid);
  const conversations = useChatStore(state => state.conversations);
  const activeChat = conversations.find(c => c.id === cid);

  // Tooltip Hook
  const {
    actionTooltip,
    handleActionMouseEnter,
    handleActionMouseLeave,
    hideActionTooltip
  } = useActionTooltip();

  const { dropdownStyle, setMenuRef, activeMenuBtnRef } = useDropdown(
    menuOpen,
    () => setMenuOpen(false),
    { preferredDirection: 'up' } // <-- Prefers popping UP
  );

  // NOTE: Redundant `useEffect` for clicking outside was completely removed!

  const formatDateTime = (isoString) => { 
    if (!isoString) return 'Just now';
    return formatDate(isoString) + ', ' + formatTime(isoString); 
  };

  const handleBranchClick = () => {
    setMenuOpen(false);
    // Pass the active chat title and the specific message ID to branch from
    if (branchChat) branchChat(activeChat?.title, message.id);
  };

  // Virtuoso requires a single root element per item, so we wrap the pair in a parent div
  return (
    <div className={styles['message-pair']}>
      
      {/* 10. User Message Row (Rendered on the Right) */}
      {message.u && (
        <div className={`${styles['message-row']} ${styles['user-row']}`}>
          <div className={styles['message-row-inner']}>
            <div className={styles['message-bubble']}>
              {message.u}
            </div>
          </div>
        </div>
      )}

      {/* 10. Assistant Message Row (Rendered on the Left) */}
      {(message.a || isLastStreaming) && (
        <div 
          className={`${styles['message-row']} ${styles['assistant-row']}`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className={styles['message-row-inner']}>
            <div className={styles['message-bubble']}>
              
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeRaw, rehypeKatex]}
                components={markdownComponents}
              >
                {message.a}
              </ReactMarkdown>

              {isLastStreaming && (
                <span className={styles['streaming-cursor']}>▋</span>
              )}

              {/* Hover Action Toolbar */}
              {/* Only render toolbar if there is an assistant response attached to avoid toolbar on empty loading states */}
              {message.a && (
                <div className={`${styles['message-action-toolbar']} ${(isHovered || menuOpen) ? styles['visible'] : ''}`}>
                  <div className={styles['action-menu-container']}>
                    
                    <button 
                      ref={activeMenuBtnRef} // <-- Attach button ref
                      className={styles['action-menu-btn']}
                      onClick={(e) => { // <-- FIX: 'e' is now passed in
                        e.stopPropagation(); 
                        hideActionTooltip();
                        setMenuOpen(!menuOpen);
                      }}
                      onMouseEnter={(e) => handleActionMouseEnter(e, 'More actions', { offsetY: 60 })} // Tooltip appears below the button
                      onMouseLeave={handleActionMouseLeave}
                    >
                      <MoreActionsIcon />
                    </button>
                    
                    {menuOpen && (
                      <div
                        ref={setMenuRef} // <-- Attach menu callback ref 
                        className={styles['action-menu-popup']}
                        style={dropdownStyle} // <-- Apply the style object directly
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className={styles['action-menu-timestamp']}>
                          {formatDateTime(message.createdAt)}
                        </div>

                        {/* Always available for the historical message, regardless of archive state */}
                        <button 
                          className={styles['action-menu-item']}
                          onClick={handleBranchClick}
                        >
                          <BranchIcon />
                          <span>Branch in new chat</span>
                        </button>
                      </div>
                    )}

                  </div>
                  
                  {/* Local Tooltip Rendering */}
                  <ActionTooltip {...actionTooltip} />
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default React.memo(ChatMessage)