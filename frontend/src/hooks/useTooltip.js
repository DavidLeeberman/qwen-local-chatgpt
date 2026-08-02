import { useState, useRef, useEffect, useCallback } from 'react';

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

export function useAccountTooltip() {
  const [accountTooltip, setAccountTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });
  const tooltipTimeoutRef = useRef(null);

  const handleAccountMouseEnter = useCallback((e, text) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    const targetEl = e.currentTarget;

    tooltipTimeoutRef.current = setTimeout(() => {
      // Check if the text is actually truncated (actual width > visible width)
      if (targetEl.scrollWidth > targetEl.clientWidth) {
        const rect = targetEl.getBoundingClientRect();
        setAccountTooltip({
          visible: true,
          text: text,
          x: rect.left, 
          y: rect.top - 35 // Pop it up just above the username
        });
      }
    }, 400); // 400ms delay to prevent flashing
  }, []);

  const handleAccountMouseLeave = useCallback(() => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    setAccountTooltip({ visible: false, text: '', x: 0, y: 0 });
  }, []);

  const hideAccountTooltip = useCallback(() => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    setAccountTooltip({ visible: false, text: '', x: 0, y: 0 });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    };
  }, []);

  return { 
    accountTooltip, 
    handleAccountMouseEnter, 
    handleAccountMouseLeave, 
    hideAccountTooltip 
  };
}

export function useActionTooltip() {
  const [actionTooltip, setActionTooltip] = useState({ visible: false, text: '', x: 0, y: 0 });

  const handleActionMouseEnter = useCallback((e, text) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActionTooltip({
      visible: true,
      text: text,
      x: rect.left + rect.width / 2,
      y: rect.top - 8
    });
  }, []);

  const handleActionMouseLeave = useCallback(() => {
    setActionTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  const hideActionTooltip = useCallback(() => {
    setActionTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  return { 
    actionTooltip, 
    handleActionMouseEnter, 
    handleActionMouseLeave, 
    hideActionTooltip
  };
}