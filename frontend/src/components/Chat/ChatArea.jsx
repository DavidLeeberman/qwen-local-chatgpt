import { useState, useEffect, useLayoutEffect, useRef, useCallback, forwardRef } from 'react'

import { useChatStore } from '../../store/useChatStore'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ArchivedFooter from './ArchivedFooter'
import { ErrMessage, formatTimestamp } from '../UI/FormattedText'
import { DownArrowIcon } from '../UI/Icons'

import styles from './ChatArea.module.css'

// Configuration Constants
const INITIAL_BATCH = 30;
const CHUNK_SIZE = 20;
const MAX_VISIBLE = 50;
const DEFAULT_MSG_HEIGHT = 120;

// --- Scrollable Footer ---
const ChatFooter = forwardRef(({ isArchived }, ref) => {
  return (
    <div 
      ref={ref}
      className={styles['chat-list-footer-container']}
      style={{ paddingBottom: isArchived ? '130px' : '90px' }}
    >      
      {/* Disclaimer that scrolls with the chat */}
      <div className={styles['disclaimer-text']}>
        ChatGPT can make mistakes. Check important info.
      </div>
    </div>
  );
});
ChatFooter.displayName = 'ChatFooter';

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
  const [hasStreamedInSession, setHasStreamedInSession] = useState(false)
  const [spacerHeight, setSpacerHeight] = useState(0)

  // Relative Sliding Window State
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH) // Chunk size for lazy loading
  const [bottomOffset, setBottomOffset] = useState(0)
  const [heightsVersion, setHeightsVersion] = useState(0)

  const nativeScrollerRef = useRef(null)
  const lastMessageRef = useRef(null)
  const lastSpacerRef = useRef(null) 
  const footerRef = useRef(null) // Added ref to measure exact footer DOM height
  const topSentinelRef = useRef(null) // Observer target to load older messages
  const bottomSentinelRef = useRef(null)
  
  const prevStreamingRef = useRef(isStreaming)
  
  const activeCidRef = useRef(cid)

  // Physical Anchor & Height Measurement Tracking using offsetTop
  const scrollAnchorRef = useRef({ id: null, initialOffsetTop: 0 })
  const prevFirstMsgOffsetRef = useRef(null)
  const messageHeightsRef = useRef(new Map())

  /* ===============================================================================================
     Callback Reference Stability: Wrapped handlers like handleRegenerate in useCallback within 
     ChatArea.jsx to prevent parent state updates from invalidating child memoization.
  =============================================================================================== */

  // STABILIZED CALLBACK: Prevents breaking React.memo on ChatMessage
  const handleRegenerate = useCallback(() => {
    regenerate();
  }, [regenerate]);

  // FRAME 0 CHAT SWITCH GUARD: Prevents stale renders & blank screens
  const isChatSwitch = activeCidRef.current !== cid;
  const currentVisible = isChatSwitch ? INITIAL_BATCH : visibleCount;
  const currentBottomOffset = isChatSwitch ? 0 : bottomOffset;

  // DYNAMIC BOUND COMPUTATION (Guaranteed valid array slicing)
  const clampedBottomOffset = Math.min(Math.max(0, currentBottomOffset), Math.max(0, chat.length - 1));
  const effectiveEnd = Math.max(0, chat.length - clampedBottomOffset);
  const effectiveStart = Math.max(0, effectiveEnd - currentVisible);

  const displayedChat = chat.slice(effectiveStart, effectiveEnd);
  const hasMoreAbove = effectiveStart > 0;
  const hasMoreBelow = effectiveEnd < chat.length;

  /* ===============================================================================================
     Tail-First Progressive Pagination: 
     Implemented visibleCount chunking (rendering only the last 30 messages on mount) 
     with an IntersectionObserver top sentinel to prepending older messages as you scroll up. 
     Included automatic window expansion when jumping to deep search targets via targetMessageId. 
  =============================================================================================== */

  // Reset visible messages to just the latest 30 and layout spacer whenever you switch to a new chat
  useEffect(() => {
    if (activeCidRef.current !== cid) {
      setVisibleCount(INITIAL_BATCH);
      setBottomOffset(0);
      scrollAnchorRef.current = { id: null, initialOffsetTop: 0 };
      prevFirstMsgOffsetRef.current = null;
      messageHeightsRef.current.clear();

      const prevCid = activeCidRef.current;
      const isGenuineSwitch = 
        cid === null || 
        (prevCid !== null && !String(prevCid).startsWith('temp_') && cid !== null);

      if (!isStreaming && isGenuineSwitch) {
        setHasStreamedInSession(false);
        setSpacerHeight(0);
      }

      activeCidRef.current = cid;
    }
  }, [cid, isStreaming]);

  // PIN TO LIVE TAIL DURING ACTIVE STREAMING
  useEffect(() => {
    if (isStreaming) {
      setHasStreamedInSession(true);
      setBottomOffset(0);
    }
  }, [isStreaming]);

  // ENSURE SEARCH TARGET IS WITHIN RENDER WINDOW
  useEffect(() => {
    if (targetMessageId && chat.length > 0) {
      const targetIdx = chat.findIndex(m => 
        String(m.id) === String(targetMessageId) || 
        String(m.assistantMessageId) === String(targetMessageId) ||
        String(m.userMessageId) === String(targetMessageId)
      );
      if (targetIdx !== -1) {
        const distanceCount = chat.length - 1 - targetIdx;
        if (distanceCount >= 0) {
          setBottomOffset(Math.max(0, distanceCount - 15));
          setVisibleCount(MAX_VISIBLE);
        }
      }
    }
  }, [targetMessageId, chat]);

  // Cache rendered message heights for spacer accuracy & trigger immediate pass if new heights are recorded
  useLayoutEffect(() => {
    let hasNewMeasurements = false;
    displayedChat.forEach(msg => {
      const el = document.getElementById(`msg-${msg.id}`);
      if (el && el.offsetHeight > 0) {
        const prevHeight = messageHeightsRef.current.get(msg.id);
        if (prevHeight !== el.offsetHeight) {
          messageHeightsRef.current.set(msg.id, el.offsetHeight);
          hasNewMeasurements = true;
        }
      }
    });

    if (hasNewMeasurements) {
      setHeightsVersion(v => v + 1);
    }
  }, [displayedChat]);

  // Calculate dynamic average message height
  const measuredHeights = Array.from(messageHeightsRef.current.values());
  const avgHeight = measuredHeights.length > 0 
    ? measuredHeights.reduce((a, b) => a + b, 0) / measuredHeights.length 
    : DEFAULT_MSG_HEIGHT;

  // Calculate top and bottom spacer dimensions
  let topSpacerHeight = 0;
  for (let i = 0; i < effectiveStart; i++) {
    const msg = chat[i];
    topSpacerHeight += (msg && messageHeightsRef.current.get(msg.id)) || avgHeight;
  }

  let bottomSpacerHeight = 0;
  for (let i = effectiveEnd; i < chat.length; i++) {
    const msg = chat[i];
    bottomSpacerHeight += (msg && messageHeightsRef.current.get(msg.id)) || avgHeight;
  }

  // PHYSICAL ANCHOR PINNING & SPACER DRIFT COMPENSATION
  useLayoutEffect(() => {
    const scroller = nativeScrollerRef.current;
    if (!scroller) return;

    // 1. Explicit Anchor Pinning (e.g. from top/bottom pagination sentinels)
    const { id, initialOffsetTop } = scrollAnchorRef.current;
    if (id) {
      const anchorEl = document.getElementById(`msg-${id}`);
      if (anchorEl) {
        const delta = anchorEl.offsetTop - initialOffsetTop;
        if (delta !== 0) {
          scroller.scrollTop += delta;
        }
      }
      scrollAnchorRef.current = { id: null, initialOffsetTop: 0 };
    } 
    // 2. Implicit Anchor Pinning (compensates for top spacer expansion during initial measurements / re-renders)
    else if (displayedChat.length > 0) {
      const firstMsgEl = document.getElementById(`msg-${displayedChat[0].id}`);
      if (firstMsgEl && prevFirstMsgOffsetRef.current !== null) {
        const delta = firstMsgEl.offsetTop - prevFirstMsgOffsetRef.current;
        if (delta !== 0) {
          scroller.scrollTop += delta;
        }
      }
    }

    // Save current offsetTop of the first rendered message for the next pass
    if (displayedChat.length > 0) {
      const firstMsgEl = document.getElementById(`msg-${displayedChat[0].id}`);
      if (firstMsgEl) {
        prevFirstMsgOffsetRef.current = firstMsgEl.offsetTop;
      } else {
        prevFirstMsgOffsetRef.current = null;
      }
    } else {
      prevFirstMsgOffsetRef.current = null;
    }
  }, [effectiveStart, effectiveEnd, topSpacerHeight, bottomSpacerHeight, heightsVersion, displayedChat]);

  // Snapshot visible top anchor node before range mutations
  const captureScrollAnchor = useCallback(() => {
    const scroller = nativeScrollerRef.current;
    if (!scroller) return;

    let anchorId = null;
    let anchorOffsetTop = 0;

    for (let i = 0; i < displayedChat.length; i++) {
      const msgEl = document.getElementById(`msg-${displayedChat[i].id}`);
      if (msgEl && (msgEl.offsetTop + msgEl.offsetHeight > scroller.scrollTop)) {
        anchorId = displayedChat[i].id;
        anchorOffsetTop = msgEl.offsetTop;
        break;
      }
    }

    if (anchorId) {
      scrollAnchorRef.current = { id: anchorId, initialOffsetTop: anchorOffsetTop };
    }
  }, [displayedChat]);

  // Background Pagination Observer to seamlessly load older messages when you scroll near the top
  // IntersectionObserver with offsetTop Snapshot
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel || !hasMoreAbove) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        captureScrollAnchor();
        setVisibleCount(prevVis => {
          if (prevVis < MAX_VISIBLE) {
            return Math.min(MAX_VISIBLE, prevVis + CHUNK_SIZE);
          } else {
            setBottomOffset(prevBottom => prevBottom + CHUNK_SIZE);
            return MAX_VISIBLE;
          }
        });
      }
    }, {
      root: nativeScrollerRef.current,
      rootMargin: '300px 0px 0px 0px'
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreAbove, captureScrollAnchor]);

  // OBSERVER FOR BOTTOM EXPANSION & TOP PRUNING
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (!sentinel || !hasMoreBelow || isStreaming) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        captureScrollAnchor();
        setBottomOffset(prevBottom => Math.max(0, prevBottom - CHUNK_SIZE));
      }
    }, {
      root: nativeScrollerRef.current,
      rootMargin: '0px 0px 300px 0px'
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreBelow, isStreaming, captureScrollAnchor]);

  // Evaluates viewport distance against physical scroll bottom and active text bounds
  const checkIsAtBottom = useCallback(() => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    const distanceFromBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
    const epsilon = 15
    let atBottom = distanceFromBottom <= epsilon

    // Active streaming: verify if generated text hasn't overflowed viewport bottom
    if (!atBottom && isStreaming && lastMessageRef.current) {
      const textBottom = lastMessageRef.current.offsetTop + lastMessageRef.current.offsetHeight
      const viewportBottom = scroller.scrollTop + scroller.clientHeight
      
      // If the bottom of the last message hasn't grown past the viewport yet, 
      // the user hasn't missed anything. Hide the arrow.
      if (textBottom <= viewportBottom + epsilon) {
        atBottom = true
      }
    }

    // Static post-stream state: check text visibility or clear spacer if manually at bottom
    if (!atBottom && !isStreaming && hasStreamedInSession && lastMessageRef.current) {
      const textBottom = lastMessageRef.current.offsetTop + lastMessageRef.current.offsetHeight
      const viewportBottom = scroller.scrollTop + scroller.clientHeight
      
      if (textBottom <= viewportBottom + epsilon) {
        atBottom = true
      } else if (distanceFromBottom <= epsilon) {
        atBottom = true
        setHasStreamedInSession(false)
        setSpacerHeight(0)
      }
    }

    setIsAtBottom(atBottom)
  }, [isStreaming, hasStreamedInSession])

  // Handles scroll positioning on DownArrow click
  const scrollToBottom = () => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    setBottomOffset(0);
    setVisibleCount(INITIAL_BATCH);

    if (isStreaming) {
      // Active streaming: target current text node bottom
      if (lastMessageRef.current) {
        const textBottom = lastMessageRef.current.offsetTop + lastMessageRef.current.offsetHeight
        scroller.scrollTo({
          top: Math.max(0, textBottom - scroller.clientHeight + 40),
          behavior: 'smooth'
        })
      } else {
        scroller.scrollTo({
          top: scroller.scrollHeight,
          behavior: 'smooth'
        })
      }
    } else {
      // Static state: collapse spacer synchronously and scroll to true physical bottom
      if (lastSpacerRef.current) {
        lastSpacerRef.current.style.minHeight = 'auto'
      }
      setHasStreamedInSession(false)
      setSpacerHeight(0)

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (nativeScrollerRef.current) {
            nativeScrollerRef.current.scrollTo({
              top: nativeScrollerRef.current.scrollHeight,
              behavior: 'smooth'
            })

            // Convergence check: guarantees 1-click landing after layout reflows settle
            setTimeout(() => {
              if (nativeScrollerRef.current) {
                nativeScrollerRef.current.scrollTop = nativeScrollerRef.current.scrollHeight;
                checkIsAtBottom();
              }
            }, 350);
          }
        })
      })
    }
  }

  // Auto-Scroll Logic handles initial positioning on chat load, switch, or branch (snaps to bottom)
  // 🌟 LIGHTWEIGHT NON-BLOCKING SCROLL ENGINE
  // Uses staggered timeouts instead of heavy continuous observers to keep the main thread 100% free
  // Initial load or search target jump
  // FIXED (Bug #5): Removed checkIsAtBottom from dependency array to prevent streaming state flips from re-snapping scrollTop
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
  }, [listScrollTrigger, targetMessageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // One-time scroll positioning to 1/5th of the viewport height when Send / Regenerate starts
  useEffect(() => {
    // When stream transitions from false -> true
    if (isStreaming && !prevStreamingRef.current) {
      // Double RAF ensures React DOM commit and browser layout passes have completed
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = nativeScrollerRef.current
          const lastEl = lastMessageRef.current
          const spacerEl = lastSpacerRef.current

          if (container && lastEl && spacerEl) {
            // FIX #4: Measure actual DOM height of footer element instead of using hardcoded assumptions
            const footerHeight = footerRef.current ? footerRef.current.offsetHeight : (isArchived ? 130 : 90);
            const exactHeightRequired = (container.clientHeight * 0.8) - footerHeight;
            const calculatedHeight = Math.max(0, exactHeightRequired);
            
            spacerEl.style.minHeight = `${calculatedHeight}px`;
            setSpacerHeight(calculatedHeight);

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
  }, [isStreaming, isArchived])

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

  // Helper to parse naive DB dates and UTC ISO strings on the exact same baseline
  const parseTimestamp = (dateStr) => {
    if (!dateStr) return null;
    if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')) {
      return new Date(dateStr.replace(' ', 'T') + 'Z');
    }
    return new Date(dateStr);
  };

  return (
    <div className={styles['main-chat-area']}>
      <div 
        ref={nativeScrollerRef} 
        className={styles['native-chat-scroller']} 
      >
        {/* Top Spacer for Unrendered Messages */}
        {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px` }} />}

        {/* Top Sentinel to expand range upward & prune bottom */}
        {hasMoreAbove && <div ref={topSentinelRef} style={{ height: '1px' }} />}

        {displayedChat.map((item, localIndex) => {
          const absoluteIndex = effectiveStart + localIndex;
          const previousMsg = chat[absoluteIndex - 1]

          const currentMs = parseTimestamp(item.createdAt)?.getTime() || 0;
          const prevMs = previousMsg ? (parseTimestamp(previousMsg.createdAt)?.getTime() || 0) : 0;
          const timeDiff = (currentMs && prevMs) ? currentMs - prevMs : 0;

          const showTimestamp = absoluteIndex === 0 || timeDiff > 3600000
          const isLastMessage = absoluteIndex === chat.length - 1

          return (
            <div 
              key={item.userMessageId || item.id}
              id={`msg-${item.id}`}
              ref={isLastMessage ? lastSpacerRef : null}
              // The outer ID wrapper was removed here so the browser stops centering the entire combined text block[cite: 17]
              // Applies the layout spacer so scrolling 1/5th up is mechanically possible
              style={{ minHeight: isLastMessage && (isStreaming || hasStreamedInSession) ? (spacerHeight ? `${spacerHeight}px` : 'calc(100vh - 40px)') : 'auto' }}
            >
              {/* Inner wrapper allows measuring actual text height independent of spacer */}
              <div ref={isLastMessage ? lastMessageRef : null}>
                {showTimestamp && (
                  <div className={styles['time-break']}>
                    {formatTimestamp(parseTimestamp(item.createdAt))}
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

        {/* Bottom Sentinel to expand range downward & prune top */}
        {hasMoreBelow && <div ref={bottomSentinelRef} style={{ height: '1px' }} />}

        {/* Bottom Spacer for Unrendered Messages */}
        {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px` }} />}

        <ChatFooter ref={footerRef} isArchived={isArchived} />
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