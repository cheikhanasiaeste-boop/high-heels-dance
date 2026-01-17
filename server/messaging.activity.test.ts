import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";

describe("Internal Messaging System", () => {
  let testUserId1: number;
  let testUserId2: number;
  let testMessageId: number;

  beforeAll(async () => {
    // Create test users with unique emails
    const timestamp = Date.now();
    const user1 = await db.createUserManually(
      { name: "Test User 1", email: `testuser1-${timestamp}@example.com`, role: "user" },
      1
    );
    const user2 = await db.createUserManually(
      { name: "Test User 2", email: `testuser2-${timestamp}@example.com`, role: "admin" },
      1
    );
    testUserId1 = user1.id;
    testUserId2 = user2.id;
  });

  it("should create a message", async () => {
    const message = await db.createMessage({
      fromUserId: testUserId2,
      toUserId: testUserId1,
      subject: "Test Message",
      body: "This is a test message from admin to user.",
    });

    expect(message).toBeDefined();
    expect(message.id).toBeGreaterThan(0);
    testMessageId = message.id;
  });

  it("should get messages for a user", async () => {
    const messages = await db.getUserMessages(testUserId1);
    
    expect(messages).toBeDefined();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
    
    const testMessage = messages.find(m => m.id === testMessageId);
    expect(testMessage).toBeDefined();
    expect(testMessage?.subject).toBe("Test Message");
    expect(testMessage?.body).toBe("This is a test message from admin to user.");
  });

  it("should get unread message count", async () => {
    const count = await db.getUnreadMessageCount(testUserId1);
    
    expect(count).toBeGreaterThan(0);
  });

  it("should mark message as read", async () => {
    const result = await db.markMessageAsRead(testMessageId, testUserId1);
    
    expect(result.success).toBe(true);
    
    const count = await db.getUnreadMessageCount(testUserId1);
    expect(count).toBe(0);
  });
});

describe("User Activity Timeline", () => {
  it("should get purchases with user and course details", async () => {
    const purchases = await db.getPurchasesWithDetails();
    
    expect(purchases).toBeDefined();
    expect(Array.isArray(purchases)).toBe(true);
    
    if (purchases.length > 0) {
      const purchase = purchases[0];
      expect(purchase).toHaveProperty('id');
      expect(purchase).toHaveProperty('userId');
      expect(purchase).toHaveProperty('courseId');
      expect(purchase).toHaveProperty('amount');
      expect(purchase).toHaveProperty('userName');
      expect(purchase).toHaveProperty('userEmail');
      expect(purchase).toHaveProperty('courseName');
      expect(purchase).toHaveProperty('createdAt');
    }
  });

  it("should get bookings with user and slot details", async () => {
    const bookings = await db.getBookingsWithDetails();
    
    expect(bookings).toBeDefined();
    expect(Array.isArray(bookings)).toBe(true);
    
    if (bookings.length > 0) {
      const booking = bookings[0];
      expect(booking).toHaveProperty('id');
      expect(booking).toHaveProperty('userId');
      expect(booking).toHaveProperty('slotId');
      expect(booking).toHaveProperty('sessionType');
      expect(booking).toHaveProperty('status');
      expect(booking).toHaveProperty('userName');
      expect(booking).toHaveProperty('userEmail');
      expect(booking).toHaveProperty('slotStartTime');
      expect(booking).toHaveProperty('slotEndTime');
      expect(booking).toHaveProperty('createdAt');
    }
  });
});
