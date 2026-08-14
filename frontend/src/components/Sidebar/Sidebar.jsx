import React, { useState } from 'react';

import { useChatStore } from '../../store/useChatStore';
import { getInitials } from '../../utils/UIUtils';
import SidebarGroup from './SidebarGroup';
import UserMenu from './UserMenu';
import { TruncatedText } from '../UI/FormattedText';
import { SearchIcon } from '../UI/Icons';

// Import hook and tooltips
import { useAccountTooltip } from '../../hooks/useTooltip';
import { CursorTooltip } from '../Tooltip/Tooltip';

import styles from './Sidebar.module.css';
import formattedTextStyles from '../UI/FormattedText.module.css';

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
        {/* NEW TOP ROW */}
        <div className={styles['sidebar-top-row']}>
          <h2 className={styles['sidebar-title']}>ChatGPT</h2>
          <button 
            className={styles['search-btn']}
            onClick={() => useChatStore.getState().setSearchModalOpen(true)}
            title="Search (Ctrl + K)" // Or hook this into your custom Tooltip system
          >
            <SearchIcon />
          </button>
        </div>

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
            <TruncatedText
              text={username}
              handleMouseEnter={(e) => {
                if (!isUserMenuOpen) handleAccountMouseEnter(e, username);
              }}
              handleMouseLeave={handleAccountMouseLeave}
              className={styles['user-name-text']}
            />
          </div>
        </button>

        {/* Clean spread-prop rendering matching <Tooltip {...tooltip} /> */}
        <CursorTooltip {...accountTooltip} />

        {/* Pop-up Menu */}
        {isUserMenuOpen && (
          <UserMenu onClose={() => setIsUserMenuOpen(false)} />
        )}

      </div>
      
    </div>
  );
}