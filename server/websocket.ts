import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseCookie } from 'cookie';
import { storage } from './storage';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  subscriptions: Set<string>;
  isAlive: boolean;
}

interface ParticipantAvatar {
  avatarUrl: string | null;
  firstName: string | null;
  displayName: string | null;
}

interface MVGUpdatePayload {
  trip_id: string;
  seats_taken: number;
  funded_amount: number;
  funded_percent: number;
  participants: ParticipantAvatar[];
  mvg_met?: boolean;
  lifecycle_status?: 'forming' | 'confirmed' | 'cancelled';
}

export class WebSocketManager {
  private wss: WebSocketServer;
  private clients: Set<AuthenticatedWebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (pathname !== '/ws') {
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();
  }

  private async handleConnection(ws: AuthenticatedWebSocket, req: any) {
    console.log('[WebSocket] New connection attempt');
    
    ws.subscriptions = new Set();
    ws.isAlive = true;

    try {
      const authenticated = await this.authenticateConnection(req);
      if (!authenticated.success) {
        console.log('[WebSocket] Authentication failed');
        ws.close(1008, 'Authentication required');
        return;
      }

      ws.userId = authenticated.userId;
      this.clients.add(ws);
      
      console.log(`[WebSocket] Client authenticated: ${ws.userId}`);

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('[WebSocket] Invalid message format:', error);
        }
      });

      ws.on('close', () => {
        console.log(`[WebSocket] Client disconnected: ${ws.userId}`);
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Connection error:', error);
        this.clients.delete(ws);
      });

      ws.send(JSON.stringify({
        type: 'connected',
        message: 'WebSocket connection established'
      }));
    } catch (error) {
      console.error('[WebSocket] Connection setup error:', error);
      ws.close(1011, 'Internal server error');
    }
  }

  private async authenticateConnection(req: any): Promise<{ success: boolean; userId?: string }> {
    try {
      if (process.env.NODE_ENV === 'development') {
        return { success: true, userId: '45788955' };
      }

      // Allow all connections — WebSocket is used for public real-time updates.
      // Try to identify the user from their session cookie if available.
      const cookieHeader = req.headers.cookie;
      if (cookieHeader) {
        const cookies = parseCookie(cookieHeader);
        const sessionId = cookies['connect.sid'];
        if (sessionId) {
          return { success: true, userId: 'authenticated' };
        }
      }

      // Anonymous visitors can still receive live MVG updates
      return { success: true, userId: undefined };
    } catch (error) {
      console.error('[WebSocket] Authentication error:', error);
      return { success: true, userId: undefined };
    }
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: any) {
    const { type, payload } = message;

    switch (type) {
      case 'subscribe':
        this.handleSubscribe(ws, payload);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(ws, payload);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        console.log('[WebSocket] Unknown message type:', type);
    }
  }

  private handleSubscribe(ws: AuthenticatedWebSocket, payload: any) {
    const { tripId } = payload;
    
    if (!tripId || typeof tripId !== 'string') {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid tripId'
      }));
      return;
    }

    ws.subscriptions.add(tripId);
    
    console.log(`[WebSocket] Client ${ws.userId} subscribed to ${tripId}`);
    
    ws.send(JSON.stringify({
      type: 'subscribed',
      tripId
    }));
  }

  private handleUnsubscribe(ws: AuthenticatedWebSocket, payload: any) {
    const { tripId } = payload;
    
    if (tripId) {
      ws.subscriptions.delete(tripId);
      console.log(`[WebSocket] Client ${ws.userId} unsubscribed from ${tripId}`);
    }
  }

  public broadcastMVGUpdate(update: MVGUpdatePayload) {
    const message = JSON.stringify({
      type: 'mvg_update',
      payload: update
    });

    let sentCount = 0;

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        if (client.subscriptions.has(update.trip_id) || client.subscriptions.has('all')) {
          client.send(message);
          sentCount++;
        }
      }
    });

    console.log(`[WebSocket] Broadcast MVG update for trip ${update.trip_id} to ${sentCount} clients`);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws) => {
        if (!ws.isAlive) {
          console.log(`[WebSocket] Terminating inactive client: ${ws.userId}`);
          ws.terminate();
          this.clients.delete(ws);
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  public close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.clients.forEach((client) => {
      client.close(1001, 'Server shutting down');
    });
    
    this.wss.close();
  }
}

let wsManager: WebSocketManager | null = null;

export function initializeWebSocket(server: HttpServer): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager(server);
    console.log('[WebSocket] WebSocket server initialized on /ws');
  }
  return wsManager;
}

export function getWebSocketManager(): WebSocketManager | null {
  return wsManager;
}

export function broadcastMVGUpdate(update: MVGUpdatePayload) {
  if (wsManager) {
    wsManager.broadcastMVGUpdate(update);
  } else {
    console.warn('[WebSocket] Attempted to broadcast without initialized WebSocket manager');
  }
}
