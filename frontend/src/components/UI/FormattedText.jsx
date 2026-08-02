import React from 'react';
import styles from './FormattedText.module.css';

export const TruncatedText = ({ 
  text, 
  handleMouseEnter, 
  handleMouseLeave,
  className = '' 
}) => (
  <span 
    className={`${styles.truncatedTitle} ${className}`}
    onMouseEnter={(e) => handleMouseEnter(e, text)}
    onMouseLeave={handleMouseLeave}
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