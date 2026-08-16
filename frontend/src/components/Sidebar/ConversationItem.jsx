import React, { useEffect, useRef } from 'react'

import { useChatStore } from '../../store/useChatStore'
import { useDropdown } from '../../hooks/useDropdown'
import { TruncatedText } from '../UI/FormattedText'
import { ChatBubbleIcon, PinIcon, MoreActionsIcon, RenameIcon, ArchiveIcon, DeleteIcon } from '../UI/Icons'
import styles from './ConversationItem.module.css'

export default function ConversationItem({
  c,
  handleTitleMouseEnter,
  handleTitleMouseLeave
}) {
  const inputRef = useRef(null)

  // Grab Global Data and Actions from Zustand
  const cid = useChatStore(state => state.cid)
  const editingChatId = useChatStore(state => state.editingChatId)
  const setEditingChatId = useChatStore(state => state.setEditingChatId)
  const editTitleBuffer = useChatStore(state => state.editTitleBuffer)
  const setEditTitleBuffer = useChatStore(state => state.setEditTitleBuffer)
  
  const loadMessages = useChatStore(state => state.loadMessages)
  const togglePin = useChatStore(state => state.togglePin)
  const saveRenamedTitle = useChatStore(state => state.saveRenamedTitle)
  const archiveConversation = useChatStore(state => state.archiveConversation)
  const setChatToDelete = useChatStore(state => state.setChatToDelete)

  const openDropdownCid = useChatStore(state => state.openDropdownCid)
  const setOpenDropdownCid = useChatStore(state => state.setOpenDropdownCid)
  const isMenuOpen = openDropdownCid === c.id;
  const { dropdownStyle, setMenuRef, activeMenuBtnRef } = useDropdown(
    isMenuOpen,
    () => setOpenDropdownCid(null),
    { preferredDirection: 'down' }
  );

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
        {c.is_pinned && <ChatBubbleIcon />}

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
          <TruncatedText
            text={c.title || 'New Chat'}
            handleMouseEnter={handleTitleMouseEnter}
            handleMouseLeave={handleTitleMouseLeave}
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
          <PinIcon isPinned={c.is_pinned} />
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
              setOpenDropdownCid(c.id);                   // Reveal menu
            }
          }}
        >
          <MoreActionsIcon />
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
            ref={setMenuRef} // <-- Attach the callback ref here
            className={styles['dropdown-menu']}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={dropdownStyle} // <-- Apply the style object directly
          >
            {/* Inlined Menu Buttons with global store actions */}
            <button 
              onClick={(e) => {
                e.stopPropagation()
                togglePin(c.id, c.is_pinned)
                setOpenDropdownCid(null)
              }}
            >
              <PinIcon isPinned={c.is_pinned} />
              {c.is_pinned ? 'Unpin' : 'Pin'}
            </button>
            
            <button onClick={(e) => {
              e.stopPropagation()
              setEditingChatId(c.id)
              setEditTitleBuffer(c.title || '')
              setOpenDropdownCid(null)
            }}>
              <RenameIcon />
              Rename
            </button>

            <button onClick={(e) => {
              e.stopPropagation()
              archiveConversation(c.id)
            }}>
              <ArchiveIcon />
              Archive
            </button>

            <button className={styles['danger']} onClick={(e) => {
              e.stopPropagation()
              // 👈 INSTEAD OF DELETING, SET GLOBAL STATE
              setChatToDelete(c)
              setOpenDropdownCid(null)
            }}>
              <DeleteIcon />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}