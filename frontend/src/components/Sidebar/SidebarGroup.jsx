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

  // SORTING LOGIC: Create a new array and sort by the most recent timestamp
  const sortedChats = [...chats].sort((a, b) => {
    // Uses 'updated_at' first, falls back to 'created_at', or 0 if neither exists
    // (Adjust these property names if your database uses different keys like 'updatedAt')
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    
    return timeB - timeA; // Descending order pushes the newest to the top
  });

  return (
    <div className={styles['sidebar-group']}>
      <div 
        className={styles['sidebar-group-header']} 
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{title}</span>
        <DropdownChevron isOpen={isOpen} />
      </div>
      
      {/* Map over the newly sorted array instead of the raw chats prop */}
      {isOpen && sortedChats.map(c => (
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