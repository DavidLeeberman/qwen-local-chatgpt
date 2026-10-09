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
const VIEWPORT_TOP_OFFSET_DIVISOR = 5;

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
  const [pageRegistryVersion, setPageRegistryVersion] = useState(0)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [isChatDataReady, setIsChatDataReady] = useState(cid === null)

  const nativeScrollerRef = useRef(null)
  const lastMessageRef = useRef(null)
  // This ref points to the outer wrapper of the active last message pair. Its min-height
  // carries the tail reservation during initial positioning and active streaming.
  const lastMessagePairRef = useRef(null) 
  const footerRef = useRef(null) // Added ref to measure exact footer DOM height

  // Stores the baseline required pair min-height established upon initial positioning.
  const initialPairMinHeightRef = useRef(null)

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
  // Once streaming stops, freeze the exact remaining tail gap for this tail-message lifecycle.
  // A new tail generation or chat/session invalidation resets this guard.
  const tailGapSealedRef = useRef(false)
  // Arm top-edge pagination only after the viewport has first moved inside the known range.
  // This prevents initial positioning from being mistaken for a user reaching the physical top.
  const topPaginationArmedRef = useRef(false)
  // Physical Anchor & Height Measurement Tracking using offsetTop
  const resizeObserverRef = useRef(null)

  // Temporary scroll-range guard used only during Regenerate/Edit replacement. It keeps the
  // pre-replacement scrollTop reachable while v20's clean baseline tail geometry is installed.
  // The guard lives after the footer and is removed as soon as the current scrollTop is within
  // the final geometry's valid range, so it never becomes persistent chat geometry.
  const regenerateScrollGuardRef = useRef(null)
  const regenerateScrollGuardRafRef = useRef(null)

  // Directly calculates baseline pair min-height based on current scroller and footer geometry
  const getBaselinePairHeight = useCallback(() => {
    const container = nativeScrollerRef.current;
    const footerEl = footerRef.current;
    if (!container || !footerEl) return 0;

    const topOffset = container.clientHeight / VIEWPORT_TOP_OFFSET_DIVISOR;
    return Math.max(0, container.clientHeight - topOffset - footerEl.offsetHeight);
  }, []);

  /* ===============================================================================================
     Callback Reference Stability: Wrapped handlers like handleRegenerate in useCallback within 
     ChatArea.jsx to prevent parent state updates from invalidating child memoization.
  =============================================================================================== */

  // Remove the temporary Regenerate-only scroll-range guard without touching any page or tail geometry.
  const clearRegenerateScrollGuard = useCallback(() => {
    if (regenerateScrollGuardRafRef.current !== null) {
      cancelAnimationFrame(regenerateScrollGuardRafRef.current);
      regenerateScrollGuardRafRef.current = null;
    }

    const guard = regenerateScrollGuardRef.current?.el;
    if (guard?.parentNode) {
      guard.parentNode.removeChild(guard);
    }

    regenerateScrollGuardRef.current = null;
  }, []);

  // Keep the pre-Regenerate scrollTop reachable while the chat is being truncated/replaced.
  // This guard is deliberately independent from tail geometry: Regenerate may target the current
  // tail or any older message, and an older-message replacement can remove an arbitrarily large
  // amount of DOM height below the target. The guard therefore reserves a conservative amount based
  // on the current scrollTop itself rather than trying to predict which pages/messages will disappear.
  const armRegenerateScrollGuard = useCallback(() => {
    clearRegenerateScrollGuard();

    const scroller = nativeScrollerRef.current;
    if (!scroller) return;

    const currentScrollTop = Math.max(0, scroller.scrollTop);
    if (currentScrollTop <= 0) return;

    // A bottom-appended guard of currentScrollTop + 1 guarantees that the browser can still represent
    // the exact pre-Regenerate scrollTop even if every message below the regenerated one is removed.
    // This is temporary scroll-range protection only; it is never written into pageRegistryRef or
    // bottomPairMinHeight and is removed as soon as the smooth scroll reaches the final valid range.
    const requiredGuardHeight = currentScrollTop + 1;

    const guard = document.createElement('div');
    guard.setAttribute('aria-hidden', 'true');
    guard.dataset.chatRegenerateScrollGuard = 'true';
    guard.style.height = `${requiredGuardHeight}px`;
    guard.style.minHeight = `${requiredGuardHeight}px`;
    guard.style.flex = '0 0 auto';
    guard.style.pointerEvents = 'none';

    const footerEl = footerRef.current;
    if (footerEl && footerEl.parentNode === scroller) {
      scroller.insertBefore(guard, footerEl);
    } else {
      scroller.appendChild(guard);
    }
    regenerateScrollGuardRef.current = { el: guard };
  }, [clearRegenerateScrollGuard]);

  // STABILIZED CALLBACK: Prevents breaking React.memo on ChatMessage
  const handleRegenerate = useCallback((messageId) => {
    // Keep the pre-replacement scroll range intact while the replacement DOM/layout is being installed.
    // The guard is message-position agnostic, so Regenerate works the same way for the current tail
    // and for an older message whose following history is truncated away.
    armRegenerateScrollGuard();
    pendingTailReplacementRef.current = true;
    regenerate(messageId);
  }, [armRegenerateScrollGuard, regenerate]);

  // Always clean up the transient guard when this component unmounts.
  useEffect(() => {
    return () => {
      clearRegenerateScrollGuard();
    };
  }, [clearRegenerateScrollGuard]);

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
      height: null,
      // Page 0 height is valid only for the canonical tail message that was present when it was measured.
      // Older pages never use this owner marker because their cached heights are historical geometry.
      heightOwnerId: null,
      // Page 0's active last-message pair carries the bottom-tail reservation inside its own wrapper.
      // Older pages keep this null because they never own the live chat tail.
      bottomPairMinHeight: null
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
        height: null,
        // Page 0 height is invalidated whenever the canonical last message changes, so it cannot become
        // a stale floor during Send / Regenerate / Edit -> regenerate transitions.
        heightOwnerId: null,
        // The active bottom pair receives its exact min-height only after the DOM is measured.
        bottomPairMinHeight: null
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
  // preserving the fixed index ranges of every older page that has already been reached. Page 0's
  // measured height remains valid only for the current canonical last message.
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
    tailOwnerIdRef.current = null;
    previousTailIdentityRef.current = null;
    initialPairMinHeightRef.current = null;
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
  }, [cid, chat.length, listScrollTrigger]);

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
      tailSpacerHeightRef.current = 0;
      initialPairMinHeightRef.current = null;
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
    initialPairMinHeightRef.current = null;
    const freshTailPage = pageRegistryRef.current.get(0);
    if (freshTailPage) freshTailPage.bottomPairMinHeight = null;
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
              if (pageIndex === 0) {
                const currentTailId = tailOwnerIdRef.current;
                if (page.heightOwnerId !== currentTailId) {
                  page.heightOwnerId = currentTailId;
                  updated = true;
                }
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
        if (page.pageIndex === 0) {
          const currentTailId = tailOwnerIdRef.current;
          if (page.heightOwnerId !== currentTailId) {
            page.heightOwnerId = currentTailId;
            hasNewMeasurements = true;
          }
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
      const keepLiveTailReal = page.pageIndex === 0 && (
        isStreaming ||
        tailSpacerHeightRef.current > 0 ||
        hasStreamedInSession
      );
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
  }, [getKnownPagesInOrder, getPageElement, isStreaming, hasStreamedInSession, isChatDataReady]);

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
      height: null,
      heightOwnerId: null
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

    if (page.pageIndex === 0) {
      page.heightOwnerId = tailOwnerIdRef.current;
    }

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

  // Shared last/newly-sent pair positioning & tail-spacer geometry.
  // Both initial chat entry and Send / Regenerate use the exact same calculation. The active bottom
  // pair itself owns the reserved tail through a fixed min-height, which means streaming growth fills
  // that reserved area without changing scrollHeight or scrollTop until the content reaches the bottom.
  // Ordinary scrolling never recalculates or mutates this reservation.
  const positionLastMessagePair = useCallback(({ behavior = 'auto', scroll = true, armTopPagination = false } = {}) => {
    const container = nativeScrollerRef.current;
    const lastEl = lastMessageRef.current;
    const pairEl = lastMessagePairRef.current;
    const tailPage = pageRegistryRef.current.get(0);

    if (!container || !lastEl || !pairEl || !tailPage || lastEl.offsetHeight <= 0) return null;

    const topOffset = container.clientHeight / VIEWPORT_TOP_OFFSET_DIVISOR;
    const pairTop = pairEl.offsetTop;
    const targetTop = Math.max(0, pairTop - topOffset);

    // Baseline required height to position the pair 1/5th from top and land viewport bottom at chat bottom.
    const baselinePairHeight = getBaselinePairHeight();
    initialPairMinHeightRef.current = baselinePairHeight;

    // The active pair's wrapper spans from its top to the footer. Reserve exactly enough total pair
    // height so that, after positioning the pair 1/5 viewport-height from the top, the physical bottom
    // of the chat lands at the viewport bottom. If the actual message is taller, the reservation becomes
    // irrelevant and the effective tail is naturally zero.
    const requiredPairHeight = Math.max(lastEl.offsetHeight, baselinePairHeight);
    const calculatedHeight = Math.max(0, requiredPairHeight - lastEl.offsetHeight);

    // Persist the reservation on page 0 so a REAL <-> SPACER swap cannot forget the bottom-pair geometry.
    // The DOM wrapper also receives it immediately, avoiding a separate global tail spacer that could
    // retain geometry from the previous last message when a new prompt is appended.
    tailPage.bottomPairMinHeight = requiredPairHeight;
    pairEl.style.minHeight = `${requiredPairHeight}px`;
    tailSpacerHeightRef.current = calculatedHeight;

    // The actual tail geometry is owned by pairEl's min-height. The ref records the current remaining
    // tail for page-residency decisions; scrolling never changes this reservation.

    if (scroll) {
      if (behavior === 'auto') {
        container.scrollTop = targetTop;
      } else {
        container.scrollTo({ top: targetTop, behavior });

        // If Regenerate started from a scrollTop that v20's new baseline could not initially
        // contain, the temporary guard keeps that old position reachable. As soon as the smooth
        // scroll enters the final geometry's valid range, remove the guard. This gives v17's
        // smooth motion in both directions without retaining any extra scrollHeight afterward.
        if (regenerateScrollGuardRef.current?.el) {
          const startedAt = performance.now();

          const releaseGuardWhenSafe = () => {
            const current = nativeScrollerRef.current;
            const guard = regenerateScrollGuardRef.current?.el;

            if (!current || !guard || !guard.parentNode) {
              regenerateScrollGuardRafRef.current = null;
              return;
            }

            const guardHeight = guard.offsetHeight;
            const maxWithoutGuard = Math.max(
              0,
              current.scrollHeight - guardHeight - current.clientHeight
            );

            if (
              current.scrollTop <= maxWithoutGuard + SCROLL_EPSILON ||
              Math.abs(current.scrollTop - targetTop) <= SCROLL_EPSILON ||
              performance.now() - startedAt > 1200
            ) {
              clearRegenerateScrollGuard();
              return;
            }

            regenerateScrollGuardRafRef.current = requestAnimationFrame(releaseGuardWhenSafe);
          };

          if (regenerateScrollGuardRafRef.current !== null) {
            cancelAnimationFrame(regenerateScrollGuardRafRef.current);
          }
          regenerateScrollGuardRafRef.current = requestAnimationFrame(releaseGuardWhenSafe);
        }
      }
    }

    if (armTopPagination) {
      // Initial positioning itself must never arm top pagination. A later real scroll event that
      // moves inside the known range will arm it, and only a subsequent exact scrollTop === 0 event
      // will request the next older page.
      topPaginationArmedRef.current = targetTop > TOP_TRIGGER_PX;
    } else {
      // Programmatic positioning for Send / Regenerate must not arm top-edge pagination.
      topPaginationArmedRef.current = false;
    }

    return {
      targetTop,
      calculatedHeight,
      messageHeight: lastEl.offsetHeight,
      messageTop: lastEl.offsetTop,
      pairMinHeight: requiredPairHeight
    };
  }, [clearRegenerateScrollGuard, getBaselinePairHeight]);

  // Invalidate page 0 whenever a genuinely new canonical tail message is generated. Page 0 is the
  // live tail page, so none of its old geometry is persistent across Send, Regenerate, Edit -> regenerate,
  // or branching. A temporary streaming message can later be replaced by its real DB-backed message
  // object during a silent reload; that is the same logical tail generation and must keep its spacer.
  // Historical pages (pageIndex > 0) retain their measured heights for REAL <-> SPACER residency.
  const lastMessage = chat.length > 0 ? chat[chat.length - 1] : null;
  const lastMessageId = lastMessage?.id != null ? String(lastMessage.id) : null;
  const lastMessageUserId = lastMessage?.userMessageId != null ? String(lastMessage.userMessageId) : null;
  const lastMessageAssistantId = lastMessage?.assistantMessageId != null ? String(lastMessage.assistantMessageId) : null;
  const tailOwnerIdRef = useRef(null);
  const previousTailIdentityRef = useRef(null);
  // True only for explicit Regenerate/Edit replacement. A normal Send must create a fresh tail lifecycle.
  const pendingTailReplacementRef = useRef(false);

  const invalidateLiveTailGeometry = useCallback(({ isTailReplacement = false } = {}) => {
    tailSpacerHeightRef.current = 0;
    tailGapSealedRef.current = false;

    const tailPage = pageRegistryRef.current.get(0);
    let registryChanged = false;
    
    // Restores to baseline pair min-height directly on Regenerate/Edit replacement, otherwise clears for new prompt
    const targetMin = isTailReplacement ? getBaselinePairHeight() : null;

    if (tailPage) {
      if (tailPage.height !== null || tailPage.heightOwnerId !== null) {
        tailPage.height = null;
        tailPage.heightOwnerId = null;
        registryChanged = true;
      }

      if (tailPage.bottomPairMinHeight !== targetMin) {
        tailPage.bottomPairMinHeight = targetMin;
        registryChanged = true;
      }

      // A changed canonical tail must be REAL while the fresh pair is positioned. Its old spacer
      // geometry is no longer valid and must not survive into the new generation.
      if (tailPage.status === 'spacer') {
        tailPage.status = 'loaded';
        registryChanged = true;
      }
    }

    if (lastMessagePairRef.current) {
      lastMessagePairRef.current.style.minHeight = targetMin != null ? `${targetMin}px` : '';
    }

    return registryChanged;
  }, [getBaselinePairHeight]);

  useLayoutEffect(() => {
    const currentIdentity = {
      id: lastMessageId,
      userMessageId: lastMessageUserId,
      assistantMessageId: lastMessageAssistantId
    };
    const previousIdentity = previousTailIdentityRef.current;
    const isTailReplacement = Boolean(previousIdentity && pendingTailReplacementRef.current);

    const sameLogicalTail = Boolean(
      !isTailReplacement &&
      previousIdentity &&
      (
        (currentIdentity.id !== null && currentIdentity.id === previousIdentity.id) ||
        (currentIdentity.userMessageId !== null && currentIdentity.userMessageId === previousIdentity.userMessageId) ||
        (currentIdentity.assistantMessageId !== null && currentIdentity.assistantMessageId === previousIdentity.assistantMessageId)
      )
    );

    if (sameLogicalTail) {
      // A silent DB sync may replace a temporary stream ID with the real database ID. That is not a
      // new tail generation, so preserve the existing bottom-tail reservation for the entire session.
      tailOwnerIdRef.current = lastMessageId;
      previousTailIdentityRef.current = currentIdentity;
      return;
    }

    // Consume the replacement marker immediately. If the next generation is a normal Send,
    // it must not inherit the previous tail reservation.
    pendingTailReplacementRef.current = false;

    tailOwnerIdRef.current = lastMessageId;
    previousTailIdentityRef.current = currentIdentity;
    const registryChanged = invalidateLiveTailGeometry({ isTailReplacement });

    // Force one clean render when old page-0 geometry existed. This removes the stale page wrapper
    // min-height before the fresh last pair is positioned, preventing the Regenerate / Edit path from
    // inheriting the height of the message that was just truncated.
    if (registryChanged) {
      setPageRegistryVersion(v => v + 1);
    }
  }, [lastMessageId, lastMessageUserId, lastMessageAssistantId, cid, invalidateLiveTailGeometry]);

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

    isProgrammaticScrollRef.current = true;
    const result = positionLastMessagePair({ behavior: 'auto', scroll: true, armTopPagination: true });

    if (!result) {
      requestAnimationFrame(() => setPageRegistryVersion(v => v + 1));
      return;
    }

    initialPositionRequestRef.current = null;

    requestAnimationFrame(() => {
      const current = nativeScrollerRef.current;
      if (current && current === container) {
        current.scrollTop = Math.min(result.targetTop, Math.max(0, current.scrollHeight - current.clientHeight));
      }
      isProgrammaticScrollRef.current = false;
      checkIsAtBottom();
    });
  }, [cid, listScrollTrigger, targetMessageId, isChatDataReady, isStreaming, chat.length, pageRegistryVersion, checkIsAtBottom, positionLastMessagePair]);

  // One-time scroll positioning to 1/5th of the viewport height when Send / Regenerate starts.
  // The exact target and tail geometry are shared with initial chat positioning above. The active pair's
  // min-height is established once after the DOM commit; streaming growth then fills that fixed reserve.
  useEffect(() => {
    // When stream transitions from false -> true
    if (isStreaming && !prevStreamingRef.current) {
      isProgrammaticScrollRef.current = true;

      // Tail geometry ownership is handled by the tail identity transition above. Do not clear the
      // active reservation here: doing so creates a one-frame scrollHeight collapse during
      // Regenerate/Edit replacement (bug #2m).

      const performPositioning = () => {
        positionLastMessagePair({ behavior: 'smooth', scroll: true, armTopPagination: false });

        setTimeout(() => {
          isProgrammaticScrollRef.current = false;
        }, 350);
      };

      // Double RAF ensures React DOM commit and browser layout passes have completed before the one
      // deliberate positioning pass. Unlike v8's repeated smooth-scroll loop, later stream growth does
      // not reissue positioning commands that could fight manual scrolling.
      requestAnimationFrame(() => {
        requestAnimationFrame(performPositioning);
      });
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, isArchived, positionLastMessagePair, invalidateLiveTailGeometry])

  // Track the remaining tail reservation as the active response grows. The DOM reservation itself is
  // the fixed min-height on the last pair, so this effect never writes spacer geometry and never moves
  // scrollTop. As long as the response remains shorter than the reservation, the pair's total height is
  // constant; once the response exceeds it, the effective tail naturally reaches zero and the page can
  // grow normally below the viewport.
  useLayoutEffect(() => {
    if (!isStreaming && tailGapSealedRef.current) return;

    const tailPage = pageRegistryRef.current.get(0);
    const pairEl = lastMessagePairRef.current;
    const messageEl = lastMessageRef.current;
    if (!tailPage || !pairEl || !messageEl || tailPage.bottomPairMinHeight == null) return;

    const remainingTail = Math.max(0, tailPage.bottomPairMinHeight - messageEl.offsetHeight);
    tailSpacerHeightRef.current = remainingTail;

    // Record the current remaining tail for page-residency decisions. During streaming this follows
    // the growing response; once streaming stops, tailGapSealedRef freezes the final value permanently.
    // The DOM reservation itself remains the fixed min-height established when this pair became the
    // active tail owner.
  }, [chat, isStreaming, isArchived, pageRegistryVersion])

  // When streaming ends, seal the exact tail gap that remains at that moment. This converts the current
  // reserved reading room into persistent tail geometry for the rest of this tail-message lifecycle.
  // The reservation is cleared only when a genuinely new tail message is generated or the chat/session
  // is invalidated; ordinary scrolling and silent temp-ID -> DB-ID synchronization leave it untouched.
  useLayoutEffect(() => {
    // prevStreamingRef is updated by the streaming transition effect below, which runs after layout
    // effects. Therefore a true -> false transition reaches this block while the previous state is
    // still available here, allowing us to capture the final gap exactly once.
    if (isStreaming || !prevStreamingRef.current || tailGapSealedRef.current || !lastMessageRef.current) return;

    const tailPage = pageRegistryRef.current.get(0);
    const pairEl = lastMessagePairRef.current;
    const messageEl = lastMessageRef.current;
    if (!tailPage || !pairEl || !messageEl || tailPage.bottomPairMinHeight == null) return;

    const retainedGap = Math.max(0, tailPage.bottomPairMinHeight - messageEl.offsetHeight);
    const persistentPairMinHeight = messageEl.offsetHeight + retainedGap;

    // Freeze the final remaining gap as the tail spacer for the entire current tail-message lifecycle.
    // Later renders, manual scrolling, and silent temp-ID -> DB-ID synchronization must not recompute
    // or remove this reservation. A genuinely new tail generation is the only normal way to clear it.
    tailPage.bottomPairMinHeight = persistentPairMinHeight;
    tailSpacerHeightRef.current = retainedGap;
    pairEl.style.minHeight = `${persistentPairMinHeight}px`;
    tailGapSealedRef.current = true;
  }, [isStreaming, chat.length, lastMessageId, lastMessageUserId, lastMessageAssistantId, pageRegistryVersion])

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
          const pageMinHeight = page.pageIndex === 0
            ? (page.bottomPairMinHeight != null && page.height ? `${page.height}px` : undefined)
            : (page.height ? `${page.height}px` : undefined);

          return (
            <div
              key={`page-${page.pageIndex}`}
              data-page-index={page.pageIndex}
              style={{
                flex: '0 0 auto',
                minHeight: pageMinHeight
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

                const pageTailMinHeight = page.pageIndex === 0 ? page.bottomPairMinHeight : null;

                return (
                  <div 
                    key={item.userMessageId || item.id}
                    id={`msg-${item.id}`}
                    ref={isLastMessage ? lastMessagePairRef : null}
                    // The active last-message wrapper carries the tail reservation itself. Previous
                    // last messages lose this role automatically when isLastMessage becomes false,
                    // preventing stale tail geometry from leaking into a newly-sent prompt.
                    style={{
                      minHeight: isLastMessage && pageTailMinHeight != null
                        ? `${pageTailMinHeight}px`
                        : undefined
                    }}
                  >
                    {/* Inner wrapper allows measuring actual text height independent of the bottom tail reservation */}
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

        {/* The bottom-tail reservation now lives inside the active last-message wrapper above. */}
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