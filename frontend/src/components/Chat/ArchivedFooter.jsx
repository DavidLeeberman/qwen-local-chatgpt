import React from 'react';
import { useChatStore } from '../../store/useChatStore';
import { UnarchiveIcon } from '../UI/Icons';
import styles from './ArchivedFooter.module.css';

export default function ArchivedFooter() {
  const cid = useChatStore(state => state.cid);
  const unarchiveConversation = useChatStore(state => state.unarchiveConversation);

  if (!cid) return null;

  return (
    <div className={styles['archived-footer-container']}>
      <div className={styles['archived-reminder-text']}>
        This conversation is archived. To continue, please unarchive it first.
      </div>
      <button 
        className={styles['unarchive-btn']}
        onClick={() => unarchiveConversation(cid)}
      >
        <UnarchiveIcon className={styles['unarchive-icon']} />
        Unarchive
      </button>
    </div>
  );
}