import React, { useEffect, useRef } from 'react'
import { useChatStore } from '../../store/useChatStore'
import TruncatedTitle from '../UI/TruncatedTitle'
import styles from './ConversationItem.module.css'

// --- PURE UI: Render Pin Icon ---
const renderPinIcon = (isPinned) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(45deg)' }}>
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76Z" />
    {isPinned && <line x1="4" y1="12" x2="20" y2="12" />}
  </svg>
)

export default function ConversationItem({
  c,
  dropdownPos,
  updateDropdownPosition,
  handleTitleMouseEnter,
  handleTitleMouseLeave,
  activeMenuBtnRef
}) {
  const inputRef = useRef(null)

  // Grab Global Data and Actions from Zustand
  const cid = useChatStore(state => state.cid)
  const editingChatId = useChatStore(state => state.editingChatId)
  const setEditingChatId = useChatStore(state => state.setEditingChatId)
  const editTitleBuffer = useChatStore(state => state.editTitleBuffer)
  const setEditTitleBuffer = useChatStore(state => state.setEditTitleBuffer)
  const openDropdownCid = useChatStore(state => state.openDropdownCid)
  const setOpenDropdownCid = useChatStore(state => state.setOpenDropdownCid)
  
  const loadMessages = useChatStore(state => state.loadMessages)
  const togglePin = useChatStore(state => state.togglePin)
  const saveRenamedTitle = useChatStore(state => state.saveRenamedTitle)
  const archiveConversation = useChatStore(state => state.archiveConversation)
  const deleteConversation = useChatStore(state => state.deleteConversation)

  // Handle saving/canceling rename when clicking outside the input box
  useEffect(() => {
    // CRITICAL: Only attach the listener if THIS specific item is being edited
    if (editingChatId !== c.id) return

    const handleOutsideRenameClick = (e) => {
      // If the user clicks anywhere outside the active rename input box
      // Use the React ref to check containment instead of a hardcoded CSS class
      if (inputRef.current && !inputRef.current.contains(e.target)) {
        const trimmed = editTitleBuffer.trim()
        if (!trimmed) {
          setEditingChatId(null)          // Requirement 4: Cancel if empty when clicking outside
        } else {
          saveRenamedTitle(editingChatId, trimmed) // Requirement 1: Save if not empty when clicking outside
        }
      }
    }

    document.addEventListener('mousedown', handleOutsideRenameClick)
    return () => document.removeEventListener('mousedown', handleOutsideRenameClick)
  }, [editingChatId, editTitleBuffer, c.id, saveRenamedTitle, setEditingChatId])
  
  const isActive = c.id === cid;
  const isMenuOpen = openDropdownCid === c.id;
  const isEditingChatId = editingChatId === c.id;

  return (
      <div 
        key={c.id} 
        // ✅ Feature 1 Fix: Appends 'dropdown-open' class so CSS keeps the actions visible
        className={`${styles['conversation-item']} ${isActive ? styles['active'] : ''} ${isMenuOpen ? styles['dropdown-open'] : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (!isEditingChatId && loadMessages) {
            loadMessages(c.id)
            // CRITICAL: Strip browser focus to prevent CSS stickiness on click
            if (e.currentTarget) e.currentTarget.blur();
            setOpenDropdownCid(null)
          }
        }}
      >
      <div className={styles['conversation-title-wrapper']}>
        {/* Only mark pinned conversations with a bubble icon */}
        {c.is_pinned && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}

        {isEditingChatId ? (
          <input
            ref={inputRef}
            className={styles['chat-rename-input']}
            value={editTitleBuffer}
            onChange={(e) => setEditTitleBuffer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const trimmed = editTitleBuffer.trim()
                if (!trimmed) {
                  setEditingChatId(null) // Requirement 4: Cancel if empty on Enter
                } else {
                  saveRenamedTitle(c.id, trimmed) // Requirement 2: Save if not empty on Enter
                }
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setEditingChatId(null) // Requirement 4: Cancel cleanly on ESC (original title remains)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          /* ✅ Replaced raw <span> with the shared UI primitive */
          <TruncatedTitle
            text={c.title || 'New Chat'}
            handleTitleMouseEnter={handleTitleMouseEnter}
            handleTitleMouseLeave={handleTitleMouseLeave}
          />
        )}
      </div>

      {/* Context Controls: Pin on left, 3 horizontal dots on right */}
      {/* 
        👉 FIX 1: Added onMouseDown here to prevent the wrapper buttons 
           from leaking mousedown events up to the global document listener.
      */}
      <div 
        className={styles['conversation-actions']} 
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()} 
      >
        <button 
          className={styles['action-btn']}
          onClick={(e) => {
            e.stopPropagation()
            togglePin(c.id, c.is_pinned) // Passed clean data to store action
          }}
          title={c.is_pinned ? "Unpin Chat" : "Pin Chat"}
        >
          {renderPinIcon(c.is_pinned)}
        </button>
        
        <button 
          className={styles['action-btn']}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (isMenuOpen) {
              setOpenDropdownCid(null);
            } else {
              activeMenuBtnRef.current = e.currentTarget; // Save button reference
              updateDropdownPosition();                   // Compute position instantly
              setOpenDropdownCid(c.id);                   // Reveal menu
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2"/>
            <circle cx="12" cy="12" r="2"/>
            <circle cx="19" cy="12" r="2"/>
          </svg>
        </button>

        {/* Droplist Popover Menu */}
        {isMenuOpen && (
          /* 
            👉 FIX 2: Added stopPropagation on BOTH onClick and onMouseDown here. 
               This isolates the floating popover container entirely so clicking 
               inside the dropdown menu won't close it, select the chat, or 
               trigger global outside-click listeners.
          */
          <div 
            className={styles['dropdown-menu']}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              top: dropdownPos?.top,
              bottom: dropdownPos?.bottom,
              left: dropdownPos?.left,
              maxHeight: dropdownPos?.maxHeight
            }}
          >
            {/* Inlined Menu Buttons with global store actions */}
            <button 
              onClick={(e) => {
                e.stopPropagation()
                togglePin(c.id, c.is_pinned)
                setOpenDropdownCid(null)
              }}
            >
              {renderPinIcon(c.is_pinned)}
              {c.is_pinned ? 'Unpin' : 'Pin'}
            </button>
            
            <button onClick={(e) => {
              e.stopPropagation()
              setEditingChatId(c.id)
              setEditTitleBuffer(c.title || '')
              setOpenDropdownCid(null)
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Rename
            </button>

            <button onClick={(e) => {
              e.stopPropagation()
              archiveConversation(c.id)
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
              Archive
            </button>

            <button className={styles['danger']} onClick={(e) => {
              e.stopPropagation()
              deleteConversation(c.id)
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}