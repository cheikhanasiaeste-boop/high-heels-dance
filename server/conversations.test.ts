import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as db from "./db";

describe("Conversation System", () => {
  let userId1: number;
  let userId2: number;

  beforeAll(async () => {
    // Create two test users
    const user1 = await db.createUserManually({
      openId: `test-conv-${Date.now()}-1`,
      name: "Test User 1",
      email: `testconv1-${Date.now()}@example.com`,
      loginMethod: "oauth",
      role: "user",
    });
    userId1 = user1.id;

    const user2 = await db.createUserManually({
      openId: `test-conv-${Date.now()}-2`,
      name: "Test User 2 (Admin)",
      email: `testconv2-${Date.now()}@example.com`,
      loginMethod: "oauth",
      role: "admin",
    });
    userId2 = user2.id;
  });

  it("should create a message between two users", async () => {
    const message = await db.createMessage({
      fromUserId: userId1,
      toUserId: userId2,
      subject: "Test Conversation",
      body: "Hello from user 1",
    });

    expect(message).toBeDefined();
    expect(message.id).toBeGreaterThan(0);
  });

  it("should get conversations grouped by sender/recipient", async () => {
    // Create multiple messages
    await db.createMessage({
      fromUserId: userId1,
      toUserId: userId2,
      subject: "Message 1",
      body: "First message",
    });

    await db.createMessage({
      fromUserId: userId2,
      toUserId: userId1,
      subject: "Re: Message 1",
      body: "Reply to first message",
    });

    // Get conversations for user 1
    const conversations = await db.getConversations(userId1);

    expect(conversations).toBeDefined();
    expect(conversations.length).toBeGreaterThan(0);

    const conv = conversations[0];
    expect(conv.otherUserId).toBe(userId2);
    expect(conv.displayName).toBe("Elizabeth"); // Admin should show as Elizabeth
    expect(conv.messages).toBeDefined();
    expect(conv.messages.length).toBeGreaterThanOrEqual(2);
  });

  it("should get full conversation thread with another user", async () => {
    // Create messages in both directions
    await db.createMessage({
      fromUserId: userId1,
      toUserId: userId2,
      subject: "Thread Test",
      body: "Message from user 1",
    });

    await db.createMessage({
      fromUserId: userId2,
      toUserId: userId1,
      subject: "Re: Thread Test",
      body: "Message from user 2",
    });

    // Get conversation thread
    const thread = await db.getConversationThread(userId1, userId2);

    expect(thread).toBeDefined();
    expect(thread.length).toBeGreaterThanOrEqual(2);

    // Verify messages are in chronological order
    for (let i = 1; i < thread.length; i++) {
      expect(new Date(thread[i].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(thread[i - 1].createdAt).getTime()
      );
    }
  });

  it("should display admin as 'Elizabeth' in conversations", async () => {
    const conversations = await db.getConversations(userId1);

    const adminConv = conversations.find((c) => c.otherUserId === userId2);
    expect(adminConv).toBeDefined();
    expect(adminConv?.displayName).toBe("Elizabeth");
  });

  it("should count unread messages correctly in conversations", async () => {
    // Create an unread message
    await db.createMessage({
      fromUserId: userId2,
      toUserId: userId1,
      subject: "Unread Test",
      body: "This message is unread",
    });

    const conversations = await db.getConversations(userId1);
    const conv = conversations[0];

    expect(conv.unreadCount).toBeGreaterThan(0);
  });

  afterAll(async () => {
    // Cleanup is handled by the test database
  });
});
