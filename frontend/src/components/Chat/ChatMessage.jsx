import { useState, useMemo, memo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

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
import { MoreActionsIcon, BranchIcon, CopyIcon, RedoIcon, DoneIcon } from '../UI/Icons' 
import { highlightMarkdownKeywords } from '../../utils/searchUtils'

import styles from './ChatMessage.module.css'

/* ===============================================================================================
   Off-Screen Lazy Hydration for Heavy Nodes
   Implementation: Wrap heavy syntax blocks in a lightweight IntersectionObserver trigger that 
   swaps <SyntaxHighlighter> for a plain <pre> code block when a message scrolls out of the 
   viewport, re-hydrating the highlighter only when it returns.
=============================================================================================== */

// NEW: Intercepts code blocks and only mounts Prism when on-screen
const LazyCodeBlock = ({ language, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Toggles between heavy Prism nodes and raw text
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '400px 0px' } // Pre-hydrates 400px before scrolling into the viewport
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      {isVisible ? (
        <SyntaxHighlighter
          style={oneDark}
          language={language}
          PreTag="div"
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      ) : (
        // Lightweight placeholder mimicking the dark theme wrapper to prevent scrollbar jumping
        <pre style={{ margin: '1em 0', padding: '1em', backgroundColor: '#282c34', borderRadius: '0.3em', overflow: 'hidden' }}>
          <code style={{ color: '#abb2bf', whiteSpace: 'pre-wrap' }}>
            {String(children).replace(/\n$/, '')}
          </code>
        </pre>
      )}
    </div>
  );
};

// UPDATED: Replace your current markdownComponents with this
const markdownComponents = {
  code({ className, children }) {
    const match = /language-(\w+)/.exec(className || '')

    return match ? (
      <LazyCodeBlock language={match[1]}>
        {children}
      </LazyCodeBlock>
    ) : (
      <code className={className}>
        {children}
      </code>
    )
  }
}

/* ===============================================================================================
   Isolated Markdown Rendering: Extracted <PureMarkdown> into its own React.memo instance and 
   attached a strict areEqual comparison function to ChatMessage. Hovering, copy actions, and 
   toolbar popups no longer force React to re-parse raw Markdown or math equations.
=============================================================================================== */

// ISOLATED MARKDOWN COMPONENT: Prevents re-parsing on parent hover state changes
const PureMarkdown = memo(({ content }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeRaw, rehypeKatex]}
    components={markdownComponents}
  >
    {content}
  </ReactMarkdown>
));

