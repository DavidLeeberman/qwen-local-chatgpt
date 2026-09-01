import { useState, useEffect, useRef, useDeferredValue } from 'react';

import { useChatStore } from '../../store/useChatStore';
import { TruncatedText, formatDate } from '../UI/FormattedText';
import { ChatBubbleIcon, ArchiveIcon } from '../UI/Icons';
import { stripMarkdown } from '../../utils/searchUtils';

import styles from './SearchModal.module.css';

export default function SearchModal() {
  const [query, setQuery] = useState('');

  /* ===============================================================================================
     Non-Blocking UI Mechanics: Integrated useDeferredValue in SearchModal.jsx to isolate heavy 
     regex text processing from user keystrokes.
  =============================================================================================== */
  // DEFERRED UPDATE: Allows typing to remain instant while heavy regex happens in background
  const deferredQuery = useDeferredValue(query);
  
  const inputRef = useRef(null);
  
  const setSearchModalOpen = useChatStore(state => state.setSearchModalOpen);
  const searchChats = useChatStore(state => state.searchChats);
  const searchResults = useChatStore(state => state.searchResults);
  const isSearching = useChatStore(state => state.isSearching);
  const conversations = useChatStore(state => state.conversations);
  const loadMessages = useChatStore(state => state.loadMessages);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce search API calls using clean query text
  useEffect(() => {
    const timer = setTimeout(() => {
      const cleanQuery = stripMarkdown(query);
      if (cleanQuery.trim()) {
        searchChats(cleanQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchChats]);

  // Handle clicking outside or Esc key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setSearchModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSearchModalOpen]);

  // Derive "Recent" default view (3 opened, 7 recent) if no query
  const defaultChats = conversations
    .slice()
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 10);

  const displayResults = deferredQuery.trim() ? searchResults : defaultChats;

  const handleResultClick = (result) => {
    setSearchModalOpen(false);
    
    // Uses conversation_id and matched_message_id directly from conv_routes.py
    const cid = result.conversation_id || result.id;
    const msgId = result.matched_message_id || null;
    
    loadMessages(cid, msgId, query);
  };

  // NEW: Function to dynamically highlight the search term in snippets
  const highlightMatch = (text, searchQuery) => {
    if (!text) return '';
    
    // Convert raw Markdown and invisible formatting characters to clean text
    const cleanText = stripMarkdown(text);
    const cleanQuery = stripMarkdown(searchQuery);

    if (!cleanQuery.trim()) return cleanText;
    
    // Escape special Regex characters to prevent crashes
    const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = cleanText.split(new RegExp(`(${escapedQuery})`, 'gi'));
    
    return (
      <>
        {parts.map((part, index) =>
          part.toLowerCase() === cleanQuery.toLowerCase() ? (
            <span key={index} className={styles.highlight}>{part}</span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className={styles.overlay} onClick={() => setSearchModalOpen(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        
        {/* Header / Input */}
        <div className={styles.header}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className={styles.closeBtn} onClick={() => setSearchModalOpen(false)}>✕</button>
        </div>

        {/* Filters (Visual only for now per requirement) */}
        {query.trim() && (
          <div className={styles.filters}>
            <span className={`${styles.filterTag} ${styles.activeTag}`}>Chats</span>
          </div>
        )}

        {/* Results List */}
        <div className={styles.resultsList}>
          {!query.trim() && <div className={styles.sectionTitle}>Recent chats</div>}
          
          {isSearching ? (
            <div className={styles.loading}>Searching...</div>
          ) : (
            displayResults.map((result) => (
              <button 
                key={result.conversation_id || result.id} 
                className={styles.resultItem}
                onClick={() => handleResultClick(result)}
              >
                <div className={styles.iconWrapper}>
                  {result.is_archived ? <ArchiveIcon /> : <ChatBubbleIcon />}
                </div>
                
                <div className={styles.contentWrapper}>
                  <TruncatedText
                    text={highlightMatch(result.title, deferredQuery)}
                    className={styles.title}
                  />
                  {result.snippet && deferredQuery.trim() && (
                    <TruncatedText
                      text={highlightMatch(result.snippet, deferredQuery)}
                      className={styles.snippet}
                    />
                  )}
                </div>

                <div className={styles.dateWrapper}>
                  {formatDate(result.updated_at)}
                </div>
              </button>
            ))
          )}

          {deferredQuery.trim() && !isSearching && displayResults.length === 0 && (
            <div className={styles.noResults}>No results found for "{deferredQuery}"</div>
          )}
        </div>
      </div>
    </div>
  );
}