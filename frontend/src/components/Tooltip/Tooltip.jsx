import React from 'react';
import styles from './Tooltip.module.css';

export default function Tooltip({ visible, x, y, text }) {
  if (!visible) return null;

  return (
    <div 
      className={styles['custom-tooltip']}
      style={{ top: y, left: x }}
    >
      {text}
    </div>
  );
}