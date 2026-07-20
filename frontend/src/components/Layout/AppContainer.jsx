import React from 'react'
import styles from './AppContainer.module.css'

export default function AppContainer({ children }) {
  return (
    <div className={styles['app-container']}>
      {children}
    </div>
  )
}