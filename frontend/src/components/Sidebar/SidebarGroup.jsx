import React, { useState } from 'react';

import ConversationItem from './ConversationItem';
import { DropdownChevron } from '../UI/Icons';

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
        <DropdownChevron isOpen={isOpen} />
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