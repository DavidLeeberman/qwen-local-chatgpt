import React from 'react';
import styles from './MainChatLayout.module.css';

export default function MainChatLayout({ sidebar, children }) {
  return (
    <div className={styles['main-chat-layout']}>
      {/* Left side */}
      {sidebar}
      
      {/* Right side */}
      <div className={styles['chat-column']}>
        {children}
      </div>
    </div>
  );
}