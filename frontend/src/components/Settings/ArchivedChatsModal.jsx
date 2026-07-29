import React from 'react';

import { useChatStore } from '../../store/useChatStore';
import { useTooltip } from '../../hooks/useTooltip';
import TruncatedTitle from '../UI/TruncatedTitle';

import { useAccountTooltip } from '../../hooks/useTooltip';
import { useActionTooltip } from '../../hooks/useTooltip';
import { AccountTooltip } from '../Tooltip/Tooltip';
import { ActionTooltip } from '../Tooltip/Tooltip';

import styles from './ArchivedChatsModal.module.css';

export default function ArchivedChatsModal({ onClose  }) {
  const { getArchivedChats, unarchiveConversation, deleteConversation, setSettingsOpen } = useChatStore();

  const { 
    accountTooltip, 
    handleAccountMouseEnter, 
    handleAccountMouseLeave, 
    hideAccountTooltip 
  } = useAccountTooltip();
  const { 
    actionTooltip, 
    handleActionMouseEnter, 
    handleActionMouseLeave, 
    hideActionTooltip 
  } = useActionTooltip();
  
  const archived = getArchivedChats();

  const handleUnarchive = async (id) => {
    await unarchiveConversation(id);
    onClose();
    setSettingsOpen(false); // Close parent modal too
  };

  return (
    <div 
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Archived chats</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <div className={styles.colName}>Name</div>
            <div className={styles.colDate}>Date created</div>
            <div className={styles.colActions}></div>
          </div>
          
          <div className={styles.tableBody}>
            {archived.length === 0 ? (
              <div className={styles.empty}>No archived chats found.</div>
            ) : (
              archived.map(chat => (
                <div key={chat.id} className={styles.row}>
                  <div className={styles.colName}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <TruncatedTitle 
                      text={chat.title || 'New Chat'} 
                      handleTitleMouseEnter={handleAccountMouseEnter}
                      handleTitleMouseLeave={handleAccountMouseLeave}
                    />
                  </div>
                  <div className={styles.colDate}>
                    {new Date(chat.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div className={styles.colActions}>
                    <button 
                      className={styles.iconBtn} 
                      onClick={() => handleUnarchive(chat.id)}
                      onMouseEnter={(e) => handleActionMouseEnter(e, 'Unarchive conversation')}
                      onMouseLeave={handleActionMouseLeave}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 10 12 7 15 10"></polyline>
                        <path d="M21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9"></path>
                        <line x1="12" y1="7" x2="12" y2="17"></line>
                      </svg>
                    </button>
                    <button 
                      className={styles.iconBtn} 
                      onClick={() => deleteConversation(chat.id)}
                      onMouseEnter={(e) => handleActionMouseEnter(e, 'Delete conversation')}
                      onMouseLeave={handleActionMouseLeave}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <AccountTooltip {...accountTooltip} />
        <ActionTooltip {...actionTooltip} />
      </div>
    </div>
  );
}