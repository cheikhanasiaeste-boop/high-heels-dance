import { Request, Response } from 'express';
import { adminNotifications, AdminNotification } from './events';

// Store active SSE connections
const connections = new Set<Response>();

export function setupSSE(req: Request, res: Response) {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

  // Add this connection to the set
  connections.add(res);

  // Set up notification listener
  const notificationHandler = (notification: AdminNotification) => {
    try {
      res.write(`data: ${JSON.stringify(notification)}\n\n`);
    } catch (error) {
      console.error('Error sending SSE notification:', error);
      connections.delete(res);
    }
  };

  adminNotifications.on('notification', notificationHandler);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch (error) {
      clearInterval(heartbeat);
      connections.delete(res);
    }
  }, 30000);

  // Clean up on connection close
  req.on('close', () => {
    clearInterval(heartbeat);
    adminNotifications.off('notification', notificationHandler);
    connections.delete(res);
  });
}

// Helper to broadcast to all connections (for testing)
export function broadcastNotification(notification: AdminNotification) {
  adminNotifications.emit('notification', notification);
}
