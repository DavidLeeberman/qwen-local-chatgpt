import React, { useState } from 'react';

import { useChatStore } from '../../store/useChatStore';
import ArchivedChatsModal from './ArchivedChatsModal';
import ConfirmModal from '../UI/ConfirmModal';
import { SettingsIcon, DatabaseIcon } from '../UI/Icons'; // ✅ 1. Import the new icons

import styles from './SettingsModal.module.css';

export default function SettingsModal() {
  const { 
    setSettingsOpen,
    setArchivedChatsOpen, 
    archiveAllChats, 
    deleteAllChats 
  } = useChatStore();
  const isSettingsOpen = useChatStore(state => state.isSettingsOpen);
  const isArchivedChatsOpen = useChatStore(state => state.isArchivedChatsOpen);
  const [activeTab, setActiveTab] = useState('Data controls');
  const [confirmState, setConfirmState] = useState(null); // 'archive' | 'delete' | null

  if (!isSettingsOpen) return null;

  const tabs = [
    { id: 'General', Icon: SettingsIcon },
    { id: 'Data controls', Icon: DatabaseIcon }
  ];

  const handleConfirm = () => {
    if (confirmState === 'archive') archiveAllChats();
    if (confirmState === 'delete') deleteAllChats();
    setConfirmState(null);
  };

  return (
    <div 
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setSettingsOpen(false);
        }
      }}
    >
      <div className={styles.modal}>
        <button className={styles.closeBtn} onClick={() => setSettingsOpen(false)}>×</button>
        
        <div className={styles.container}>
          {/* Left Panel */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarTitle}>Settings</div>
            {tabs.map(tab => {
              const TabIcon = tab.Icon;
              return (
              <button 
                key={tab.id}
                className={`${styles.tabBtn} ${activeTab === tab.id ? styles.activeTab : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                  {/* ✅ 3. Render the dynamic icon component */}
                  <span className={styles.tabIcon}>
                    <TabIcon />
                  </span>
                {tab.id}
              </button>
              );
            })}
          </div>

          {/* Right Panel */}
          <div className={styles.content}>
            <div className={styles.contentHeader}>{activeTab}</div>
            
            {activeTab === 'Data controls' && (
              <div className={styles.controlsList}>
                <div className={styles.controlRow}>
                  <div className={styles.controlText}>Archived chats</div>
                  <button className={styles.actionBtn} onClick={() => setArchivedChatsOpen(true)}>Manage</button>
                </div>
                
                <div className={styles.controlRow}>
                  <div className={styles.controlText}>Archive all chats</div>
                  <button className={styles.actionBtn} onClick={() => setConfirmState('archive')}>Archive all</button>
                </div>

                <div className={styles.controlRow}>
                  <div className={styles.controlText}>Delete all chats</div>
                  <button className={`${styles.actionBtn} ${styles.dangerBtn}`} onClick={() => setConfirmState('delete')}>Delete all</button>
                </div>
              </div>
            )}
            
            {activeTab === 'General' && (
              <div className={styles.placeholder}>General settings options go here.</div>
            )}
          </div>
        </div>
      </div>

      {isArchivedChatsOpen && <ArchivedChatsModal onClose={() => setArchivedChatsOpen(false)} />}
      
      {confirmState && (
        <ConfirmModal 
          title={`${confirmState === 'archive' ? 'Archive' : 'Delete'} all chats?`}
          message={`Are you sure you want to ${confirmState} all of your chats? This action cannot be undone.`}
          confirmText={confirmState === 'archive' ? 'Archive all' : 'Delete all'}
          isDanger={confirmState === 'delete'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}