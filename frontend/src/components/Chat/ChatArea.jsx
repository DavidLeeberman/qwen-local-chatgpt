import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Virtuoso } from 'react-virtuoso'

import { useChatStore } from '../../store/useChatStore'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ArchivedFooter from './ArchivedFooter'
import { ErrMessage } from '../UI/FormattedText'
import { formatTimestamp } from '../UI/FormattedText'
import { DownArrowIcon } from '../UI/Icons'

import styles from './ChatArea.module.css'

// --- Scrollable Footer ---
const ChatFooter = ({ isArchived }) => {
  return (
    <div 
      className={styles['chat-list-footer-container']}
      style={{ paddingBottom: isArchived ? '130px' : '90px' }}
    >      
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
  const regenerate = useChatStore(state => state.regenerate)
  const listScrollTrigger = useChatStore(state => state.listScrollTrigger)
  
  // Determine if the currently viewed chat is archived
  const cid = useChatStore(state => state.cid);
  const conversations = useChatStore(state => state.conversations);
  const activeChat = conversations.find(c => c.id === cid);
  
  // When branching, isArchived evaluates to false to recover active layout
  const isArchived = activeChat?.is_archived && !isBranched;

  // 🌟 FIX 2: Local state to track Virtuoso's native scroll position
  const [isAtBottom, setIsAtBottom] = useState(true);
  const nativeScrollerRef = useRef(null)

  const scrollToBottom = () => {
    const scroller = nativeScrollerRef.current

    if (!scroller) return

    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: 'smooth'
    })
  }

  // 🌟 FIX: Reusable distance checker
  const checkIsAtBottom = useCallback(() => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    const distanceFromBottom =
      scroller.scrollHeight -
      scroller.clientHeight -
      scroller.scrollTop

    const epsilon = 8

    setIsAtBottom(distanceFromBottom <= epsilon)
  }, [])

  // 1. Check distance on load, chat switch, or branch
  useEffect(() => {
    const scroller = nativeScrollerRef.current;
    if (!scroller) return;

    // 50ms timeout guarantees React has flushed the new chat array to the DOM 
    // and calculated the raw Markdown heights before we measure scrollHeight.
    const timer = setTimeout(() => {
      scroller.scrollTop = scroller.scrollHeight;
      checkIsAtBottom();
    }, 50);

    return () => clearTimeout(timer);
  }, [listScrollTrigger, checkIsAtBottom]);

  // 2. Check distance on manual scroll
  useEffect(() => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    checkIsAtBottom()

    scroller.addEventListener('scroll', checkIsAtBottom, {
      passive: true
    })

    return () => {
      scroller.removeEventListener('scroll', checkIsAtBottom)
    }
  }, [checkIsAtBottom])

  // 3. 🌟 FIX: Check distance when content grows (Send, Regenerate, or Streaming)
  useEffect(() => {
    checkIsAtBottom()
  }, [chat, checkIsAtBottom])

  return (
    <div className={styles['main-chat-area']}>
      <div
        ref={nativeScrollerRef}
        className={styles['native-chat-scroller']}
      >
        {chat.map((item, index) => {
          const previousMsg = chat[index - 1]

          const timeDiff = previousMsg
            ? new Date(item.createdAt) -
              new Date(previousMsg.createdAt)
            : 0

          const showTimestamp =
            index === 0 ||
            timeDiff > 3600000

          const isLastMessage =
            index === chat.length - 1

          return (
            <React.Fragment key={item.id}>
              {showTimestamp && (
                <div className={styles['time-break']}>
                  {formatTimestamp(item.createdAt)}
                </div>
              )}

              <ChatMessage
                message={item}
                isLastMessage={isLastMessage}
                onRegenerate={() => regenerate()}
              />
            </React.Fragment>
          )
        })}

        <ChatFooter isArchived={isArchived} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      <button
        onClick={scrollToBottom}
        className={`${styles['scroll-bottom-btn']} ${isAtBottom ? styles['hidden'] : ''}`}
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