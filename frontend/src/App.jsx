import { useEffect, useRef } from 'react'
import { useChatStore } from './store/useChatStore'

import Login from './Login'
import AppContainer from './components/Layout/AppContainer'
import MainChatLayout from './components/Layout/MainChatLayout'
import Sidebar from './components/Sidebar/Sidebar'
import ChatArea from './components/Chat/ChatArea'
import ChatInput from './components/Chat/ChatInput'
import Tooltip from './components/Tooltip/Tooltip'

import SettingsModal from './components/Settings/SettingsModal'
import ArchivedChatsModal from './components/Settings/ArchivedChatsModal'
import ConfirmModal from './components/UI/ConfirmModal'

// Import your shiny new custom hooks!
import { useChatLifecycle } from './hooks/useChatLifecycle'
import { useDropdown } from './hooks/useDropdown'
import { useTooltip } from './hooks/useTooltip'

import './App.css'

export default function App() {
  const token = useChatStore(state => state.token)
  const setToken = useChatStore(state => state.setToken)
  const setUsername = useChatStore(state => state.setUsername)
  const conversations = useChatStore(state => state.conversations)
  const chat = useChatStore(state => state.chat)
  const listScrollTrigger = useChatStore(state => state.listScrollTrigger)

  const isSettingsOpen = useChatStore(state => state.isSettingsOpen)
  const isArchivedChatsOpen = useChatStore(state => state.isArchivedChatsOpen)
  const confirmModalState = useChatStore(state => state.confirmModalState)
  
  const virtuosoRef = useRef(null)

  // 1. Initialize Custom Hooks
  useChatLifecycle()
  const { tooltip, handleTitleMouseEnter, handleTitleMouseLeave } = useTooltip()
  const { dropdownPos, updateDropdownPosition, activeMenuBtnRef } = useDropdown()

  // 2. Virtuoso Auto-Scroll Logic (Stays here since it dictates ChatArea rendering)
  useEffect(() => {
    if (listScrollTrigger > 0 && virtuosoRef.current) {
      requestAnimationFrame(() => {
        virtuosoRef.current.scrollToIndex({ 
          index: Math.max(chat.length - 1, 0), 
          align: 'end' 
        })
      })
    }
  }, [listScrollTrigger, chat.length]) // Only fires when loadMessages increments the trigger!

  // 3. Early Return for Auth
  if (!token) return <Login setToken={setToken} setUsername={setUsername} />

  // 4. Data Derivation
  const pinnedChats = conversations.filter(c => c.is_pinned && !c.is_archived)
  const recentChats = conversations.filter(c => !c.is_pinned && !c.is_archived)

  // 5. Render Shell
  return (
    <AppContainer>
      {/* The Chat UI Flexbox Grid */}
      <MainChatLayout
        sidebar={
          // Sidebar Framework
          <Sidebar
            pinnedChats={pinnedChats}
            recentChats={recentChats}
            dropdownPos={dropdownPos}
            updateDropdownPosition={updateDropdownPosition}
            handleTitleMouseEnter={handleTitleMouseEnter}
            handleTitleMouseLeave={handleTitleMouseLeave}
            activeMenuBtnRef={activeMenuBtnRef}
            onNewChat={() => {
              // Trigger your Zustand createChat action here, e.g.:
              // useChatStore.getState().createNewChat()
            }}
          />
        }
      >
        {/* Everything passed as 'children' goes into the right-hand chat column */}
        {/* Main Chat Area */}
        <ChatArea 
          virtuosoRef={virtuosoRef} 
          increaseViewportBy={800} /* Restored Virtuoso prop */
        >
          {/* Updated: ChatInput now manages its own state and refs internally! */}
          <ChatInput />
        </ChatArea>
      </MainChatLayout>

      {/* Floating Overlays sit outside the layout grid! */}
      <Tooltip {...tooltip} />

      {/* 3. Render Modals conditionally based on Zustand state */}
      {isSettingsOpen && <SettingsModal />}
      {isArchivedChatsOpen && <ArchivedChatsModal />}
      {confirmModalState?.isOpen && <ConfirmModal />}
    </AppContainer>
  )
}