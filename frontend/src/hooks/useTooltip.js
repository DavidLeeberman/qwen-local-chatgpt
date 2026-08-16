import { useState, useRef, useEffect, useCallback } from 'react';

let globalMouseX = 0;
let globalMouseY = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', (e) => {
    globalMouseX = e.clientX;
    globalMouseY = e.clientY;
  }, { passive: true });
}

export function useTooltip() {
  const [tooltip, setTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });
  const tooltipTimeoutRef = useRef(null);

  // ✅ Feature 2: Handlers to calculate and display the Tooltip only if truncated
  const handleTitleMouseEnter = useCallback((e, text) => {
    // Clear any previous pending tooltip triggers
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
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
          const rect = rowEl.getBoundingClientRect();
          setTooltip({
            visible: true,
            text: text,
            x: rect.right + 12, // 12px padding away from the sidebar scrollbar
            y: rect.top + (rect.height / 2) // Vertically center it with the item
          });
        }
      }
    }, 400); // 400ms delay before showing tooltip
  }, []);

  const handleTitleMouseLeave = useCallback(() => {
    // Instantly cancel the activation timer if the user leaves before 400ms is up
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setTooltip({ visible: false, text: '', x: 0, y: 0 });
  }, []);

  // Ensure timer is cleaned up if the component unmounts while hovered
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  return { tooltip, handleTitleMouseEnter, handleTitleMouseLeave };
}

// ✅ NEW: A reusable Base Hook to handle truncation math and delays
function useTruncatedTooltipBase(offsetY, offsetX = 0, delay = 400) {
  const [tooltipState, setTooltipState] = useState({ visible: false, text: '', x: 0, y: 0 });
  const tooltipTimeoutRef = useRef(null);

  const handleMouseEnter = useCallback((e, text) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    const targetEl = e.currentTarget;

    tooltipTimeoutRef.current = setTimeout(() => {
      if (targetEl.scrollWidth > targetEl.clientWidth) {
        const rect = targetEl.getBoundingClientRect();
        setTooltipState({
          visible: true,
          text: text,
          x: rect.left + offsetX, 
          y: rect.top + offsetY   
        });
      }
    }, delay); 
  }, [offsetX, offsetY, delay]); 

  const handleMouseLeave = useCallback(() => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    setTooltipState({ visible: false, text: '', x: 0, y: 0 });
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    setTooltipState({ visible: false, text: '', x: 0, y: 0 });
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  return { tooltipState, handleMouseEnter, handleMouseLeave, hideTooltip };
}


// ✅ Wrap the Base Hook for the Account Menu
export function useAccountTooltip() {
  const { tooltipState, handleMouseEnter, handleMouseLeave, hideTooltip } = useTruncatedTooltipBase(-35);

  return { 
    accountTooltip: tooltipState, 
    handleAccountMouseEnter: handleMouseEnter, 
    handleAccountMouseLeave: handleMouseLeave, 
    hideAccountTooltip: hideTooltip 
  };
}

// ✅ Wrap the Base Hook for the Archived Chats Modal
export function useArchivedChatTooltip() {
  const { tooltipState, handleMouseEnter, handleMouseLeave, hideTooltip } = useTruncatedTooltipBase(25);

  return { 
    archivedChatTooltip: tooltipState, 
    handleArchivedChatMouseEnter: handleMouseEnter, 
    handleArchivedChatMouseLeave: handleMouseLeave, 
    hideArchivedChatTooltip: hideTooltip
  };
}

export function useActionTooltip() {
  const [actionTooltip, setActionTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });

  // NEW: Keep a reference to the element and data to resurrect it later
  const targetRef = useRef(null);
  const tooltipDataRef = useRef({ text: '', options: {} });

  const handleActionMouseEnter = useCallback((e, text, options = {}) => {
    const { offsetX = null, offsetY = null } = options;
    
    // Save these for hit-testing during scroll
    targetRef.current = e.currentTarget;
    tooltipDataRef.current = { text, options };

    const rect = e.currentTarget.getBoundingClientRect();

    setActionTooltip({
      visible: true,
      text: text,
      // Uses nullish coalescing so explicit 0 values aren't overwritten
      x: rect.left + (offsetX ?? rect.width / 2), // Default to center if no offsetX provided
      y: rect.top + (offsetY ?? rect.height / 2) // Default to center if no offsetY provided
    });
  }, []);

  const handleActionMouseLeave = useCallback(() => {
    targetRef.current = null; // Clear it when the mouse leaves via normal movement
    setActionTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  const hideActionTooltip = useCallback(() => {
    setActionTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    const handleInterrupt = () => {
      // If we aren't tracking a button, just ensure the tooltip is hidden
      if (!targetRef.current) {
        setActionTooltip(prev => prev.visible ? { ...prev, visible: false } : prev);
        return;
      }

      // Hit-test: check if the stationary mouse is physically over the moving button
      const rect = targetRef.current.getBoundingClientRect();
      const isStillHovering = 
        globalMouseX >= rect.left && 
        globalMouseX <= rect.right && 
        globalMouseY >= rect.top && 
        globalMouseY <= rect.bottom;

      if (isStillHovering) {
        // The button scrolled back under the cursor! Resurrect the tooltip.
        const { text, options } = tooltipDataRef.current;
        const { offsetX = null, offsetY = null } = options;
        setActionTooltip({
          visible: true,
          text: text,
          x: rect.left + (offsetX ?? rect.width / 2),
          y: rect.top + (offsetY ?? rect.height / 2)
        });
      } else {
        // The button scrolled away from the cursor. Hide the tooltip.
        setActionTooltip(prev => prev.visible ? { ...prev, visible: false } : prev);
      }
    };

    const handleBlur = () => {
      setActionTooltip(prev => ({ ...prev, visible: false }));
    };

    window.addEventListener('scroll', handleInterrupt, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('scroll', handleInterrupt, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return { 
    actionTooltip, 
    handleActionMouseEnter, 
    handleActionMouseLeave, 
    hideActionTooltip
  };
}