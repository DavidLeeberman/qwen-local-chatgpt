import React from 'react';

import styles from './Icons.module.css'

export const ChatBubbleIcon = ({ className = '', style = {} }) => (
  <svg 
    className={className}
    style={{ flexShrink: 0, ...style }} 
    width="16" height="16" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

export const PinIcon = ({isPinned, className = '', style = {} }) => (
  <svg 
    className={className}
    style={{ ...style }}
    width="14" height="14" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" 
    style={{ transform: 'rotate(45deg)' }}
  >
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76Z" />
    {isPinned && <line x1="4" y1="12" x2="20" y2="12" />}
  </svg>
);

export const DropdownChevron = ({isOpen, className = '', style = {} }) => (
  <svg 
    className={`${styles.chevron} ${isOpen ? styles.open : ''} ${className}`} 
    style={{ ...style }}
    width="12" 
    height="12" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

export const RenameIcon = ({ className = '', style = {} }) => (
  <svg 
    className={className}
    style={style}
    width="14" height="14" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2"
  >
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
);

export const ArchiveIcon = ({ className = '', style = {} }) => (
  <svg 
    className={className}
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
    className={className}
    style={{ ...style }}
    width="14" height="14" viewBox="0 0 24 24" 
    fill="none" stroke="currentColor" strokeWidth="2"
  >
    <polyline points="9 10 12 7 15 10"></polyline>
    <path d="M21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9"></path>
    <line x1="12" y1="7" x2="12" y2="17"></line>
  </svg>
);

export const DeleteIcon = ({ className = '', style = {} }) => (
  <svg 
    className={className}
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
    className={className}
    style={style}
    width="14" height="14" viewBox="0 0 24 24" fill="currentColor"
  >
    <circle cx="5" cy="12" r="2"/>
    <circle cx="12" cy="12" r="2"/>
    <circle cx="19" cy="12" r="2"/>
  </svg>
);