function ChatMessage({ 
  message, 
  isLastMessage = false, 
  onRegenerate 
}) {
  // Action Menu State & Refs
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // Store actions & state
  const isStreaming = useChatStore(state => state.isStreaming);
  const branchChat = useChatStore(state => state.branchChat);
  const cid = useChatStore(state => state.cid);
  const conversations = useChatStore(state => state.conversations);
  const targetMessageId = useChatStore(state => state.targetMessageId);
  const searchQuery = useChatStore(state => state.searchQuery);

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

  const formatDateTime = (isoString) => { 
    if (!isoString) return 'Just now';
    return formatDate(isoString) + ', ' + formatTime(isoString); 
  };

  const handleBranchClick = () => {
    setMenuOpen(false);
    // Pass the active chat title and the specific message ID to branch from
    if (branchChat) branchChat(activeChat?.title, message.id);
  };

  // NEW: Handler for copying raw markdown text to clipboard (with HTTP fallback)
  const handleCopy = (e) => {
    e.stopPropagation();
    hideActionTooltip();

    const textToCopy = message.a;
    
    // Helper to trigger the UI change
    const triggerSuccess = () => {
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    };

    // 1. Try the modern Clipboard API first (Requires HTTPS or localhost)
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy)
        .then(triggerSuccess)
        .catch(err => console.error("Failed to copy text: ", err));
    } 
    // 2. Fallback for older browsers or insecure network contexts (HTTP)
    else {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      
      // Move it completely off-screen to avoid visual glitches
      textArea.style.position = "absolute";
      textArea.style.left = "-999999px";
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      try {
        document.execCommand('copy');
        triggerSuccess();
      } catch (err) {
        console.error("Fallback copy failed: ", err);
      } finally {
        // Always clean up the temporary text area
        textArea.remove();
      }
    }
  };

  // NEW: Handler to trigger the regeneration prop
  const handleRegenerate = (e) => {
    e.stopPropagation();
    hideActionTooltip();
    if (onRegenerate) onRegenerate(message.id);
  };

  // 🌟 INJECT HIGHLIGHT MARKERS INTO MARKDOWN IF THIS IS THE SEARCH TARGET
  const processedAssistantContent = useMemo(() => {
    if (!message.a) return '';
    const isTarget = String(message.assistantMessageId) === String(targetMessageId) ||
                     String(message.id) === String(targetMessageId);

    if (isTarget && searchQuery) {
      return highlightMarkdownKeywords(message.a, searchQuery);
    }
    return message.a;
  }, [message.a, message.assistantMessageId, message.id, targetMessageId, searchQuery]);

  return (
    <div className={styles['message-pair']}>
      
      {/* 10. User Message Row (Rendered on the Right) Target the specific User ID onto this bubble */}
      {message.u && (
        <div className={`${styles['message-row']} ${styles['user-row']}`}>
          <div className={styles['message-row-inner']}>
            <div id={`msg-${message.userMessageId}`} className={styles['message-bubble']}>
              {message.u}
            </div>
          </div>
        </div>
      )}

      {/* 10. Assistant Message Row (Rendered on the Left) Target the specific Assistant ID onto this bubble */}
      {(message.a || (isLastMessage && !message.done)) && (
        <div 
          className={`${styles['message-row']} ${styles['assistant-row']}`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className={styles['message-row-inner']}>
            <div id={`msg-${message.assistantMessageId}`} className={styles['message-bubble']}>
              
              <PureMarkdown content={processedAssistantContent} />

              {isLastMessage && <span className={styles['streaming-cursor']}>▋</span>}

              {/* Hover Action Toolbar */}
              {/* Only mount the toolbar if we are NOT actively streaming */}
              {/* and if there is an assistant response attached to avoid toolbar on empty loading states */}
              {message.a && (!isLastMessage || !isStreaming) && (
                <div className={`${styles['message-action-toolbar']} ${(isHovered || menuOpen) ? styles['visible'] : ''}`}>
                  <div className={styles['action-menu-container']}>
                    
                    {/* NEW: Copy Button */}
                    <button 
                      className={styles['action-menu-btn']}
                      onClick={handleCopy}
                      onMouseEnter={(e) => handleActionMouseEnter(e, hasCopied ? 'Response copied' : 'Copy response', { offsetY: 60 })} 
                      onMouseLeave={handleActionMouseLeave}
                    >
                      {hasCopied ? <DoneIcon /> : <CopyIcon />}
                    </button>

                    {/* NEW: Regenerate Button (Only shown if isLastMessage is true) */}
                    {isLastMessage && (
                      <button 
                        className={styles['action-menu-btn']}
                        onClick={handleRegenerate}
                        onMouseEnter={(e) => handleActionMouseEnter(e, 'Regenerate response', { offsetY: 60 })} 
                        onMouseLeave={handleActionMouseLeave}
                      >
                        <RedoIcon />
                      </button>
                    )}

                    {/* EXISTING: More Actions Button */}
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
                    
                    {/* UPDATED: Portaled Menu */}
                    {menuOpen && createPortal(
                      <div
                        ref={setMenuRef} 
                        className={styles['action-menu-popup']}
                        style={dropdownStyle} 
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className={styles['action-menu-timestamp']}>
                          {formatDateTime(message.createdAt)}
                        </div>

                        <button 
                          className={styles['action-menu-item']}
                          onClick={handleBranchClick}
                        >
                          <BranchIcon />
                          <span>Branch in new chat</span>
                        </button>
                      </div>,
                      document.body // <-- Mounts the node outside of the contain: layout wrapper
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

// STRICT EQUALITY: Ignores function references and checks specific primitive changes
const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.a === nextProps.message.a &&
    prevProps.message.u === nextProps.message.u &&
    prevProps.message.done === nextProps.message.done &&
    prevProps.isLastMessage === nextProps.isLastMessage
  );
};

export default memo(ChatMessage, areEqual)