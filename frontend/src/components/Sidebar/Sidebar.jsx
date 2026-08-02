import React, { useState } from 'react';

import { useChatStore } from '../../store/useChatStore';
import { getInitials } from '../../utils/UIUtils';
import SidebarGroup from './SidebarGroup';
import UserMenu from './UserMenu';

// Import hook and tooltips
import { useAccountTooltip } from '../../hooks/useTooltip';
import { AccountTooltip } from '../Tooltip/Tooltip';

import styles from './Sidebar.module.css';

export default function Sidebar({
  pinnedChats,
  recentChats,
  dropdownPos,
  updateDropdownPosition,
  handleTitleMouseEnter,
  handleTitleMouseLeave,
  activeMenuBtnRef,
  onNewChat = () => {} // Pass down your new chat function if you have one
}) {
  const isStreaming = useChatStore(state => state.isStreaming);
  
  // Retrieve the username from your store (Make sure to set this upon Login!)
  // Using a fallback of 'test' just in case.
  const username = useChatStore(state => state.username) || 'test'; 

  // State to toggle the user popup menu
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  
  // Hook usage matching your pattern
  const { 
    accountTooltip, 
    handleAccountMouseEnter, 
    handleAccountMouseLeave, 
    hideAccountTooltip 
  } = useAccountTooltip();

  return (
    <div className={styles.sidebar}>
      
      {/* SIDEBAR HEADER / NEW CHAT BUTTON */}
      <div className={styles['sidebar-header']}>
        <button 
          className={styles['sidebar-btn']}
          onClick={() => {
            if (!isStreaming) {
              // Restored original behavior: Just clear UI, don't spam API
              useChatStore.setState({ cid: null, chat: [], err: '' });
            }
            onNewChat();
          }}
        >
          + New chat
        </button>
      </div>

      {/* SIDEBAR SCROLL AREA */}
      <div className={styles['sidebar-scroll-area']}>
        <SidebarGroup
          title="Pinned"
          chats={pinnedChats}
          dropdownPos={dropdownPos}
          updateDropdownPosition={updateDropdownPosition}
          handleTitleMouseEnter={handleTitleMouseEnter}
          handleTitleMouseLeave={handleTitleMouseLeave}
          activeMenuBtnRef={activeMenuBtnRef}
        />

        <SidebarGroup
          title="Recents"
          chats={recentChats}
          dropdownPos={dropdownPos}
          updateDropdownPosition={updateDropdownPosition}
          handleTitleMouseEnter={handleTitleMouseEnter}
          handleTitleMouseLeave={handleTitleMouseLeave}
          activeMenuBtnRef={activeMenuBtnRef}
        />
      </div>

      {/* SIDEBAR FOOTER / USER MENU */}
      <div className={styles['sidebar-footer']}>
        
        <button 
          onClick={() => {
            setIsUserMenuOpen(!isUserMenuOpen);
            hideAccountTooltip();
          }}
          className={styles['user-menu-btn']}
        >
          {/* Initials Avatar */}
          <div className={styles['user-avatar']}>
            {getInitials(username)}
          </div>

          {/* Truncated Name */}
          <div className={styles['user-name-container']}>
            <div 
              className={styles['user-name-text']}
              onMouseEnter={(e) => {
                if (!isUserMenuOpen) handleAccountMouseEnter(e, username);
              }}
              onMouseLeave={handleAccountMouseLeave}
            >
              {username}
            </div>
          </div>
        </button>

        {/* Clean spread-prop rendering matching <Tooltip {...tooltip} /> */}
        <AccountTooltip {...accountTooltip} />

        {/* Pop-up Menu */}
        {isUserMenuOpen && (
          <UserMenu onClose={() => setIsUserMenuOpen(false)} />
        )}

      </div>
      
    </div>
  );
}