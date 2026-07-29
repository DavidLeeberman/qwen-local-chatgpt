import React, { useRef, useEffect } from 'react';
import { useChatStore } from '../../store/useChatStore';
import styles from './Sidebar.module.css';

export default function UserMenu({ onClose }) {
  // Grab the necessary actions directly from Zustand
  const setSettingsOpen = useChatStore(state => state.setSettingsOpen);
  const logout = useChatStore(state => state.logout);
  
  const menuRef = useRef(null);

  // Close the menu if the user clicks anywhere outside of it
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    }
    
    // Bind the event listener
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div className={styles['user-dropdown-menu']} ref={menuRef}>
      
      {/* Settings Button */}
      <button 
        onClick={() => {
          setSettingsOpen(true); // Triggers the modal in App.jsx
          onClose();             // Closes this popup menu
        }}
        className={styles['user-dropdown-item']}
      >
        Settings
      </button>

      {/* Divider */}
      <div className={styles['user-dropdown-divider']}></div>

      {/* Log Out Button */}
      <button 
        onClick={() => {
          logout();  // Clears tokens/state and boots user to Login
          onClose(); 
        }}
        className={styles['user-dropdown-item']}
      >
        Log out
      </button>
      
    </div>
  );
}