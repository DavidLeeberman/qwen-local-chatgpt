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
import { 
  MoreActionsIcon, 
  BranchIcon, 
  CopyIcon, 
  RedoIcon, 
  DoneIcon, 
  EditIcon,
  ShowMoreIcon,
  ShowLessIcon 
} from '../UI/Icons' 
import { highlightMarkdownKeywords } from '../../utils/searchUtils'

import styles from './ChatMessage.module.css'

// Code block component with header, copy action, and seamless syntax highlighting
const CodeBlock = ({ language, value, onActionMouseEnter, onActionMouseLeave }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    const textToCopy = String(value).replace(/\n$/, '');

    const triggerSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy)
        .then(triggerSuccess)
        .catch(err => console.error("Failed to copy code: ", err));
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
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
        textArea.remove();
      }
    }
  };

  return (
    <div className={styles['code-block-wrapper']}>
      <div className={styles['code-block-header']}>
        <span className={styles['code-block-lang']}>
          <span className={styles['code-icon']}>&lt;/&gt;</span>
          <span>{language || 'code'}</span>
        </span>
        <button
          type="button"
          className={styles['code-copy-btn']}
          onClick={handleCopy}
          onMouseEnter={(e) => onActionMouseEnter(e, copied ? 'Copied!' : 'Copy code', { offsetY: 60 })}
          onMouseLeave={onActionMouseLeave}
          aria-label="Copy code"
        >
          {copied ? <DoneIcon /> : <CopyIcon />}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0 0 12px 12px',
          padding: '12px 16px',
          fontSize: '14px',
          lineHeight: '1.5',
          backgroundColor: '#1e1e1e'
        }}
      >
        {String(value).replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
};

// Table wrapper component with top-right copy button (preserving full markdown syntax)
const TableWrapper = ({ children, rawMarkdown, onActionMouseEnter, onActionMouseLeave }) => {
  const [copied, setCopied] = useState(false);
  const containerRef = useRef(null);

  const handleCopyTable = (e) => {
    e.stopPropagation();
    
    let textToCopy = rawMarkdown;

    // Fallback if AST node position is unavailable: reconstruct full GFM Markdown table structure
    if (!textToCopy && containerRef.current) {
      const tableEl = containerRef.current.querySelector('table');
      if (tableEl) {
        const rows = Array.from(tableEl.querySelectorAll('tr'));
        const tableData = rows.map(row => {
          const cells = Array.from(row.querySelectorAll('th, td'));
          return cells.map(cell => cell.innerText.trim());
        });

        if (tableData.length > 0) {
          const headerRow = `| ${tableData[0].join(' | ')} |`;
          const dividerRow = `| ${tableData[0].map(() => '---').join(' | ')} |`;
          const bodyRows = tableData.slice(1).map(row => `| ${row.join(' | ')} |`).join('\n');
          textToCopy = [headerRow, dividerRow, bodyRows].filter(Boolean).join('\n');
        }
      }
    }

    if (!textToCopy) return;

    const triggerSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy)
        .then(triggerSuccess)
        .catch(err => console.error("Failed to copy table: ", err));
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
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
        textArea.remove();
      }
    }
  };

  return (
    <div className={styles['table-wrapper']} ref={containerRef}>
      <button
        type="button"
        className={styles['table-copy-btn']}
        onClick={handleCopyTable}
        onMouseEnter={(e) => onActionMouseEnter(e, copied ? 'Copied table' : 'Copy table', { offsetY: 60 })}
        onMouseLeave={onActionMouseLeave}
        aria-label="Copy table"
      >
        {copied ? <DoneIcon /> : <CopyIcon />}
      </button>
      <div className={styles['table-container']}>
        <table>{children}</table>
      </div>
    </div>
  );
};

/* ===============================================================================================
   Isolated Markdown Rendering: Extracted <PureMarkdown> into its own React.memo instance and 
   attached a strict areEqual comparison function to ChatMessage. Hovering, copy actions, and 
   toolbar popups no longer force React to re-parse raw Markdown or math equations.
=============================================================================================== */

