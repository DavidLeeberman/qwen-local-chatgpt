import React from 'react';
import styles from './FormattedText.module.css';

export const TruncatedTitle = ({ 
  text, 
  handleTitleMouseEnter, 
  handleTitleMouseLeave,
  className = '' 
}) => (
  <span 
    className={`${styles.truncatedTitle} ${className}`}
    onMouseEnter={(e) => handleTitleMouseEnter(e, text)}
    onMouseLeave={handleTitleMouseLeave}
  >
    {text}
  </span>
);

export const ErrMessage = ({ 
  err, 
  className = '' 
}) => (
  <div className={`${styles.errMessage} ${className}`}>
    {err}
  </div>
);