import React from 'react';
import { createPortal } from 'react-dom';

import styles from './Tooltip.module.css';

// 1. Standard Tooltip (for conversation titles)
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

// 2. Account Tooltip (for the sidebar user/account button)
export function AccountTooltip({ visible, x, y, text }) {
  if (!visible) return null;

  return createPortal(
    <div 
      className={styles['cursor-tooltip-box']}
      style={{ left: x, top: y }}
    >
      {text}
    </div>,
    document.body
  );
}

// 3. Action Tooltip (for management action buttons in modals/sidebars)
export function ActionTooltip({ visible, x, y, text }) {
  if (!visible) return null;

  return createPortal(
        <div 
      className={styles['cursor-tooltip-box']}
      style={{ left: x, top: y, transform: 'translate(-50%, -100%)' }}
        >
          {text}
        </div>,
        document.body
  );
}