// ISOLATED MARKDOWN COMPONENT: Prevents re-parsing on parent hover state changes
const PureMarkdown = memo(({ content, onActionMouseEnter, onActionMouseLeave }) => {
  const components = useMemo(() => ({
    // Prevent react-markdown from wrapping CodeBlock in an extra outer <pre> wrapper
    pre({ children }) {
      return <>{children}</>;
    },
    code({ className, children }) {
      const match = /language-(\w+)/.exec(className || '');
      return match ? (
        <CodeBlock
          language={match[1]}
          value={children}
          onActionMouseEnter={onActionMouseEnter}
          onActionMouseLeave={onActionMouseLeave}
        />
      ) : (
        <code className={className}>
          {children}
        </code>
      );
    },
    table({ node, children }) {
      // Extract exact raw markdown source text for table if AST position is present
      const rawMarkdown = (node?.position && content)
        ? content.slice(node.position.start.offset, node.position.end.offset)
        : null;

      return (
        <TableWrapper
          rawMarkdown={rawMarkdown}
          onActionMouseEnter={onActionMouseEnter}
          onActionMouseLeave={onActionMouseLeave}
        >
          {children}
        </TableWrapper>
      );
    }
  }), [content, onActionMouseEnter, onActionMouseLeave]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});
PureMarkdown.displayName = 'PureMarkdown';

function ChatMessage({ 
  message, 
  isLastMessage = false, 
  onRegenerate 
}) {
  // Menu & Hover States
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAssistantHovered, setIsAssistantHovered] = useState(false);
  const [isUserHovered, setIsUserHovered] = useState(false);
  
  // Copy States
  const [hasCopiedAssistant, setHasCopiedAssistant] = useState(false);
  const [hasCopiedUser, setHasCopiedUser] = useState(false);

  // Prompt Expand / Collapse State (Default: Collapsed)
  const [isExpanded, setIsExpanded] = useState(false);

  // Edit Buffer State
  const [editBuffer, setEditBuffer] = useState(message.u || '');
  const editTextareaRef = useRef(null);

  // Global Store States
  const isStreaming = useChatStore(state => state.isStreaming);
  const branchChat = useChatStore(state => state.branchChat);
  const cid = useChatStore(state => state.cid);
  const conversations = useChatStore(state => state.conversations);
  const targetMessageId = useChatStore(state => state.targetMessageId);
  const searchQuery = useChatStore(state => state.searchQuery);
  const editingMessageId = useChatStore(state => state.editingMessageId);
  const setEditingMessageId = useChatStore(state => state.setEditingMessageId);
  const editAndSend = useChatStore(state => state.editAndSend);

  const activeChat = conversations.find(c => c.id === cid);
  const isEditingThisPrompt = editingMessageId === message.id || editingMessageId === message.userMessageId;

  // Check if message is ready for edit (Not streaming and has a valid integer DB ID)
  const targetUserMsgId = message.userMessageId || message.id;
  const canEdit = !isStreaming && Number.isInteger(Number(targetUserMsgId));

  // Tooltip Hooks
  const {
    actionTooltip,
    handleActionMouseEnter,
    handleActionMouseLeave,
    hideActionTooltip
  } = useActionTooltip();

  const { dropdownStyle, setMenuRef, activeMenuBtnRef } = useDropdown(
    menuOpen,
    () => setMenuOpen(false),
    { preferredDirection: 'up' }
  );

  // Sync draft text when entering edit mode
  useEffect(() => {
    if (isEditingThisPrompt) {
      setEditBuffer(message.u || '');
      // Focus textarea on open
      setTimeout(() => {
        if (editTextareaRef.current) {
          editTextareaRef.current.focus();
          editTextareaRef.current.selectionStart = editTextareaRef.current.value.length;
        }
      }, 0);
    }
  }, [isEditingThisPrompt, message.u]);

  const formatDateTime = (isoString) => { 
    if (!isoString) return 'Just now';
    return formatDate(isoString) + ', ' + formatTime(isoString); 
  };

  const handleBranchClick = () => {
    setMenuOpen(false);
    // Pass the active chat title and the specific message ID to branch from
    if (branchChat) branchChat(activeChat?.title, message.id);
  };

  // Generic Clipboard Copy Helper
  const copyToClipboard = (textToCopy, setCopyState) => {
    hideActionTooltip();
    
    // Helper to trigger the UI change
    const triggerSuccess = () => {
      setCopyState(true);
      setTimeout(() => setCopyState(false), 2000);
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

  const handleCopyAssistant = (e) => {
    e.stopPropagation();
    copyToClipboard(message.a, setHasCopiedAssistant);
  };

  const handleCopyUser = (e) => {
    e.stopPropagation();
    copyToClipboard(message.u, setHasCopiedUser);
  };

  const handleStartEdit = (e) => {
    e.stopPropagation();
    if (!canEdit) return;
    hideActionTooltip();
    const msgId = message.userMessageId || message.id;
    setEditingMessageId(msgId);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditBuffer(message.u || '');
  };

  const handleSendEdit = () => {
    const trimmed = editBuffer.trim();
    if (!trimmed || !canEdit) return;
    const msgId = message.userMessageId || message.id;
    editAndSend(msgId, trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editBuffer.trim() && canEdit) {
        handleSendEdit();
      }
    }
  };

  // Toggle Collapse without shifting scroller.scrollTop
  const handleToggleExpand = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsExpanded(prev => !prev);
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

  // Check if user prompt is long enough to warrant collapsing (> 180 chars or line breaks)
  const isLongPrompt = useMemo(() => {
    if (!message.u) return false;
    return message.u.length > 180 || message.u.includes('\n');
  }, [message.u]);

  return (
    <div className={styles['message-pair']}>
      
      {/* 1. User Message Row (Rendered on the Right) Target the specific User ID onto this bubble */}
      {message.u && (
        <div 
          className={`${styles['message-row']} ${styles['user-row']}`}
          onMouseEnter={() => setIsUserHovered(true)}
          onMouseLeave={() => setIsUserHovered(false)}
        >
          <div className={styles['message-row-inner']}>
            <div className={styles['user-content-wrapper']}>
              
              {/* EDITING STATE */}
              {isEditingThisPrompt ? (
                <div className={styles['prompt-edit-container']}>
                  <textarea
                    ref={editTextareaRef}
                    className={styles['prompt-edit-textarea']}
                    value={editBuffer}
                    onChange={(e) => setEditBuffer(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <div className={styles['prompt-edit-actions']}>
                    <button 
                      className={styles['prompt-btn-cancel']}
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </button>
                    <button 
                      className={`${styles['prompt-btn-send']} ${(!editBuffer.trim() || !canEdit) ? styles['disabled'] : ''}`}
                      disabled={!editBuffer.trim() || !canEdit}
                      onClick={handleSendEdit}
                    >
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                /* NORMAL DISPLAY STATE */
                <div 
                  id={`user-msg-${message.userMessageId}`} 
                  className={styles['message-bubble']}
                >
                  <div className={`${styles['prompt-text']} ${isLongPrompt && !isExpanded ? styles['collapsed'] : ''}`}>
                    {message.u}
                  </div>

                  {/* Show More / Show Less Toggle Button */}
                  {isLongPrompt && (
                    <button 
                      type="button"
                      className={styles['expand-toggle-btn']}
                      onClick={handleToggleExpand}
                    >
                      {isExpanded ? (
                        <>
                          <span>Show less</span>
                          <ShowLessIcon />
                        </>
                      ) : (
                        <>
                          <span>Show more</span>
                          <ShowMoreIcon />
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* USER ACTION TOOLBAR (RIGHT-ALIGNED BELOW PROMPT BOX) */}
              {!isEditingThisPrompt && (
                <div className={`${styles['user-action-toolbar']} ${isUserHovered ? styles['visible'] : ''}`}>
                  <button 
                    className={styles['action-menu-btn']}
                    onClick={handleCopyUser}
                    onMouseEnter={(e) => handleActionMouseEnter(e, hasCopiedUser ? 'Message copied' : 'Copy message', { offsetY: 60 })} 
                    onMouseLeave={handleActionMouseLeave}
                  >
                    {hasCopiedUser ? <DoneIcon /> : <CopyIcon />}
                  </button>

                  <button 
                    className={`${styles['action-menu-btn']} ${!canEdit ? styles['disabled'] : ''}`}
                    onClick={canEdit ? handleStartEdit : undefined}
                    onMouseEnter={(e) => handleActionMouseEnter(
                      e, 
                      isStreaming 
                        ? 'Wait for response to complete before editing' 
                        : !canEdit 
                        ? 'Syncing message with database...' 
                        : 'Edit message', 
                      { offsetY: 60 }
                    )} 
                    onMouseLeave={handleActionMouseLeave}
                  >
                    <EditIcon />
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* 2. Assistant Message Row (Rendered on the Left) Target the specific Assistant ID onto this bubble */}
      {(message.a || (isLastMessage && !message.done)) && (
        <div 
          className={`${styles['message-row']} ${styles['assistant-row']}`}
          onMouseEnter={() => setIsAssistantHovered(true)}
          onMouseLeave={() => setIsAssistantHovered(false)}
        >
          <div className={styles['message-row-inner']}>
            <div id={`asst-msg-${message.assistantMessageId}`} className={styles['message-bubble']}>
              
              <PureMarkdown
                content={processedAssistantContent}
                onActionMouseEnter={handleActionMouseEnter}
                onActionMouseLeave={handleActionMouseLeave}
              />

              {isLastMessage && <span className={styles['streaming-cursor']}>▋</span>}

              {/* Hover Assistant Action Toolbar */}
              {/* Only mount the toolbar if we are NOT actively streaming */}
              {/* and if there is an assistant response attached to avoid toolbar on empty loading states */}
              {message.a && (!isLastMessage || !isStreaming) && (
                <div className={`${styles['message-action-toolbar']} ${(isAssistantHovered || menuOpen) ? styles['visible'] : ''}`}>
                  <div className={styles['action-menu-container']}>
                    
                    {/* NEW: Copy Button */}
                    <button 
                      className={styles['action-menu-btn']}
                      onClick={handleCopyAssistant}
                      onMouseEnter={(e) => handleActionMouseEnter(e, hasCopiedAssistant ? 'Response copied' : 'Copy response', { offsetY: 60 })} 
                      onMouseLeave={handleActionMouseLeave}
                    >
                      {hasCopiedAssistant ? <DoneIcon /> : <CopyIcon />}
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
                      ref={activeMenuBtnRef} 
                      className={styles['action-menu-btn']}
                      onClick={(e) => { 
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
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Local Tooltip Rendering */}
      <ActionTooltip {...actionTooltip} />
    </div>
  )
}

// STRICT EQUALITY: Checks specific primitive changes including userMessageId updates from SSE
const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.userMessageId === nextProps.message.userMessageId &&
    prevProps.message.a === nextProps.message.a &&
    prevProps.message.u === nextProps.message.u &&
    prevProps.message.done === nextProps.message.done &&
    prevProps.isLastMessage === nextProps.isLastMessage
  );
};

export default memo(ChatMessage, areEqual)