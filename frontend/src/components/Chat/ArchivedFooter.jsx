import React from 'react';
import { useChatStore } from '../../store/useChatStore';
import { UnarchiveIcon } from '../UI/Icons';
import styles from './ArchivedFooter.module.css';

export default function ArchivedFooter() {
  const openArchivedChatId = useChatStore(state => state.openArchivedChatId);

  if (!openArchivedChatId) return null;

  const {
    setOpenArchivedChatId,
    unarchiveConversation
  } = useChatStore()

  const handleUnarchive = async (e) => {
    e.stopPropagation();
    await unarchiveConversation(openArchivedChatId);
    // Clear the archived target after unarchiving
    setOpenArchivedChatId(null);
  };

  return (
    <div className={styles['archived-footer-container']}>
      <div className={styles['archived-reminder-text']}>
        This conversation is archived. To continue, please unarchive it first.
      </div>
      <button 
        className={styles['unarchive-btn']}
        onClick={handleUnarchive}
      >
        <UnarchiveIcon className={styles['unarchive-icon']} />
        Unarchive
      </button>
    </div>
  );
}