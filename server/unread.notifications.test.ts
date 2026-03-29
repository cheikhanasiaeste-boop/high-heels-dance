import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Unread Message Notifications', () => {
  let sender: any;
  let recipient: any;

  beforeAll(async () => {
    // Create test users
    const timestamp = Date.now();
    sender = await db.createUserManually({
      name: 'Sender User',
      email: `sender-${timestamp}@example.com`,
      role: 'admin',
    }, 1);

    recipient = await db.createUserManually({
      name: 'Recipient User',
      email: `recipient-${timestamp}@example.com`,
      role: 'user',
    }, 1);
  });

  it('should return 0 unread count when user has no messages', async () => {
    const count = await db.getUnreadMessageCount(recipient.id);
    expect(count).toBe(0);
  });

  it('should return correct unread count when user has unread messages', async () => {
    // Send 3 messages to recipient
    await db.createMessage({
      fromUserId: sender.id,
      toUserId: recipient.id,
      subject: 'Message 1',
      body: 'First unread message',
    });

    await db.createMessage({
      fromUserId: sender.id,
      toUserId: recipient.id,
      subject: 'Message 2',
      body: 'Second unread message',
    });

    await db.createMessage({
      fromUserId: sender.id,
      toUserId: recipient.id,
      subject: 'Message 3',
      body: 'Third unread message',
    });

    const count = await db.getUnreadMessageCount(recipient.id);
    expect(count).toBe(3);
  });

  it('should decrease unread count when messages are marked as read', async () => {
    // Get user messages
    const messages = await db.getUserMessages(recipient.id);
    const unreadMessages = messages.filter((m: any) => !m.isRead);

    // Mark first message as read
    if (unreadMessages.length > 0) {
      await db.markMessageAsRead(unreadMessages[0].id, recipient.id);
    }

    const count = await db.getUnreadMessageCount(recipient.id);
    expect(count).toBe(2);
  });

  it('should not count sent messages in unread count', async () => {
    // Recipient sends a message
    await db.createMessage({
      fromUserId: recipient.id,
      toUserId: sender.id,
      subject: 'Reply',
      body: 'This is a reply',
    });

    // Recipient's unread count should still be 2 (only received unread messages)
    const count = await db.getUnreadMessageCount(recipient.id);
    expect(count).toBe(2);
  });
});
