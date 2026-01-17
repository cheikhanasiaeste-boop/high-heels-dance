import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("My Messages - Sent and Received", () => {
  let adminUserId: number;
  let regularUserId: number;
  let sentMessageId: number;
  let receivedMessageId: number;

  beforeAll(async () => {
    // Create admin user
    const admin = await db.createUserManually(
      {
        name: "Admin User",
        email: `admin-${Date.now()}@example.com`,
        role: "admin"
      },
      1 // createdBy system
    );
    adminUserId = admin.id;

    // Create regular user
    const regular = await db.createUserManually(
      {
        name: "Regular User",
        email: `regular-${Date.now()}@example.com`,
        role: "user"
      },
      1 // createdBy system
    );
    regularUserId = regular.id;

    // Admin sends message to regular user
    const sentMessage = await db.createMessage({
      fromUserId: adminUserId,
      toUserId: regularUserId,
      subject: "Test Sent Message",
      body: "This is a message sent by admin",
    });
    sentMessageId = sentMessage.id;

    // Regular user sends message to admin (admin receives it)
    const receivedMessage = await db.createMessage({
      fromUserId: regularUserId,
      toUserId: adminUserId,
      subject: "Test Received Message",
      body: "This is a message received by admin",
    });
    receivedMessageId = receivedMessage.id;
  });

  it("should return both sent and received messages for admin", async () => {
    const messages = await db.getUserMessages(adminUserId);
    
    // Admin should see both: the message they sent and the message they received
    expect(messages.length).toBeGreaterThanOrEqual(2);
    
    const sentMsg = messages.find(m => m.id === sentMessageId);
    const receivedMsg = messages.find(m => m.id === receivedMessageId);
    
    expect(sentMsg).toBeDefined();
    expect(sentMsg?.fromUserId).toBe(adminUserId);
    expect(sentMsg?.toUserId).toBe(regularUserId);
    expect(sentMsg?.subject).toBe("Test Sent Message");
    
    expect(receivedMsg).toBeDefined();
    expect(receivedMsg?.fromUserId).toBe(regularUserId);
    expect(receivedMsg?.toUserId).toBe(adminUserId);
    expect(receivedMsg?.subject).toBe("Test Received Message");
  });

  it("should return both sent and received messages for regular user", async () => {
    const messages = await db.getUserMessages(regularUserId);
    
    // Regular user should see both: the message they received and the message they sent
    expect(messages.length).toBeGreaterThanOrEqual(2);
    
    const receivedMsg = messages.find(m => m.id === sentMessageId);
    const sentMsg = messages.find(m => m.id === receivedMessageId);
    
    expect(receivedMsg).toBeDefined();
    expect(receivedMsg?.fromUserId).toBe(adminUserId);
    expect(receivedMsg?.toUserId).toBe(regularUserId);
    
    expect(sentMsg).toBeDefined();
    expect(sentMsg?.fromUserId).toBe(regularUserId);
    expect(sentMsg?.toUserId).toBe(adminUserId);
  });

  it("should order messages by creation date (newest first)", async () => {
    const messages = await db.getUserMessages(adminUserId);
    
    // Check that messages are ordered by createdAt descending
    for (let i = 0; i < messages.length - 1; i++) {
      const current = new Date(messages[i].createdAt).getTime();
      const next = new Date(messages[i + 1].createdAt).getTime();
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });
});
