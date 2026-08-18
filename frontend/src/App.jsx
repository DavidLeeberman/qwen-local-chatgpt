import { useEffect, useRef } from 'react'
import { useChatStore } from './store/useChatStore'

import Login from './Login'
import AppContainer from './components/Layout/AppContainer'
import MainChatLayout from './components/Layout/MainChatLayout'
import Sidebar from './components/Sidebar/Sidebar'
import ChatArea from './components/Chat/ChatArea'
import Tooltip from './components/Tooltip/Tooltip'

import SettingsModal from './components/Settings/SettingsModal'
import SearchModal from './components/Search/SearchModal'
import ConfirmModal from './components/UI/ConfirmModal' // 👈 Import your modal

// Import your shiny new custom hooks!
import { useChatLifecycle } from './hooks/useChatLifecycle'
import { useDropdown } from './hooks/useDropdown'
import { useTooltip } from './hooks/useTooltip'

import { TruncatedText } from './components/UI/FormattedText'

import './App.css'
import confirmModalStyles from './components/UI/ConfirmModal.module.css'

export default function App() {
  const token = useChatStore(state => state.token)
  const setToken = useChatStore(state => state.setToken)
  const setUsername = useChatStore(state => state.setUsername)
  const conversations = useChatStore(state => state.conversations)
  const chat = useChatStore(state => state.chat)
  const targetMessageId = useChatStore(state => state.targetMessageId)
  const listScrollTrigger = useChatStore(state => state.listScrollTrigger)
  const newChat = useChatStore(state => state.newChat)

  const isSettingsOpen = useChatStore(state => state.isSettingsOpen)

  // 2. Add the search modal state
  const isSearchModalOpen = useChatStore(state => state.isSearchModalOpen)
  const setSearchModalOpen = useChatStore(state => state.setSearchModalOpen)
  
  // 👈 NEW: Grab global delete state and actions
  const chatToDelete = useChatStore(state => state.chatToDelete)
  const setChatToDelete = useChatStore(state => state.setChatToDelete)
  const deleteConversation = useChatStore(state => state.deleteConversation)
  
  const virtuosoRef = useRef(null)

  // 1. Initialize Custom Hooks
  useChatLifecycle()
  const { tooltip, handleTitleMouseEnter, handleTitleMouseLeave } = useTooltip()

  // 2. Virtuoso Auto-Scroll Logic (Handles both target search scrolls and normal bottom scrolls in ChatArea rendering)
  useEffect(() => {
    if (listScrollTrigger <= 0 || !virtuosoRef.current) return

    requestAnimationFrame(() => {
      // If a target message ID exists from search, scroll directly to center on it
      if (targetMessageId) {
        const targetIndex = chat.findIndex(
          m => 
            m.id === targetMessageId || 
            m.userMessageId === targetMessageId || 
            m.assistantMessageId === targetMessageId
        )

        if (targetIndex !== -1) {
          virtuosoRef.current.scrollToIndex({
            index: targetIndex,
            align: 'center',
            behavior: 'smooth'
          })
          return
        }
      }

      // Default behavior: scroll to the bottom of the chat list
      virtuosoRef.current.scrollToIndex({ 
        index: Math.max(chat.length - 1, 0), 
        align: 'end' 
      })
    })
  }, [listScrollTrigger, targetMessageId])

  // 3. Add the global Keyboard Shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchModalOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSearchModalOpen])

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
            handleTitleMouseEnter={handleTitleMouseEnter}
            handleTitleMouseLeave={handleTitleMouseLeave}
            onNewChat={() => {
              // Trigger your Zustand createChat action here, e.g.:
              // useChatStore.getState().createNewChat()
              newChat(); // Reset branched state when starting a new chat
            }}
          />
        }
      >
        {/* Everything passed as 'children' goes into the right-hand chat column */}
        {/* Main Chat Area */}
        <ChatArea 
          virtuosoRef={virtuosoRef} 
          increaseViewportBy={800} /* Restored Virtuoso prop */
        />
      </MainChatLayout>

      {/* Floating Overlays sit outside the layout grid! */}
      <Tooltip {...tooltip} />

      {/* 3. Render Modals conditionally based on Zustand state */}
      {isSettingsOpen && <SettingsModal />}
      {isSearchModalOpen && <SearchModal />}

      {/* 👈 NEW: Render the global ConfirmModal */}
      {chatToDelete && (
        <ConfirmModal
          title="Delete conversation"
          message={
            <>
              Are you sure you want to permanently delete conversation:<br />
              '<TruncatedText 
                text={chatToDelete.title || 'New Chat'}
                className={confirmModalStyles.messageBox} 
              />'?<br />
              <strong>This action cannot be undone.</strong>
            </>
          }
          confirmText="Delete"
          isDanger={true}
          onConfirm={() => {
            deleteConversation(chatToDelete.id)
            setChatToDelete(null) // Close modal after delete
          }}
          onCancel={() => setChatToDelete(null)} // Close modal on cancel
        />
      )}
    </AppContainer>
  )
}