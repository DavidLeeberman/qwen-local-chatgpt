import { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore } from '../store/useChatStore';

export function useDropdown() {
  const [dropdownPos, setDropdownPos] = useState({ top: 'auto', bottom: 'auto', left: '0px', maxHeight: 'none' });
  const activeMenuBtnRef = useRef(null);
  
  const openDropdownCid = useChatStore(state => state.openDropdownCid);
  const setOpenDropdownCid = useChatStore(state => state.setOpenDropdownCid);

  const updateDropdownPosition = useCallback(() => {
    if (!activeMenuBtnRef.current) return;

    const rect = activeMenuBtnRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const estimatedMenuHeight = 165; // Total height of 4 rows + paddings + borders
    const gap = 4;                   // Distance from the 3-dots button
    const windowMargin = 8;          // Keeps menu from sticking ugly against screen edge

    // 1. Check if it fits expanding downwards
    const spaceBelow = viewportHeight - rect.bottom - gap;
    if (spaceBelow >= estimatedMenuHeight) {
      setDropdownPos({
        top: `${rect.bottom + gap}px`,
        bottom: 'auto',
        left: `${rect.left}px`,
        maxHeight: 'none'
      });
    }
    // 2. If not, check if it fits expanding upwards
    else if (rect.top - gap >= estimatedMenuHeight) {
      setDropdownPos({
        top: 'auto',
        bottom: `${viewportHeight - rect.top + gap}px`,
        left: `${rect.left}px`,
        maxHeight: 'none'
      });
    } 
    // 3. Compressed state: Doesn't fit in either direction -> force down and limit height
    else {
      const computedTop = rect.bottom + gap;
      const computedMaxHeight = Math.max(60, viewportHeight - computedTop - windowMargin);
      setDropdownPos({
        top: `${computedTop}px`,
        bottom: 'auto',
        left: `${rect.left}px`,
        maxHeight: `${computedMaxHeight}px`
      });
    }
  }, []); // Empty array ensures this layout utility reference never fluctuates

  useEffect(() => {
    if (!openDropdownCid) return;
    
    const dismiss = () => setOpenDropdownCid(null);
    const handleLayout = () => updateDropdownPosition();
    const handleEscapeKey = (e) => {
      if (e.key === 'Escape') setOpenDropdownCid(null);
    };
    
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('contextmenu', dismiss); // ✅ Restored: Right-click dismiss
    document.addEventListener('keydown', handleEscapeKey);
    window.addEventListener('scroll', handleLayout, true);
    window.addEventListener('resize', handleLayout);

    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('contextmenu', dismiss);
      document.removeEventListener('keydown', handleEscapeKey);
      window.removeEventListener('scroll', handleLayout, true);
      window.removeEventListener('resize', handleLayout);
    };
  }, [openDropdownCid, setOpenDropdownCid, updateDropdownPosition]);

  return { dropdownPos, updateDropdownPosition, activeMenuBtnRef };
}