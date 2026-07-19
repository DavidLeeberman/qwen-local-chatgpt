import React from 'react';

import { useChatStore } from '../../store/useChatStore';
import SidebarGroup from './SidebarGroup';

import styles from './Sidebar.module.css';



export default function Sidebar({
  pinnedChats,
  recentChats,
  dropdownPos,
  updateDropdownPosition,
  handleTitleMouseEnter,
  handleTitleMouseLeave,
  activeMenuBtnRef
}) {
  const isStreaming = useChatStore(state => state.isStreaming)
  const logout = useChatStore(state => state.logout)

  return (
    <div className={styles.sidebar}>
      
      {/* SIDEBAR HEADER / NEW CHAT BUTTON */}
      <div className={styles['sidebar-header']}>
        <button 
          className={styles['new-chat-btn']}
          onClick={() => {
            if (!isStreaming) {
              // Restored original behavior: Just clear UI, don't spam API
              useChatStore.setState({ cid: null, chat: [], err: '' }) 
            }
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

      <div className={styles['sidebar-header']}>
        <button 
          className={styles['logout-btn']}
          onClick={logout}
        >
          Log Out
        </button>
      </div>
    </div>
  );
}