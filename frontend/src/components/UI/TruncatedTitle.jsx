import React from 'react';
import styles from './TruncatedTitle.module.css';

export default function TruncatedTitle({ 
  text, 
  handleTitleMouseEnter, 
  handleTitleMouseLeave,
  className = '' 
}) {
  return (
    <span 
      className={`${styles.titleText} ${className}`}
      onMouseEnter={(e) => handleTitleMouseEnter(e, text)}
      onMouseLeave={handleTitleMouseLeave}
    >
      {text}
    </span>
  );
}