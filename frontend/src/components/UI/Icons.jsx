import React from 'react';

import styles from './Icons.module.css';

export const ChatBubbleIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style} 
    width="16" height="16" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

export const PinIcon = ({ isPinned, className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${styles['pin-rotated']} ${className}`.trim()}
    style={style}
    width="14" height="14" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
  >
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76Z" />
    {isPinned && <line x1="4" y1="12" x2="20" y2="12" />}
  </svg>
);

export const DropdownChevron = ({ isOpen, className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${styles.chevron} ${isOpen ? styles.open : ''} ${className}`.trim()} 
    style={style}
    width="12" height="12" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

export const RenameIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style}
    width="14" height="14" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2"
  >
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);

export const ArchiveIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style}
    width="14" height="14" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2"
  >
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

export const UnarchiveIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style}
    width="16" height="16" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    {/* 1. Tilted Lid: 16px wide. 
           At -12 degrees, the right edge extends to exactly 20.15px, 
           giving it a perfectly realistic 0.65px overhang over the right wall. */}
    <rect x="3.5" y="7" width="16" height="4" rx="1.5" transform="rotate(-12 4.5 11)" />
    
    {/* 2. Box Base: Exactly 15px wide (X: 4.5 to 19.5). 
           This restores the perfect square-ish aspect ratio. 
           The right wall stops exactly at Y=12 to maintain the authentic gap. */}
    <path d="M 4.5 11.5 V 18 A 2 2 0 0 0 6.5 20 H 17.5 A 2 2 0 0 0 19.5 18 V 12" />
    
    {/* 3. Center Slot: 5px wide, flawlessly centered inside the 15px box. */}
    <line x1="10.5" y1="14" x2="13.5" y2="14" />
  </svg>
);

export const DeleteIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={{ ...style }}
    width="14" height="14" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const MenuDotsIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style}
    width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
  >
    <circle cx="5" cy="12" r="2"/>
    <circle cx="12" cy="12" r="2"/>
    <circle cx="19" cy="12" r="2"/>
  </svg>
);

export const SendButton = ({ disabled, onClick, className = '' }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className={`${styles['round-action-btn']} ${disabled ? styles['btn-disabled'] : styles['btn-active']} ${className}`.trim()}
    aria-label="Send message"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4l-8 8h6v8h4v-8h6z" />
    </svg>
  </button>
);

export const StopButton = ({ onClick, className = '' }) => (
  <button
    onClick={onClick}
    className={`${styles['round-action-btn']} ${styles['btn-active']} ${className}`.trim()}
    aria-label="Stop generating"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  </button>
);

export const SettingsIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style} 
    width="16" height="16" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

export const LogoutIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style} 
    width="16" height="16" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const DatabaseIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style} 
    width="16" height="16" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5V19A9 3 0 0 0 21 19V5" />
    <path d="M3 12A9 3 0 0 0 21 12" />
  </svg>
);

export const DownArrowIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style}
    width="16" height="16" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <polyline points="19 12 12 19 5 12"></polyline>
  </svg>
);

// Add BranchIcon to Icons.jsx exports
export const BranchIcon = ({ className = '', style = {} }) => (
  <svg 
    className={`${styles['base-icon']} ${className}`.trim()}
    style={style}
    width="16" height="16" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M3 12h5c3 0 4-5 7-5h3" />
    <polyline points="15 4 18 7 15 10" />
    <path d="M8 12c3 0 4 5 7 5h3" />
    <polyline points="15 14 18 17 15 20" />
  </svg>
);