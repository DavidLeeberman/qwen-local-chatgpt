import React from 'react';

import { useChatStore } from '../../store/useChatStore';
import { CursorTooltip, ActionTooltip } from '../Tooltip/Tooltip';
import { useArchivedChatTooltip, useActionTooltip } from '../../hooks/useTooltip';
import { TruncatedText } from '../UI/FormattedText';
import { ChatBubbleIcon, UnarchiveIcon, DeleteIcon } from '../UI/Icons';

import styles from './ArchivedChatsModal.module.css';

export default function ArchivedChatsModal({ onClose  }) {
  const { unarchiveConversation, deleteConversation, setSettingsOpen } = useChatStore();

  const { 
    archivedChatTooltip, 
    handleArchivedChatMouseEnter, 
    handleArchivedChatMouseLeave, 
    hideArchivedChatTooltip 
  } = useArchivedChatTooltip();
  const { 
    actionTooltip, 
    handleActionMouseEnter, 
    handleActionMouseLeave, 
    hideActionTooltip 
  } = useActionTooltip();
  
  const conversations = useChatStore(state => state.conversations)
  const archived = conversations.filter(c => c.is_archived);

  const handleUnarchive = async (id) => {
    await unarchiveConversation(id);
    hideActionTooltip();
  };

  const handleDelete = async (id) => {
    await deleteConversation(id);
    hideActionTooltip();
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
                    <ChatBubbleIcon />
                    <TruncatedText 
                      text={chat.title || 'New Chat'} 
                      handleMouseEnter={handleArchivedChatMouseEnter}
                      handleMouseLeave={handleArchivedChatMouseLeave}
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
                      <UnarchiveIcon />
                    </button>
                    <button 
                      className={styles.iconBtn} 
                      onClick={() => handleDelete(chat.id)}
                      onMouseEnter={(e) => handleActionMouseEnter(e, 'Delete conversation')}
                      onMouseLeave={handleActionMouseLeave}
                    >
                      <DeleteIcon />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <CursorTooltip {...archivedChatTooltip} />
        <ActionTooltip {...actionTooltip} />
      </div>
    </div>
  );
}