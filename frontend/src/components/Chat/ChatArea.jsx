import React, { useState, useEffect, useRef, useCallback } from 'react'

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
export default function ChatArea() {
  const chat = useChatStore(state => state.chat)
  const err = useChatStore(state => state.err)
  const isBranched = useChatStore(state => state.isBranched)
  const isStreaming = useChatStore(state => state.isStreaming)
  const regenerate = useChatStore(state => state.regenerate)
  const listScrollTrigger = useChatStore(state => state.listScrollTrigger)
  const targetMessageId = useChatStore(state => state.targetMessageId)
  
  const cid = useChatStore(state => state.cid)
  const conversations = useChatStore(state => state.conversations)
  const activeChat = conversations.find(c => c.id === cid)
  
  // When branching, isArchived evaluates to false to recover active layout
  const isArchived = activeChat?.is_archived && !isBranched

  const [isAtBottom, setIsAtBottom] = useState(true)
  const nativeScrollerRef = useRef(null)
  const lastMessageRef = useRef(null)
  const prevStreamingRef = useRef(isStreaming)

  // 🌟 FIX 2: Smart scrolling that respects the artificial spacer
  const scrollToBottom = () => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    // If streaming, scroll to the bottom of the actual generating text 
    // rather than the absolute bottom (which contains the empty spacer)
    if (isStreaming && lastMessageRef.current) {
      const textBottom = lastMessageRef.current.offsetTop + lastMessageRef.current.offsetHeight
      scroller.scrollTo({
        top: Math.max(0, textBottom - scroller.clientHeight + 40), // 40px padding beneath text
        behavior: 'smooth'
      })
    } else {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  // 🌟 FIX 2: Check distance against the true text node boundaries
  const checkIsAtBottom = useCallback(() => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    const distanceFromBottom =
      scroller.scrollHeight -
      scroller.clientHeight -
      scroller.scrollTop

    const epsilon = 8
    let atBottom = distanceFromBottom <= epsilon

    // If we aren't at the physical bottom, check if the real text is still fully visible
    if (!atBottom && lastMessageRef.current) {
      const textBottom = lastMessageRef.current.offsetTop + lastMessageRef.current.offsetHeight
      const viewportBottom = scroller.scrollTop + scroller.clientHeight
      
      // If the bottom of the last message hasn't grown past the viewport yet, 
      // the user hasn't missed anything. Hide the arrow.
      if (textBottom <= viewportBottom + epsilon) {
        atBottom = true
      }
    }

    setIsAtBottom(atBottom)
  }, [])

  // Auto-Scroll Logic with ResizeObserver for Layout Shifts handles 
  // both target search scrolls and initial positioning on chat load, switch, or branch (snaps to bottom)
  useEffect(() => {
    const scroller = nativeScrollerRef.current;
    if (!scroller) return;

    // Helper to snap to bottom if there's no specific target
    if (!targetMessageId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            scroller.scrollTop = scroller.scrollHeight;
            checkIsAtBottom();
          }, 50);
        });
      });
      return; // Exit early since we don't need to observe for centering
    }

    // 1. Locate the specific target message
    const targetEl = document.getElementById(`msg-${targetMessageId}`);
    if (!targetEl) return;

    // 2. Initial scroll to center
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 3. Create a ResizeObserver to watch for late-loading images/code blocks
    let timeoutId;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        targetEl.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, 50); // Wait 50ms for layout shifts to settle before scrolling
    });

    // Observe the entire scroll container to catch any layout shifts above the target
    resizeObserver.observe(scroller);

    // 4. Cleanup mechanisms
    // Auto-disconnect after 3 seconds (assuming network assets have loaded) 
    // to prevent locking the user's scroll indefinitely.
    const safetyTimeout = setTimeout(() => {
      resizeObserver.disconnect();
    }, 3000);

    // Cancel observer if the user manually attempts to scroll away
    const handleUserInteraction = () => resizeObserver.disconnect();
    scroller.addEventListener('wheel', handleUserInteraction, { once: true, passive: true });
    scroller.addEventListener('touchstart', handleUserInteraction, { once: true, passive: true });

    return () => {
      resizeObserver.disconnect();
      clearTimeout(safetyTimeout);
      clearTimeout(timeoutId);
      scroller.removeEventListener('wheel', handleUserInteraction);
      scroller.removeEventListener('touchstart', handleUserInteraction);
    };
  }, [listScrollTrigger, targetMessageId, checkIsAtBottom]);

  // 🌟 FIX 1: One-time scroll positioning to 1/5th of the viewport height when Send / Regenerate starts
  useEffect(() => {
    // When stream transitions from false -> true
    if (isStreaming && !prevStreamingRef.current) {
      // Double RAF ensures React DOM commit and browser layout passes have completed
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = nativeScrollerRef.current
          const lastEl = lastMessageRef.current

          if (container && lastEl) {
            const oneFifthOffset = container.clientHeight / 5;
            const targetTop = Math.max(0, lastEl.offsetTop - oneFifthOffset)
            
            container.scrollTo({
              top: targetTop,
              behavior: 'smooth'
            })
          }
        })
      })
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])

  // Track scroll state on manual scroll
  useEffect(() => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    checkIsAtBottom()
    scroller.addEventListener('scroll', checkIsAtBottom, { passive: true })

    return () => {
      scroller.removeEventListener('scroll', checkIsAtBottom)
    }
  }, [checkIsAtBottom])

  // Track scroll state as response streams and expands the DOM height
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
            ? new Date(item.createdAt) - new Date(previousMsg.createdAt)
            : 0

          const showTimestamp = index === 0 || timeDiff > 3600000
          const isLastMessage = index === chat.length - 1

          return (
            <div 
              key={item.id}
              // The outer ID wrapper was removed here so the browser stops centering the entire combined text block[cite: 17]
              style={{
                // Applies the layout spacer so scrolling 1/5th up is mechanically possible
                minHeight: isLastMessage && isStreaming ? 'calc(100vh - 40px)' : 'auto'
              }}
            >
              {/* Inner wrapper allows us to measure actual text height independent of spacer */}
              <div ref={isLastMessage ? lastMessageRef : null}>
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
              </div>
            </div>
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