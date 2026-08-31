import { useState, useEffect, useRef, useCallback } from 'react'

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
  const [visibleCount, setVisibleCount] = useState(30) // NEW: Chunk size for lazy loading
  
  const nativeScrollerRef = useRef(null)
  const lastMessageRef = useRef(null)
  const topSentinelRef = useRef(null) // NEW: Observer target to load older messages
  const prevStreamingRef = useRef(isStreaming)

  // STABILIZED CALLBACK: Prevents breaking React.memo on ChatMessage
  const handleRegenerate = useCallback(() => {
    regenerate();
  }, [regenerate]);

  // NEW: Reset visible messages to just the latest 30 whenever you switch to a new chat
  useEffect(() => {
    setVisibleCount(30);
  }, [cid]);

  // NEW: Ensure the search target message is always rendered, even if it's 200 messages deep
  useEffect(() => {
    if (targetMessageId && chat.length > 0) {
      const targetIdx = chat.findIndex(m => 
        String(m.id) === String(targetMessageId) || 
        String(m.assistantMessageId) === String(targetMessageId) ||
        String(m.userMessageId) === String(targetMessageId)
      );
      if (targetIdx !== -1) {
        const needed = chat.length - targetIdx;
        if (needed > visibleCount) {
          setVisibleCount(needed + 20); // Expand render window with a 20-message buffer
        }
      }
    }
  }, [targetMessageId, chat, visibleCount]);

  // CALCULATE DISPLAYED SLICE
  const startIndex = Math.max(0, chat.length - visibleCount);
  const displayedChat = chat.slice(startIndex);
  const hasMore = startIndex > 0;

  // NEW: Background Observer to seamlessly load older messages when you scroll near the top
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        // Load the next 30 older messages
        setVisibleCount(prev => Math.min(prev + 30, chat.length));
      }
    }, {
      root: nativeScrollerRef.current,
      rootMargin: '600px 0px 0px 0px' // Pre-load 600px before the user actually hits the top
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, chat.length]);

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

    const distanceFromBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
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

  // Auto-Scroll Logic handles initial positioning on chat load, switch, or branch (snaps to bottom)
  // 🌟 LIGHTWEIGHT NON-BLOCKING SCROLL ENGINE
  // Uses staggered timeouts instead of heavy continuous observers to keep the main thread 100% free
  useEffect(() => {
    const scroller = nativeScrollerRef.current;
    if (!scroller) return;

    // Helper to snap to bottom if there's no specific target
    if (!targetMessageId) {
      requestAnimationFrame(() => {
        scroller.scrollTop = scroller.scrollHeight;
        checkIsAtBottom();
      });
      return;
    }

    const executeScroll = () => {
      const targetEl = document.getElementById(`msg-${targetMessageId}`);
      if (!targetEl) return;

      const highlightNode = targetEl.querySelector('.highlight, mark');
      
      // 1. Traverse and horizontally scroll nested Markdown containers
      if (highlightNode) {
        let currentParent = highlightNode.parentElement;
        while (currentParent && currentParent !== scroller && scroller.contains(currentParent)) {
          if (currentParent.scrollWidth > currentParent.clientWidth) {
            const pRect = currentParent.getBoundingClientRect();
            const nRect = highlightNode.getBoundingClientRect();
            
            const absoluteLeft = (nRect.left - pRect.left) + currentParent.scrollLeft;
            const targetLeft = absoluteLeft + (nRect.width / 2) - (currentParent.clientWidth / 2);
            
            currentParent.scrollTo({ left: Math.max(0, targetLeft), behavior: 'auto' });
          }
          currentParent = currentParent.parentElement;
        }
      }

      // 2. Compute Vertical Target Position
      const scrollerRect = scroller.getBoundingClientRect();
      const activeNode = highlightNode || targetEl;
      const nodeRect = activeNode.getBoundingClientRect();

      if (nodeRect.height === 0) return; // Prevent NaN errors during unmounts

      const absoluteNodeTop = (nodeRect.top - scrollerRect.top) + scroller.scrollTop;
      
      // 🌟 CRITICAL FIX:
      // If a specific .highlight span exists, center it in the viewport.
      // If NO highlight exists, align to the TOP of the message container (+40px buffer) 
      // instead of centering the message midpoint (which causes the 4-page over-scroll on long messages).
      let desiredScrollTop = highlightNode
        ? absoluteNodeTop + (nodeRect.height / 2) - (scroller.clientHeight / 2)
        : absoluteNodeTop - 40;

      scroller.scrollTo({
        top: Math.max(0, desiredScrollTop),
        behavior: 'auto'
      });
    };

    // Stagger checks to catch initial mount and post-highlighting layout completion without CPU drain
    const timer1 = setTimeout(executeScroll, 50);
    const timer2 = setTimeout(executeScroll, 200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
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
        {/* Invisible Sentinel to trigger older message loading */}
        {hasMore && <div ref={topSentinelRef} style={{ height: '1px' }} />}

        {displayedChat.map((item, localIndex) => {
          const absoluteIndex = startIndex + localIndex;
          const previousMsg = chat[absoluteIndex - 1]
          const timeDiff = previousMsg ? new Date(item.createdAt) - new Date(previousMsg.createdAt) : 0
          const showTimestamp = absoluteIndex === 0 || timeDiff > 3600000
          const isLastMessage = absoluteIndex === chat.length - 1

          return (
            <div 
              key={item.id}
              // The outer ID wrapper was removed here so the browser stops centering the entire combined text block[cite: 17]
              // Applies the layout spacer so scrolling 1/5th up is mechanically possible
              style={{ minHeight: isLastMessage && isStreaming ? 'calc(100vh - 40px)' : 'auto' }}
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
                  onRegenerate={handleRegenerate}
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
      {isArchived ? <ArchivedFooter /> : <ChatInput />}
    </div>
  )
}