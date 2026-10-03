import { useState, useEffect, useLayoutEffect, useRef, useCallback, forwardRef } from 'react'

import { useChatStore } from '../../store/useChatStore'
import ChatMessage from './ChatMessage'
import ChatInput from './ChatInput'
import ArchivedFooter from './ArchivedFooter'
import { ErrMessage, formatTimestamp } from '../UI/FormattedText'
import { DownArrowIcon } from '../UI/Icons'

import styles from './ChatArea.module.css'

// Configuration Constants
const CHUNK_SIZE = 20;
const TOP_TRIGGER_PX = 2;
const PAGE_HYDRATION_MARGIN_PX = 1;
const SCROLL_EPSILON = 15;

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
  const [pageRegistryVersion, setPageRegistryVersion] = useState(0)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [isChatDataReady, setIsChatDataReady] = useState(cid === null)

  const nativeScrollerRef = useRef(null)
  const lastMessageRef = useRef(null)
  const lastSpacerRef = useRef(null) 
  const footerRef = useRef(null) // Added ref to measure exact footer DOM height

  // Page registry is the sole source of truth for reached-page geometry and DOM residency.
  // pageIndex 0 is the newest page; larger pageIndex values move backward in history.
  const pageRegistryRef = useRef(new Map())
  const pageRegistryCidRef = useRef(cid)
  const pageLoadInProgressRef = useRef(false)
  const pendingPageLoadRef = useRef(null)

  // Add ref to flag manual programmatic scroll
  const isProgrammaticScrollRef = useRef(false);
  
  const prevStreamingRef = useRef(isStreaming)
  
  const initializedDataTriggerRef = useRef(null)
  const pendingDataTriggerRef = useRef(null)
  const initialPositionRequestRef = useRef(null)
  // Guards initial positioning until the newly selected conversation's message payload is ready.
  const chatDataSwitchPendingRef = useRef(false)
  // Keep the existing bottom-tail height isolated from page pagination mutations.
  const tailSpacerHeightRef = useRef(0)
  // Arm top-edge pagination only after the viewport has first moved inside the known range.
  // This prevents initial positioning from being mistaken for a user reaching the physical top.
  const topPaginationArmedRef = useRef(false)
  // Physical Anchor & Height Measurement Tracking using offsetTop
  const resizeObserverRef = useRef(null)

  /* ===============================================================================================
     Callback Reference Stability: Wrapped handlers like handleRegenerate in useCallback within 
     ChatArea.jsx to prevent parent state updates from invalidating child memoization.
  =============================================================================================== */

  // STABILIZED CALLBACK: Prevents breaking React.memo on ChatMessage
  const handleRegenerate = useCallback((messageId) => {
    regenerate(messageId);
  }, [regenerate]);

  const getPageBounds = useCallback((pageIndex, length = chat.length) => {
    const registryPage = pageRegistryRef.current.get(pageIndex);

    // Page 0 is the live tail page. Its end follows the canonical chat tail so that
    // newly-sent/streaming message pairs stay in the same tail page instead of being
    // silently pushed into an unreached page.
    if (registryPage && pageIndex === 0) {
      return {
        startIndex: registryPage.startIndex,
        endIndex: length
      };
    }

    if (registryPage) {
      return {
        startIndex: registryPage.startIndex,
        endIndex: Math.min(registryPage.endIndex, length)
      };
    }

    const tailPage = pageRegistryRef.current.get(0);
    const tailStartIndex = tailPage ? tailPage.startIndex : Math.max(0, length - CHUNK_SIZE);
    const endIndex = Math.max(0, tailStartIndex - ((pageIndex - 1) * CHUNK_SIZE));
    const startIndex = Math.max(0, endIndex - CHUNK_SIZE);
    return { startIndex, endIndex };
  }, [chat.length]);

  const createPage = useCallback((pageIndex, status = 'never', length = chat.length) => {
    if (length <= 0) return null;

    const existing = pageRegistryRef.current.get(pageIndex);
    if (existing) return existing;

    const { startIndex, endIndex } = getPageBounds(pageIndex, length);
    if (startIndex >= endIndex) return null;

    const page = {
      pageIndex,
      startIndex,
      endIndex,
      status,
      height: null
    };

    pageRegistryRef.current.set(pageIndex, page);
    return page;
  }, [chat.length, getPageBounds]);

  const resetPageRegistry = useCallback((length = chat.length) => {
    pageRegistryRef.current.clear();

    if (length > 0) {
      const startIndex = Math.max(0, length - CHUNK_SIZE);
      pageRegistryRef.current.set(0, {
        pageIndex: 0,
        startIndex,
        endIndex: length,
        status: 'loaded',
        height: null
      });
    }

    setPageRegistryVersion(v => v + 1);
  }, [chat.length]);

  const getPageIndexForMessageIndex = useCallback((messageIndex) => {
    for (const page of pageRegistryRef.current.values()) {
      const endIndex = page.pageIndex === 0 ? chat.length : page.endIndex;
      if (messageIndex >= page.startIndex && messageIndex < endIndex) {
        return page.pageIndex;
      }
    }
    return null;
  }, [chat.length]);

  // The current chat can grow while streaming. Keep page 0's tail boundary live while
  // preserving the fixed index ranges of every older page that has already been reached.
  useEffect(() => {
    if (pageRegistryCidRef.current !== cid) return;

    const tailPage = pageRegistryRef.current.get(0);
    if (tailPage && chat.length > 0) {
      tailPage.endIndex = chat.length;
      if (tailPage.startIndex >= chat.length) {
        tailPage.startIndex = Math.max(0, chat.length - CHUNK_SIZE);
      }
    }

    setPageRegistryVersion(v => v + 1);
  }, [chat.length, cid]);

  // Reset page residency immediately when the active conversation ID changes.
  // The old chat data is still present in the store for one render while the new request
  // is in flight, so keep the old pages out of the DOM until listScrollTrigger confirms
  // that the new conversation's message payload has arrived.
  useLayoutEffect(() => {
    if (pageRegistryCidRef.current === cid) return;

    pageRegistryCidRef.current = cid;
    initializedDataTriggerRef.current = null;
    pendingDataTriggerRef.current = listScrollTrigger;
    initialPositionRequestRef.current = null;
    chatDataSwitchPendingRef.current = true;
    tailSpacerHeightRef.current = 0;
    pageLoadInProgressRef.current = false;
    setIsPageLoading(false);
    pendingPageLoadRef.current = null;
    topPaginationArmedRef.current = false;
    if (nativeScrollerRef.current) nativeScrollerRef.current.scrollTop = 0;
    pageRegistryRef.current.clear();
    setPageRegistryVersion(v => v + 1);
    setIsChatDataReady(cid === null && chat.length === 0);

    setHasStreamedInSession(false);
    tailSpacerHeightRef.current = 0;
    setSpacerHeight(0);
  }, [cid, chat.length]);

  // A normal conversation switch increments listScrollTrigger only after the new full
  // message payload has been committed. Reset to exactly one newest page at that point.
  // Silent reloads explicitly skip this trigger and therefore preserve page residency.
  useLayoutEffect(() => {
    if (pageRegistryCidRef.current !== cid) return;

    const triggerKey = `${String(cid)}:${listScrollTrigger}`;
    const awaitingNewChatData = pendingDataTriggerRef.current !== null;
    const triggerChangedAfterChatSwitch = !awaitingNewChatData || listScrollTrigger !== pendingDataTriggerRef.current;
    const isNewTrigger = initializedDataTriggerRef.current !== triggerKey && triggerChangedAfterChatSwitch;
    const isLocalNewChatStream = cid === null && isStreaming && chat.length > 0 && pageRegistryRef.current.size === 0;

    if (!isNewTrigger && !isLocalNewChatStream) return;

    if (chat.length === 0) {
      pageRegistryRef.current.clear();
      setPageRegistryVersion(v => v + 1);
      setIsChatDataReady(true);
      initialPositionRequestRef.current = null;
      chatDataSwitchPendingRef.current = false;
      return;
    }

    pageRegistryRef.current.clear();
    resetPageRegistry(chat.length);
    initializedDataTriggerRef.current = triggerKey;
    pendingDataTriggerRef.current = null;
    initialPositionRequestRef.current = targetMessageId
      ? null
      : { cid, trigger: listScrollTrigger };
    chatDataSwitchPendingRef.current = false;
    tailSpacerHeightRef.current = 0;
    setSpacerHeight(0);
    setIsChatDataReady(true);
  }, [cid, listScrollTrigger, chat.length, isStreaming, resetPageRegistry, targetMessageId]);

  // Ensure the newest page exists when messages first arrive after an empty chat.
  useEffect(() => {
    if (chat.length === 0) {
      if (pageRegistryRef.current.size !== 0) {
        pageRegistryRef.current.clear();
        setPageRegistryVersion(v => v + 1);
      }
      if (cid === null) setIsChatDataReady(true);
      return;
    }

    if (pageRegistryCidRef.current !== cid) return;

    // Fresh local chats do not necessarily increment listScrollTrigger before streaming starts.
    if (cid === null && isStreaming && !pageRegistryRef.current.has(0)) {
      resetPageRegistry(chat.length);
      initializedDataTriggerRef.current = `${String(cid)}:${listScrollTrigger}`;
      setIsChatDataReady(true);
    }
  }, [chat.length, cid, isStreaming, listScrollTrigger, resetPageRegistry]);

  // PIN TO LIVE TAIL DURING ACTIVE STREAMING
  useEffect(() => {
    if (isStreaming) {
      setHasStreamedInSession(true);
    }
  }, [isStreaming]);

  // ENSURE SEARCH TARGET IS WITHIN THE KNOWN RANGE
  // Search navigation is an explicit jump, so it may materialize the pages between the
  // newest page and the target; ordinary scrolling never creates a NEVER page.
  useEffect(() => {
    if (!targetMessageId || chat.length === 0 || pageRegistryCidRef.current !== cid || !isChatDataReady) return;

    const targetIdx = chat.findIndex(m => 
      String(m.id) === String(targetMessageId) || 
      String(m.assistantMessageId) === String(targetMessageId) ||
      String(m.userMessageId) === String(targetMessageId)
    );
    if (targetIdx === -1) return;

    const targetPageIndex = getPageIndexForMessageIndex(targetIdx);
    if (targetPageIndex === null) {
      const distanceCount = chat.length - 1 - targetIdx;
      const inferredPage = Math.max(0, Math.floor(distanceCount / CHUNK_SIZE));

      for (let pageIndex = 1; pageIndex <= inferredPage; pageIndex++) {
        const page = createPage(pageIndex, 'loaded', chat.length);
        if (page) {
          page.status = page.height ? 'spacer' : 'loaded';
        }
      }
      setPageRegistryVersion(v => v + 1);
    }
  }, [targetMessageId, chat, cid, createPage, getPageIndexForMessageIndex, isChatDataReady]);

  // Stage 1: Asynchronous Content Heights (Images & Code Blocks) Observer
  // Cache rendered page heights & observe structural dynamic resizes
  useLayoutEffect(() => {
    if (!resizeObserverRef.current) {
      resizeObserverRef.current = new ResizeObserver((entries) => {
        let updated = false;
        for (const entry of entries) {
          const pageIndexAttr = entry.target.getAttribute('data-page-index');
          if (pageIndexAttr === null) continue;

          const pageIndex = Number(pageIndexAttr);
          const newH = entry.target.offsetHeight;
          if (newH > 0) {
            const page = pageRegistryRef.current.get(pageIndex);
            if (page && page.status === 'loaded') {
              if (page.height !== newH) {
                page.height = newH;
                updated = true;
              }
            }
          }
        }
        if (updated) {
          setPageRegistryVersion(v => v + 1);
        }
      });
    }

    const observer = resizeObserverRef.current;
    observer.disconnect();

    let hasNewMeasurements = false;
    pageRegistryRef.current.forEach((page) => {
      if (page.status !== 'loaded') return;

      const pageEl = document.querySelector(`[data-page-index="${page.pageIndex}"]`);
      if (pageEl) {
        if (pageEl.offsetHeight > 0 && page.height !== pageEl.offsetHeight) {
          page.height = pageEl.offsetHeight;
          hasNewMeasurements = true;
        }
        observer.observe(pageEl);
      }
    });

    if (hasNewMeasurements) {
      setPageRegistryVersion(v => v + 1);
    }

    return () => {
      observer.disconnect();
    };
  }, [pageRegistryVersion, chat.length]);

  // Page geometry is now exact and indexed. REAL <-> SPACER swaps preserve the cached page height,
  // so ordinary viewport movement must not rewrite scrollTop. Explicit post-load positioning below owns
  // the only deliberate scroll jump for history pagination.

  const getKnownPagesInOrder = useCallback(() => {
    return Array.from(pageRegistryRef.current.values())
      .filter(page => page.status !== 'never')
      .sort((a, b) => b.pageIndex - a.pageIndex);
  }, []);

  const getPageElement = useCallback((pageIndex) => {
    return document.querySelector(`[data-page-index="${pageIndex}"]`);
  }, []);

  // Evaluate the real physical scroll bottom. The bottom-tail spacer is part of the normal chat DOM,
  // while the footer contributes its own trailing geometry. Do not impose a second logical clamp here:
  // doing so causes the browser to fight the scroll handler and produces the limited-span jitter seen
  // during manual downward scrolling.
  const checkIsAtBottom = useCallback(() => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    const distanceFromBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
    let atBottom = distanceFromBottom <= SCROLL_EPSILON

    // Active streaming: verify if generated text hasn't overflowed viewport bottom
    if (!atBottom && isStreaming && lastMessageRef.current) {
      const textBottom = lastMessageRef.current.offsetTop + lastMessageRef.current.offsetHeight
      const viewportBottom = scroller.scrollTop + scroller.clientHeight
      
      // If the bottom of the last message hasn't grown past the viewport yet,
      // the user hasn't missed anything. Hide the arrow.
      if (textBottom <= viewportBottom + SCROLL_EPSILON) {
        atBottom = true
      }
    }

    // Preserve the existing post-stream UX without mutating the tail spacer merely because
    // the user reached the physical bottom. The explicit DownArrow action owns tail removal.
    if (!atBottom && !isStreaming && hasStreamedInSession && lastMessageRef.current) {
      const textBottom = lastMessageRef.current.offsetTop + lastMessageRef.current.offsetHeight
      const viewportBottom = scroller.scrollTop + scroller.clientHeight
      
      if (textBottom <= viewportBottom + SCROLL_EPSILON) {
        atBottom = true
      }
    }

    setIsAtBottom(atBottom)
  }, [isStreaming, hasStreamedInSession])

  // A spacer occupies exactly the measured height of its page. A real page has the same
  // indexed slot, so replacing REAL <-> SPACER never introduces unknown geometry.

  // Keep only pages intersecting the viewport (plus a small adjacent buffer) hydrated.
  // This never creates geometry for a NEVER page; it only swaps REAL and SPACER states.
  const reconcileKnownPageResidency = useCallback(() => {
    const scroller = nativeScrollerRef.current;
    if (!scroller || pageLoadInProgressRef.current || !isChatDataReady) return;

    const viewportTop = scroller.scrollTop - PAGE_HYDRATION_MARGIN_PX;
    const viewportBottom = scroller.scrollTop + scroller.clientHeight + PAGE_HYDRATION_MARGIN_PX;

    let changed = false;
    for (const page of getKnownPagesInOrder()) {
      if (!page.height) continue;
      const el = getPageElement(page.pageIndex);
      if (!el) continue;

      const pageTop = el.offsetTop;
      const pageBottom = pageTop + page.height;
      const keepLiveTailReal = page.pageIndex === 0 && (isStreaming || spacerHeight > 0 || hasStreamedInSession);
      const shouldBeReal = keepLiveTailReal || (pageBottom >= viewportTop && pageTop <= viewportBottom);

      if (shouldBeReal && page.status === 'spacer') {
        page.status = 'loaded';
        changed = true;
      } else if (!shouldBeReal && page.status === 'loaded') {
        page.status = 'spacer';
        changed = true;
      }
    }

    if (changed) {
      setPageRegistryVersion(v => v + 1);
    }
  }, [getKnownPagesInOrder, getPageElement, isStreaming, spacerHeight, hasStreamedInSession, isChatDataReady]);

  // Load exactly one immediately older page when the physical top of the known range is reached.
  // No IntersectionObserver root margin is used here, so merely approaching the top cannot load N-1.
  const loadNextOlderPage = useCallback(() => {
    const scroller = nativeScrollerRef.current;
    if (!scroller || chat.length === 0 || !isChatDataReady || pageLoadInProgressRef.current || isStreaming) return;

    const knownPages = getKnownPagesInOrder();
    const oldestPage = knownPages.length > 0 ? knownPages[0] : null;
    const nextPageIndex = oldestPage ? oldestPage.pageIndex + 1 : 0;

    if (oldestPage && oldestPage.startIndex <= 0) return;

    const existing = pageRegistryRef.current.get(nextPageIndex);
    if (existing && existing.status !== 'never') return;

    const endIndex = oldestPage ? oldestPage.startIndex : chat.length;
    const startIndex = Math.max(0, endIndex - CHUNK_SIZE);
    if (startIndex >= endIndex) return;

    pageLoadInProgressRef.current = true;
    setIsPageLoading(true);
    pendingPageLoadRef.current = {
      pageIndex: nextPageIndex,
      startIndex,
      endIndex,
      anchorScrollTop: scroller.scrollTop,
    };

    pageRegistryRef.current.set(nextPageIndex, {
      pageIndex: nextPageIndex,
      startIndex,
      endIndex,
      status: 'loading',
      height: null
    });
    setPageRegistryVersion(v => v + 1);
  }, [chat.length, getKnownPagesInOrder, isChatDataReady, isStreaming]);

  // Once the newly requested page has committed as REAL content, measure its exact height and
  // preserve the user's visual anchor. The first loading commit is intentionally zero-height, so
  // scrollHeight remains unchanged while the page is being prepared; only the completed REAL page
  // contributes its exact measured height.
  useLayoutEffect(() => {
    const pending = pendingPageLoadRef.current;
    if (!pending) return;

    const page = pageRegistryRef.current.get(pending.pageIndex);
    const pageEl = getPageElement(pending.pageIndex);
    const scroller = nativeScrollerRef.current;
    if (!page || !pageEl || !scroller) return;

    // First commit: replace the zero-height LOADING slot with REAL content. React will perform
    // the next layout pass before the browser paints, so the user remains locked at scrollTop === 0.
    if (page.status === 'loading') {
      page.status = 'loaded';
      setPageRegistryVersion(v => v + 1);
      return;
    }

    if (page.status !== 'loaded' || pageEl.offsetHeight <= 0) return;

    page.height = pageEl.offsetHeight;

    // The tail spacer belongs to the chat's existing reading-position UX and is deliberately
    // independent from pagination. Loading an older page must never shrink or recalculate it.

    // The newly loaded page was inserted immediately before the previous oldest page. Preserve the
    // user's visual anchor by moving scrollTop by exactly the new page height. Because the load was
    // triggered at scrollTop === 0, this becomes scrollTop === H(newPage) > 0 by design. Therefore the
    // next older page cannot be triggered until the user actually scrolls back to the physical top.
    const desiredScrollTop = pending.anchorScrollTop + page.height;
    const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);

    isProgrammaticScrollRef.current = true;
    scroller.scrollTop = Math.min(desiredScrollTop, maxScrollTop);
    // The completed older page moves the viewport to a strictly positive position, so the next
    // exact scrollTop === 0 event is now eligible to request the following older page.
    topPaginationArmedRef.current = true;
    pendingPageLoadRef.current = null;
    pageLoadInProgressRef.current = false;
    setIsPageLoading(false);
    setPageRegistryVersion(v => v + 1);

    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
      reconcileKnownPageResidency();
      checkIsAtBottom();
    });
  }, [pageRegistryVersion, getPageElement, reconcileKnownPageResidency, checkIsAtBottom, cid]);

  // Handles scroll positioning on DownArrow click
  const scrollToBottom = () => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    // Lock scroll listener to prevent mid-flight geometry work during the explicit scroll.
    // IMPORTANT: scrolling itself must never mutate spacer heights. The bottom tail is part of
    // the existing chat layout and remains exactly as it was when the button was clicked.
    isProgrammaticScrollRef.current = true;

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
          top: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
          behavior: 'smooth'
        })
      }

      // Release lock after streaming smooth scroll finishes
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
        checkIsAtBottom();
      }, 350);
    } else {
      // Static state: scroll only to the physical DOM bottom. Do not alter the bottom-tail spacer,
      // page heights, page residency, or streaming-session state as a consequence of scrolling.
      requestAnimationFrame(() => {
        const current = nativeScrollerRef.current
        if (!current) {
          isProgrammaticScrollRef.current = false;
          return;
        }

        const maxScrollTop = Math.max(0, current.scrollHeight - current.clientHeight)
        current.scrollTo({
          top: maxScrollTop,
          behavior: 'smooth'
        })

        // Convergence check: guarantees 1-click landing after layout reflows settle without changing
        // any spacer height. A normal scroll event will reconcile known page REAL/SPACER residency.
        setTimeout(() => {
          if (nativeScrollerRef.current) {
            const latest = nativeScrollerRef.current
            latest.scrollTop = Math.max(0, latest.scrollHeight - latest.clientHeight)
            checkIsAtBottom();
          }
          // Release lock once layout settles and smooth scroll completes
          isProgrammaticScrollRef.current = false;
        }, 350);
      });
    }
  }

  // Auto-Scroll Logic handles initial positioning on chat load, switch, or branch
  // 🌟 LIGHTWEIGHT NON-BLOCKING SCROLL ENGINE
  // Uses layout-driven positioning so a chat switch cannot position the outgoing chat before the
  // incoming chat payload arrives. Initial positioning is keyed to listScrollTrigger, not cid.
  // FIXED (Bug #5): Removed checkIsAtBottom from dependency array to prevent streaming state flips from re-snapping scrollTop
  useLayoutEffect(() => {
    const request = initialPositionRequestRef.current;
    const container = nativeScrollerRef.current;
    if (chatDataSwitchPendingRef.current) return;
    if (!request || request.cid !== cid || request.trigger !== listScrollTrigger || targetMessageId || !isChatDataReady || !container) return;
    if (isStreaming || chat.length === 0) return;

    const lastEl = lastMessageRef.current;
    const spacerEl = lastSpacerRef.current;
    if (!lastEl || !spacerEl || !footerRef.current) return;
    if (lastEl.offsetHeight <= 0) {
      requestAnimationFrame(() => setPageRegistryVersion(v => v + 1));
      return;
    }

    isProgrammaticScrollRef.current = true;

    const footerHeight = footerRef.current.offsetHeight;
    const oneFifthOffset = container.clientHeight / 5;
    const targetTop = Math.max(0, lastEl.offsetTop - oneFifthOffset);
    const messageBottom = lastEl.offsetTop + lastEl.offsetHeight;
    const desiredViewportBottom = targetTop + container.clientHeight;

    // The tail spacer only fills the unread portion below the last message. If the message itself
    // already extends beyond the intended viewport bottom, no tail space is required.
    // Footer height is subtracted because the disclaimer remains a known trailing element.
    const calculatedHeight = Math.max(0, desiredViewportBottom - messageBottom - footerHeight);

    spacerEl.style.height = `${calculatedHeight}px`;
    setSpacerHeight(calculatedHeight);

    // The initial tail is sized against the real footer so that, when the last message fits before
    // the intended reading position, the physical scroll bottom lands exactly on that position.
    // No separate logical scroll clamp is installed here. For a short last message the exact tail
    // spacer makes the physical DOM bottom coincide with the intended initial reading position. For a
    // long last message the tail is zero, so normal manual scrolling can still reach the real footer.

    tailSpacerHeightRef.current = calculatedHeight;
    container.scrollTop = targetTop;
    initialPositionRequestRef.current = null;

    requestAnimationFrame(() => {
      const current = nativeScrollerRef.current;
      if (current && current === container) {
        current.scrollTop = Math.min(targetTop, Math.max(0, current.scrollHeight - current.clientHeight));
      }
      // Initial positioning itself must never arm top pagination. A later real scroll event that
      // moves inside the known range will arm it, and only a subsequent exact scrollTop === 0 event
      // will request the next older page.
      // Once initial positioning has completed, an existing positive target means the user can
      // legitimately return to the physical top and trigger one older page. When the initial target
      // is zero, keep pagination disarmed until the user first moves inside the known range.
      topPaginationArmedRef.current = targetTop > TOP_TRIGGER_PX;
      isProgrammaticScrollRef.current = false;
      checkIsAtBottom();
    });
  }, [cid, listScrollTrigger, targetMessageId, isChatDataReady, isStreaming, chat.length, pageRegistryVersion, checkIsAtBottom]);

  // One-time scroll positioning to 1/5th of the viewport height when Send / Regenerate starts
  useEffect(() => {
    // When stream transitions from false -> true
    if (isStreaming && !prevStreamingRef.current) {
      isProgrammaticScrollRef.current = true;
      let frames = 0;
      let lastMeasuredOffsetTop = -1;

      const performPositioning = () => {
        const container = nativeScrollerRef.current;
        const lastEl = lastMessageRef.current;
        const spacerEl = lastSpacerRef.current;

        if (container && lastEl && spacerEl) {
          // FIX #4: Measure actual DOM height of footer element instead of using hardcoded assumptions
          const footerHeight = footerRef.current ? footerRef.current.offsetHeight : (isArchived ? 130 : 90);
          const exactHeightRequired = (container.clientHeight * 0.8) - footerHeight;
          const calculatedHeight = Math.max(0, exactHeightRequired);
          
          spacerEl.style.height = `${calculatedHeight}px`;
          tailSpacerHeightRef.current = calculatedHeight;
          setSpacerHeight(calculatedHeight);

          const currentOffsetTop = lastEl.offsetTop;
          const oneFifthOffset = container.clientHeight / 5;
          const targetTop = Math.max(0, currentOffsetTop - oneFifthOffset);

          container.scrollTo({
            top: targetTop,
            behavior: 'smooth'
          });
          // Programmatic positioning must not arm top-edge pagination.
          topPaginationArmedRef.current = false;

          if (frames < 5 && currentOffsetTop !== lastMeasuredOffsetTop) {
            lastMeasuredOffsetTop = currentOffsetTop;
            frames++;
            requestAnimationFrame(performPositioning);
            return;
          }
        }

        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 350);
      };

      // Double RAF ensures React DOM commit and browser layout passes have completed
      requestAnimationFrame(() => {
        requestAnimationFrame(performPositioning);
      });
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, isArchived])

  // Scrolling is locked by the native scroller's overflow state while a page is loading.
  // Page pagination itself is intentionally driven by one signal only: a scroll event that reaches
  // the exact physical top after the viewport has previously moved inside the known range.

  // Track scroll state on manual scroll & manage page loading/hydration.
  // Suppress page-residency work while programmatic scrolls are active.
  // IMPORTANT: top pagination uses the exact scroll event at scrollTop === 0. There is no wheel,
  // keyboard, pointer, or near-top fallback. Post-load anchor preservation guarantees that the
  // completed page moves the viewport to a strictly positive scrollTop before another page can load.
  useEffect(() => {
    const scroller = nativeScrollerRef.current
    if (!scroller) return

    const handleScroll = () => {
      const currentScrollTop = scroller.scrollTop;

      checkIsAtBottom();

      if (!isProgrammaticScrollRef.current && !isStreaming && !pageLoadInProgressRef.current && isChatDataReady) {
        if (currentScrollTop > TOP_TRIGGER_PX) {
          // The viewport has moved inside the known range, so a later scroll event at exactly zero
          // is a genuine user traversal back to the physical top and may request the next page.
          topPaginationArmedRef.current = true;
          reconcileKnownPageResidency();
        } else if (currentScrollTop === 0 && topPaginationArmedRef.current) {
          // Exact top-edge trigger: load exactly one immediately older page. The loading lock keeps
          // scrollTop and scrollHeight stable until the page has rendered and been measured.
          topPaginationArmedRef.current = false;
          loadNextOlderPage();
        }
      }
    };

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', handleScroll)
  }, [checkIsAtBottom, isStreaming, loadNextOlderPage, reconcileKnownPageResidency, isChatDataReady, cid])

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

  const reachedPages = isChatDataReady
    ? Array.from(pageRegistryRef.current.values())
        .filter(page => page.status !== 'never')
        .sort((a, b) => b.pageIndex - a.pageIndex)
    : [];

  return (
    <div className={styles['main-chat-area']}>
      <div 
        ref={nativeScrollerRef} 
        className={styles['native-chat-scroller']} 
        style={{ overflowY: isPageLoading ? 'hidden' : 'auto' }}
      >
        {reachedPages.map((page) => {
          const endIndex = page.pageIndex === 0 ? chat.length : page.endIndex;

          if (page.status === 'spacer') {
            return (
              <div
                key={`page-spacer-${page.pageIndex}`}
                data-page-index={page.pageIndex}
                aria-hidden="true"
                style={{ height: `${page.height || 0}px`, flex: '0 0 auto' }}
              />
            );
          }

          if (page.status === 'loading') {
            // LOADING pages deliberately occupy zero DOM height. This keeps the physical scroll
            // geometry unchanged while the page is being prepared; the next layout pass promotes
            // this slot to REAL content and measures its exact height.
            return (
              <div
                key={`page-loading-${page.pageIndex}`}
                data-page-index={page.pageIndex}
                aria-hidden="true"
                style={{ height: 0, flex: '0 0 auto' }}
              />
            );
          }

          const pageMessages = chat.slice(page.startIndex, endIndex);

          return (
            <div
              key={`page-${page.pageIndex}`}
              data-page-index={page.pageIndex}
              style={{
                flex: '0 0 auto',
                minHeight: page.height ? `${page.height}px` : undefined
              }}
            >
              {pageMessages.map((item, localIndex) => {
                const absoluteIndex = page.startIndex + localIndex;
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
                  >
                    {/* Inner wrapper allows measuring actual text height independent of the bottom tail spacer */}
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
            </div>
          );
        })}

        {/* Bottom Tail Spacer for Initial Positioning / Active Streaming */}
        <div
          key={`tail-${String(cid)}-${listScrollTrigger}`}
          ref={lastSpacerRef}
          className={styles['bottom-tail-spacer']}
          style={{ height: `${isChatDataReady ? spacerHeight : 0}px`, flex: '0 0 auto' }}
          aria-hidden="true"
        />

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