import { useState, useEffect, useRef, useCallback } from 'react'

import { API_URL } from './utils/constants'
import { useChatStore, getActiveStreamingState } from './store/useChatStore'

import Login from './Login'
import ChatArea from './components/Chat/ChatArea'
import ChatInput from './components/Chat/ChatInput'
import Sidebar from './components/Sidebar/Sidebar'

import './App.css'

export default function App() {
  const token = useChatStore(state => state.token)
  const setToken = useChatStore(state => state.setToken)
  const conversations = useChatStore(state => state.conversations)
  const isStreaming = useChatStore(state => state.isStreaming)
  const chat = useChatStore(state => state.chat)
  const listScrollTrigger = useChatStore(state => state.listScrollTrigger)
  const openDropdownCid = useChatStore(state => state.openDropdownCid)
  const setOpenDropdownCid = useChatStore(state => state.setOpenDropdownCid)
  
  const logout = useChatStore(state => state.logout)
  const fetchConversations = useChatStore(state => state.fetchConversations)
  const newChat = useChatStore(state => state.newChat)
  const send = useChatStore(state => state.send)
  const cleanupStream = useChatStore(state => state.cleanupStream)

  // Pure Local Layout UI States
  const [msg, setMsg] = useState('')
  const [dropdownPos, setDropdownPos] = useState({ top: 'auto', bottom: 'auto', left: '0px', maxHeight: 'none' })
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 })
  const [isPinnedOpen, setIsPinnedOpen] = useState(true)
  const [isRecentsOpen, setIsRecentsOpen] = useState(true)

  const activeMenuBtnRef = useRef(null)
  const tooltipTimeoutRef = useRef(null)
  const virtuosoRef = useRef(null)

  // The Smart Positioning Engine
  const updateDropdownPosition = useCallback(() => {
    if (!activeMenuBtnRef.current) return;

    const rect = activeMenuBtnRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const estimatedMenuHeight = 165; // Total height of 4 rows + paddings + borders
    const gap = 4;                   // Distance from the 3-dots button
    const windowMargin = 8;          // Keeps menu from sticking ugly against screen edge

    // 1. Check if it fits expanding downwards
    const spaceBelow = viewportHeight - rect.bottom - gap;
    if (spaceBelow >= estimatedMenuHeight) {
      setDropdownPos({
        top: `${rect.bottom + gap}px`,
        bottom: 'auto',
        left: `${rect.left}px`,
        maxHeight: 'none'
      });
    } 
    // 2. If not, check if it fits expanding upwards
    else if (rect.top - gap >= estimatedMenuHeight) {
      setDropdownPos({
        top: 'auto',
        bottom: `${viewportHeight - rect.top + gap}px`,
        left: `${rect.left}px`,
        maxHeight: 'none'
      });
    } 
    // 3. Compressed state: Doesn't fit in either direction -> force down and limit height
    else {
      const computedTop = rect.bottom + gap;
      const computedMaxHeight = Math.max(60, viewportHeight - computedTop - windowMargin);
      setDropdownPos({
        top: `${computedTop}px`,
        bottom: 'auto',
        left: `${rect.left}px`,
        maxHeight: `${computedMaxHeight}px`
      });
    }
  }, []); // Empty array ensures this layout utility reference never fluctuates

  // Tooltip UI Handlers
  // ✅ Feature 2: Handlers to calculate and display the Tooltip only if truncated
  const handleTitleMouseEnter = (e, text) => {
    // Clear any previous pending tooltip triggers
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current)
    // Capture the element target immediately before entering the async timeout block
    const titleEl = e.currentTarget; // The <span> (.conversation-title-text)

    // Delay activation by 400ms so it doesn't flash when just passing over
    tooltipTimeoutRef.current = setTimeout(() => {
      const rowEl = titleEl.closest('[class*="conversation-item"]');
    
      if (titleEl && rowEl) {
        const actionsEl = rowEl.querySelector('[class*="conversation-actions"]');
        const actionsWidth = actionsEl ? actionsEl.getBoundingClientRect().width : 0;
        
        // Accounts for the margin-left: 8px applied to actions on hover in your CSS
        const actionsMargin = actionsWidth > 0 ? 8 : 0;
        
        // Calculate the exact maximum width available for text when actions are width: 0
        const maxUnhoveredWidth = titleEl.getBoundingClientRect().width + actionsWidth + actionsMargin;

        // Only trigger the custom tooltip if the full text overflows the unhovered layout
        if (titleEl.scrollWidth > Math.ceil(maxUnhoveredWidth)) {
          const rect = rowEl.getBoundingClientRect()
          setTooltip({
            visible: true,
            text: text,
            x: rect.right + 12, // 12px padding away from the sidebar scrollbar
            y: rect.top + (rect.height / 2) // Vertically center it with the item
          })
        }
      }
    }, 400) // 400ms delay before showing tooltip
  }

  const handleTitleMouseLeave = () => {
    // Instantly cancel the activation timer if the user leaves before 400ms is up
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
      tooltipTimeoutRef.current = null
    }
    setTooltip({ visible: false, text: '', x: 0, y: 0 })
  }

  useEffect(() => {
    if (listScrollTrigger > 0 && virtuosoRef.current) {
      requestAnimationFrame(() => {
        virtuosoRef.current.scrollToIndex({
          index: Math.max(chat.length - 1, 0),
          align: 'end'
        })
      })
    }
  }, [listScrollTrigger]) // Only fires when loadMessages increments the trigger!

  // Window BeforeUnload & Cleanup Lifecycle hooks
  // ✅ Unified Lifecycle Handler: Binds once on mount, handles tab closures & component unmounting cleanly
  useEffect(() => {
    const handleBeforeUnload = () => {
      const { isStreaming: streaming, cid, token: t } = getActiveStreamingState()
      // If a stream is active when the browser tab closes/refreshes, fire the keepalive beacon
      if (streaming && cid && t) {
        fetch(
          `${API_URL}/api/chat/stop`, 
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              Authorization: t 
            },
            body: JSON.stringify({ conversation_id: cid }),
            keepalive: true
          }
        ).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      cleanupStream() // Store cleans up its own timers/fetches
      
      // ✅ Restored: Tooltip cleanup
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current)
      }
    }
  }, [cleanupStream])

  // Dropdown dismissal listener
  useEffect(() => {
    if (!openDropdownCid) return
    const dismiss = () => setOpenDropdownCid(null)
    const handleLayout = () => updateDropdownPosition()
    
    // ✅ Restored: Escape key listener
    const handleEscapeKey = (e) => {
      if (e.key === 'Escape') setOpenDropdownCid(null)
    }
    
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('contextmenu', dismiss) // ✅ Restored: Right-click dismiss
    document.addEventListener('keydown', handleEscapeKey)
    window.addEventListener('scroll', handleLayout, true)
    window.addEventListener('resize', handleLayout)

    return () => {
      document.removeEventListener('mousedown', dismiss)
      document.removeEventListener('contextmenu', dismiss)
      document.removeEventListener('keydown', handleEscapeKey)
      window.removeEventListener('scroll', handleLayout, true)
      window.removeEventListener('resize', handleLayout)
    }
  }, [openDropdownCid, setOpenDropdownCid, updateDropdownPosition])

  useEffect(() => {
    const controller = new AbortController()
    fetchConversations(controller.signal)
    return () => controller.abort()
  }, [token, fetchConversations])

  if (!token) return <Login setToken={setToken} />

  // Split logic for the sidebar groups, filtering out potentially archived ones 
  const pinnedChats = conversations.filter(c => c.is_pinned && !c.is_archived)
  const recentChats = conversations.filter(c => !c.is_pinned && !c.is_archived)

  return (
    <div className="app-container">
      
      {/* Sidebar Framework */}
      <Sidebar
        pinnedChats={pinnedChats}
        recentChats={recentChats}
        dropdownPos={dropdownPos}
        updateDropdownPosition={updateDropdownPosition}
        handleTitleMouseEnter={handleTitleMouseEnter}
        handleTitleMouseLeave={handleTitleMouseLeave}
        activeMenuBtnRef={activeMenuBtnRef}
      />

      {/* Main Chat Area */}
      <ChatArea
        virtuosoRef={virtuosoRef}
        increaseViewportBy={800} /* Restored Virtuoso prop */
      >
        {/* Updated: ChatInput now manages its own state and refs internally! */}
        <ChatInput />
      </ChatArea>

      {/* Tooltip Overlay */}
      {tooltip.visible && (
        <div 
          className="custom-tooltip"
          style={{ top: tooltip.y, left: tooltip.x }}
        >
          {tooltip.text}
        </div>
      )}

    </div>
  )
}