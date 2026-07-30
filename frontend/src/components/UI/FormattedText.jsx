import React from 'react';
import styles from './FormattedText.module.css';

export default function TruncatedTitle({ 
  text, 
  handleTitleMouseEnter, 
  handleTitleMouseLeave,
  className = '' 
}) {
  return (
    <span 
      className={`${styles.truncatedTitle} ${className}`}
      onMouseEnter={(e) => handleTitleMouseEnter(e, text)}
      onMouseLeave={handleTitleMouseLeave}
    >
      {text}
    </span>
  );
}