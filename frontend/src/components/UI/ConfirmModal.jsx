import React from 'react';
import styles from './ConfirmModal.module.css';

export default function ConfirmModal({ title, message, confirmText, isDanger, onConfirm, onCancel }) {
  return (
    <div 
      className={styles.overlay}
      onClick={(e) => {
        // Prevent clicks on the overlay from triggering the cancel action
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div className={styles.modal}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button 
            className={`${styles.confirmBtn} ${isDanger ? styles.danger : ''}`} 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}