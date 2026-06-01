import { useEffect, useRef, useState, useCallback } from 'react';
import { queryClient } from '@/lib/queryClient';

interface ParticipantAvatar {
  avatarUrl: string | null;
  firstName: string | null;
  displayName: string | null;
}

interface MVGUpdate {
  trip_id: string;
  seats_taken: number;
  funded_amount: number;
  funded_percent: number;
  participants: ParticipantAvatar[];
  mvg_met?: boolean;
  lifecycle_status?: 'forming' | 'confirmed' | 'cancelled';
}

interface WebSocketMessage {
  type: 'connected' | 'subscribed' | 'mvg_update' | 'pong' | 'error';
  tripId?: string;
  payload?: MVGUpdate;
  message?: string;
}

export function useRealtimeMVGUpdates(tripId: string | 'all') {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  
  const updateQueueRef = useRef<Map<string, MVGUpdate>>(new Map());
  const lastFlushTimeRef = useRef<number>(0);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const flushFrameRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    const currentState = wsRef.current?.readyState;
    if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        ws.send(JSON.stringify({
          type: 'subscribe',
          payload: { tripId }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'mvg_update':
              if (message.payload) {
                handleMVGUpdate(message.payload);
              }
              break;

            case 'subscribed':
              console.log(`[WebSocket] Subscribed to ${message.tripId}`);
              break;

            case 'connected':
              console.log('[WebSocket] Connection acknowledged');
              break;

            case 'error':
              console.error('[WebSocket] Server error:', message.message);
              break;

            default:
              console.log('[WebSocket] Unknown message type:', message.type);
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Connection error:', error);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        if (!shouldReconnectRef.current) {
          console.log('[WebSocket] Not reconnecting (component unmounted)');
          return;
        }

        if (reconnectAttemptsRef.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          
          console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
          
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      setIsConnected(false);
    }
  }, [tripId]);

  const flushUpdates = useCallback(() => {
    if (updateQueueRef.current.size === 0) return;

    const updates = Array.from(updateQueueRef.current.values());
    updateQueueRef.current.clear();

    if (tripId === 'all') {
      // Update all experience list cache keys to ensure updates reach the UI
      const cacheKeys = [
        ['/api/experiences?status=approved'],
        ['/api/experiences?includeParticipants=true'],
        ['/api/experiences']
      ];

      for (const cacheKey of cacheKeys) {
        queryClient.setQueryData(
          cacheKey,
          (oldData: any) => {
            if (!Array.isArray(oldData)) return oldData;

            let modified = oldData;
            for (const update of updates) {
              modified = modified.map(trip => {
                if (trip.id === update.trip_id) {
                  const minimumParticipants = trip.minimumParticipants || 0;
                  const fundingPercentage = Math.round(update.funded_percent);

                  return {
                    ...trip,
                    currentParticipants: update.seats_taken,
                    fundingPercentage,
                    participantsNeeded: Math.max(0, minimumParticipants - update.seats_taken),
                    participants: update.participants,
                    // Update lifecycle when MVG flips — single source of truth
                    ...(update.lifecycle_status ? { lifecycleStatus: update.lifecycle_status } : {}),
                    ...(update.mvg_met ? { mvgStatus: 'met' } : {}),
                  };
                }
                return trip;
              });
            }
            return modified;
          }
        );
      }
    } else {
      for (const update of updates) {
        queryClient.setQueryData(
          ['/api/experiences', update.trip_id],
          (oldData: any) => {
            if (!oldData) return oldData;

            return {
              ...oldData,
              currentParticipants: update.seats_taken,
              fundingPercentage: Math.round(update.funded_percent),
              participants: update.participants,
              // Update lifecycle when MVG flips — single source of truth
              ...(update.lifecycle_status ? { lifecycleStatus: update.lifecycle_status } : {}),
              ...(update.mvg_met ? { mvgStatus: 'met' } : {}),
            };
          }
        );
      }
    }

    // If any update carries a lifecycle flip, invalidate those experience queries
    // so the next render fetches the fully-enriched server response
    for (const update of updates) {
      if (update.mvg_met) {
        queryClient.invalidateQueries({ queryKey: ['/api/experiences', update.trip_id] });
        queryClient.invalidateQueries({ queryKey: ['/api/experiences'] });
      }
    }

    queryClient.invalidateQueries({ queryKey: ['/api/mvg/recently-funded'] });
    lastFlushTimeRef.current = performance.now();
  }, [tripId]);

  const scheduleFlush = useCallback(() => {
    const THROTTLE_MS = 250;
    const now = performance.now();
    const timeSinceLastFlush = now - lastFlushTimeRef.current;

    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    if (flushFrameRef.current) {
      cancelAnimationFrame(flushFrameRef.current);
      flushFrameRef.current = null;
    }

    if (timeSinceLastFlush >= THROTTLE_MS) {
      flushFrameRef.current = requestAnimationFrame(() => {
        flushUpdates();
        flushFrameRef.current = null;
      });
    } else {
      const remainingTime = THROTTLE_MS - timeSinceLastFlush;
      flushTimerRef.current = setTimeout(() => {
        flushFrameRef.current = requestAnimationFrame(() => {
          flushUpdates();
          flushFrameRef.current = null;
        });
        flushTimerRef.current = null;
      }, remainingTime);
    }
  }, [flushUpdates]);

  const handleMVGUpdate = useCallback((update: MVGUpdate) => {
    console.log('[WebSocket] MVG update received:', update);
    
    updateQueueRef.current.set(update.trip_id, update);
    scheduleFlush();
  }, [scheduleFlush]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      if (flushFrameRef.current) {
        cancelAnimationFrame(flushFrameRef.current);
        flushFrameRef.current = null;
      }

      updateQueueRef.current.clear();

      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'unsubscribe',
            payload: { tripId }
          }));
        }
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, tripId]);

  return { isConnected };
}
