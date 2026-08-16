import { useState, useRef, useCallback, useEffect } from 'react';

export function useDropdown(isOpen, onClose, { preferredDirection = 'down' } = {}) {
  const [dropdownStyle, setDropdownStyle] = useState({ 
    top: 'auto', bottom: 'auto', left: '0px', maxHeight: 'none',
    visibility: 'hidden' 
  });
  
  const activeMenuBtnRef = useRef(null);
  const menuRef = useRef(null);

  // Safely store the latest onClose function without triggering re-renders
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const updateDropdownPosition = useCallback(() => {
    if (!activeMenuBtnRef.current || !menuRef.current) return;

    const rect = activeMenuBtnRef.current.getBoundingClientRect();
    
    menuRef.current.style.maxHeight = 'none';
    const actualMenuHeight = menuRef.current.scrollHeight; 
    
    const viewportHeight = window.innerHeight;
    const gap = 6;                   
    const windowMargin = 8;          

    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;

    const canFitDown = spaceBelow >= actualMenuHeight;
    const canFitUp = spaceAbove >= actualMenuHeight;

    let top = 'auto', bottom = 'auto', maxHeight = 'none';

    if (preferredDirection === 'up') {
      if (canFitUp) {
        bottom = `${viewportHeight - rect.top + gap}px`;
      } else if (canFitDown) {
        top = `${rect.bottom + gap}px`;
      } else { 
        bottom = `${viewportHeight - rect.top + gap}px`;
        maxHeight = `${Math.max(60, spaceAbove - windowMargin)}px`;
      }
    } else {
      if (canFitDown) {
        top = `${rect.bottom + gap}px`;
      } else if (canFitUp) {
        bottom = `${viewportHeight - rect.top + gap}px`;
      } else { 
        top = `${rect.bottom + gap}px`;
        maxHeight = `${Math.max(60, spaceBelow - windowMargin)}px`;
      }
    }

    setDropdownStyle({ visibility: 'visible', top, bottom, left: `${rect.left}px`, maxHeight });
  }, [preferredDirection]); 

  const setMenuRef = useCallback((node) => {
    menuRef.current = node;
    if (node && isOpen) {
      updateDropdownPosition();
    }
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isOpen) {
      // Prevents infinite loop by bailing out if already hidden
      setDropdownStyle(prev => prev.visibility === 'hidden' ? prev : { ...prev, visibility: 'hidden' });
      return;
    }
    
    const dismiss = () => {
      if (onCloseRef.current) onCloseRef.current();
    };

    // NEW: Smarter outside click handler
    const handleOutsideClick = (e) => {
      // 1. If clicking inside the dropdown menu itself, do nothing
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      
      // 2. If clicking the exact button that opened this menu, do nothing.
      // (Let the button's own onClick handler manage closing it)
      if (activeMenuBtnRef.current && activeMenuBtnRef.current.contains(e.target)) return;
      
      // 3. Otherwise, it's a true outside click, so close this menu
      dismiss();
    };
    
    const handleLayout = () => updateDropdownPosition();
    const handleEscapeKey = (e) => {
      if (e.key === 'Escape') dismiss();
    };
    
    // CHANGED: Pass `true` to use the Capture Phase!
    document.addEventListener('mousedown', handleOutsideClick, true);
    
    document.addEventListener('contextmenu', dismiss); 
    document.addEventListener('keydown', handleEscapeKey);
    window.addEventListener('scroll', handleLayout, true);
    window.addEventListener('resize', handleLayout);
    
    // NEW: Listen for the browser window losing focus
    window.addEventListener('blur', dismiss);

    return () => {
      // CHANGED: Ensure `true` is passed to remove the listener correctly
      document.removeEventListener('mousedown', handleOutsideClick, true);
      
      document.removeEventListener('contextmenu', dismiss);
      document.removeEventListener('keydown', handleEscapeKey);
      window.removeEventListener('scroll', handleLayout, true);
      window.removeEventListener('resize', handleLayout);
      
      // NEW: Cleanup blur listener
      window.removeEventListener('blur', dismiss);
    };
  }, [isOpen, updateDropdownPosition]); // Removed `onClose` dependency safely

  return { dropdownStyle, setMenuRef, activeMenuBtnRef, updateDropdownPosition };
}