import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';

export interface AdminNotification {
  type: 'booking' | 'registration' | 'purchase' | 'testimonial';
  title: string;
  message: string;
  timestamp: number;
  data?: any;
}

export function useAdminNotifications(onNotification?: (notification: AdminNotification) => void) {
  const { user } = useAuth({});
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Only connect if user is admin
    if (!user || user.role !== 'admin') {
      return;
    }

    const connect = () => {
      try {
        const eventSource = new EventSource('/api/admin/notifications/stream', {
          withCredentials: true,
        });

        eventSource.onopen = () => {
          console.log('[SSE] Connected to notification stream');
          setIsConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle connection confirmation
            if (data.type === 'connected') {
              console.log('[SSE]', data.message);
              return;
            }

            // Handle notification
            if (onNotification) {
              onNotification(data as AdminNotification);
            }
          } catch (error) {
            console.error('[SSE] Failed to parse message:', error);
          }
        };

        eventSource.onerror = (error) => {
          console.error('[SSE] Connection error:', error);
          setIsConnected(false);
          eventSource.close();

          // Attempt to reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[SSE] Attempting to reconnect...');
            connect();
          }, 5000);
        };

        eventSourceRef.current = eventSource;
      } catch (error) {
        console.error('[SSE] Failed to establish connection:', error);
      }
    };

    connect();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [user, onNotification]);

  return { isConnected };
}
