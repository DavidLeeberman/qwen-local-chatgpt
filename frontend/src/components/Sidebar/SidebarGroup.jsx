import React, { useState } from 'react';
import ConversationItem from './ConversationItem';
import styles from './SidebarGroup.module.css'; // 👈 Import the CSS module

export default function SidebarGroup({ 
  title, 
  chats, 
  dropdownPos, 
  updateDropdownPosition, 
  handleTitleMouseEnter, 
  handleTitleMouseLeave, 
  activeMenuBtnRef 
}) {
  const [isOpen, setIsOpen] = useState(true);

  if (!chats || chats.length === 0) return null;

  return (
    <div className={styles['sidebar-group']}>
      <div 
        className={styles['sidebar-group-header']} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{title}</span>
        <svg 
          className={`${styles.chevron} ${isOpen ? styles.open : ''}`} 
          width="12" 
          height="12" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      
      {isOpen && chats.map(c => (
        <ConversationItem
          key={c.id}
          c={c}
          dropdownPos={dropdownPos}
          updateDropdownPosition={updateDropdownPosition}
          handleTitleMouseEnter={handleTitleMouseEnter}
          handleTitleMouseLeave={handleTitleMouseLeave}
          activeMenuBtnRef={activeMenuBtnRef}
        />
      ))}
    </div>
  );
}