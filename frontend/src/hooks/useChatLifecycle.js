import { useEffect } from 'react';
import { useChatStore, getActiveStreamingState } from '../store/useChatStore';
import { API_URL } from '../utils/constants';

export function useChatLifecycle() {
  const token = useChatStore(state => state.token);
  const fetchConversations = useChatStore(state => state.fetchConversations);
  const cleanupStream = useChatStore(state => state.cleanupStream);

  // 1. Initial Conversation Fetch
  useEffect(() => {
    if (!token) return;
    
    const controller = new AbortController();
    fetchConversations(controller.signal);
    
    return () => controller.abort();
  }, [token, fetchConversations]);

  // 2. Global Stream Cleanup & Beacon
  // ✅ Unified Lifecycle Handler: Binds once on mount, handles tab closures & component unmounting cleanly
  useEffect(() => {
    const handleBeforeUnload = () => {
      const { isStreaming: streaming, cid, token: t } = getActiveStreamingState();
      
      // If a stream is active when the browser tab closes/refreshes, fire the keepalive beacon
      if (streaming && cid && t) {
        fetch(
          `${API_URL}/api/chat/stop`, 
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              Authorization: t 
            },
            body: JSON.stringify({ conversation_id: cid }),
            keepalive: true
          }
        ).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanupStream(); // Store cleans up its own timers/fetches
    };
  }, [cleanupStream]);
}