import React from 'react';
import styles from './FormattedText.module.css';

export const TruncatedText = ({ 
  text, 
  handleMouseEnter = () => {}, 
  handleMouseLeave = () => {},
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

export const formatDate = (isoString) => {
  if (!isoString) return '';
  
  const date = new Date(isoString);
  const currentYear = new Date().getFullYear();
  
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const year = date.getFullYear();

  // Returns 'Aug 7' if current year, 'Aug 7, 2025' if not
  if (year === currentYear) {
    return `${month} ${day}`;
  } else {
    return `${month} ${day}, ${year}`;
  }
};

export const formatTime = (isoString) => {
  if (!isoString) return '';
  
  const date = new Date(isoString);
  
  // Extract just the time (e.g., "4:30 PM")
  const time = date.toLocaleString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });

  return time;
};

export const formatFullDate = (isoString) => {
  if (!isoString) return '';
  
  const date = new Date(isoString);  
  const weekday = date.toLocaleString('en-US', { weekday: 'short' });

  return `${weekday}, ${formatDate(isoString)}`;
};

export const formatTimestamp = (isoString) => {
  return (!isoString) ? '' : `${formatFullDate(isoString)} at ${formatTime(isoString)}`;
};