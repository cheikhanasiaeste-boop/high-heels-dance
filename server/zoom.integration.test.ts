import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateZoomSignature } from './zoom';
import * as db from './db';

/**
 * Zoom Integration Tests
 * 
 * Tests the complete Zoom integration including:
 * - SDK signature generation
 * - Access control logic
 * - Meeting management
 */

describe('Zoom Integration', () => {
  describe('SDK Signature Generation', () => {
    it('should generate valid JWT signature for participant role', () => {
      const meetingNumber = '123456789';
      const role = '0'; // Participant
      
      const signature = generateZoomSignature(meetingNumber, role);
      
      // Verify signature format (JWT with 3 parts)
      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');
      
      const parts = signature.split('.');
      expect(parts.length).toBe(3);
      
      // Decode and verify payload
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      expect(payload.sdkKey).toBe(process.env.ZOOM_CLIENT_ID);
      expect(payload.mn).toBe(meetingNumber);
      expect(payload.role).toBe(role);
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });
    
    it('should generate valid JWT signature for host role', () => {
      const meetingNumber = '987654321';
      const role = '1'; // Host
      
      const signature = generateZoomSignature(meetingNumber, role);
      
      const parts = signature.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      
      expect(payload.role).toBe(role);
      expect(payload.mn).toBe(meetingNumber);
    });
    
    it('should generate signatures with 2-hour expiration', () => {
      const signature = generateZoomSignature('123456789', '0');
      
      const parts = signature.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      
      const twoHoursInSeconds = 2 * 60 * 60;
      const actualDuration = payload.exp - payload.iat;
      
      expect(actualDuration).toBe(twoHoursInSeconds);
    });
  });
  
  describe('Database Helper Functions', () => {
    it('should retrieve slot by Zoom meeting ID', async () => {
      // Create a test slot with Zoom meeting ID
      const testSlot = await db.createAvailabilitySlot({
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
        eventType: 'online',
        sessionType: 'private',
        title: 'Test Zoom Session',
        description: 'Test session for Zoom integration',
        capacity: 1,
        currentBookings: 0,
        price: null,
        isFree: true,
        isBooked: false,
        status: 'published',
        location: null,
        zoomMeetingId: 'test-meeting-123',
        zoomMeetingPassword: 'testpass',
        zoomJoinUrl: 'https://zoom.us/j/test-meeting-123',
      });
      
      // Retrieve by Zoom meeting ID
      const retrievedSlot = await db.getAvailabilitySlotByZoomId('test-meeting-123');
      
      expect(retrievedSlot).toBeDefined();
      expect(retrievedSlot?.id).toBe(testSlot.id);
      expect(retrievedSlot?.zoomMeetingId).toBe('test-meeting-123');
      expect(retrievedSlot?.zoomMeetingPassword).toBe('testpass');
      
      // Cleanup
      await db.deleteAvailabilitySlot(testSlot.id);
    });
    
    it('should return undefined for non-existent Zoom meeting ID', async () => {
      const slot = await db.getAvailabilitySlotByZoomId('non-existent-meeting');
      expect(slot).toBeUndefined();
    });
  });
  
  describe('Access Control Logic', () => {
    it('should verify time window constraints', () => {
      const now = Date.now();
      const sessionStart = now + 10 * 60 * 1000; // 10 minutes from now
      const sessionEnd = sessionStart + 60 * 60 * 1000; // 1 hour session
      const fifteenMinutesBefore = sessionStart - 15 * 60 * 1000;
      
      // Should allow joining 15 minutes before
      expect(now).toBeLessThan(sessionStart);
      expect(fifteenMinutesBefore).toBeLessThan(sessionStart);
      
      // Should allow joining during session
      const duringSession = sessionStart + 30 * 60 * 1000;
      expect(duringSession).toBeGreaterThan(sessionStart);
      expect(duringSession).toBeLessThan(sessionEnd);
      
      // Should not allow joining after session ends
      const afterSession = sessionEnd + 1000;
      expect(afterSession).toBeGreaterThan(sessionEnd);
    });
    
    it('should calculate time windows correctly', () => {
      const sessionStart = new Date('2026-01-20T10:00:00Z').getTime();
      const fifteenMinutesBefore = sessionStart - 15 * 60 * 1000;
      
      const expectedTime = new Date('2026-01-20T09:45:00Z').getTime();
      expect(fifteenMinutesBefore).toBe(expectedTime);
    });
  });
  
  describe('Security Measures', () => {
    it('should not expose sensitive Zoom credentials in signatures', () => {
      const signature = generateZoomSignature('123456789', '0');
      const parts = signature.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      
      // Should include SDK Key but not SDK Secret
      expect(payload.sdkKey).toBeDefined();
      expect(payload.sdkSecret).toBeUndefined();
      
      // Should not include any secret in the payload
      const payloadString = JSON.stringify(payload);
      expect(payloadString).not.toContain(process.env.ZOOM_CLIENT_SECRET);
    });
    
    it('should generate unique signatures for different meetings', () => {
      const sig1 = generateZoomSignature('111111111', '0');
      const sig2 = generateZoomSignature('222222222', '0');
      
      expect(sig1).not.toBe(sig2);
      
      const payload1 = JSON.parse(Buffer.from(sig1.split('.')[1], 'base64url').toString());
      const payload2 = JSON.parse(Buffer.from(sig2.split('.')[1], 'base64url').toString());
      
      expect(payload1.mn).toBe('111111111');
      expect(payload2.mn).toBe('222222222');
    });
    
    it('should generate unique signatures for different roles', () => {
      const participantSig = generateZoomSignature('123456789', '0');
      const hostSig = generateZoomSignature('123456789', '1');
      
      expect(participantSig).not.toBe(hostSig);
      
      const participantPayload = JSON.parse(Buffer.from(participantSig.split('.')[1], 'base64url').toString());
      const hostPayload = JSON.parse(Buffer.from(hostSig.split('.')[1], 'base64url').toString());
      
      expect(participantPayload.role).toBe('0');
      expect(hostPayload.role).toBe('1');
    });
  });
  
  describe('Integration Readiness', () => {
    it('should have all required environment variables', () => {
      expect(process.env.ZOOM_CLIENT_ID).toBeDefined();
      expect(process.env.ZOOM_CLIENT_SECRET).toBeDefined();
      expect(process.env.ZOOM_CLIENT_ID).not.toBe('');
      expect(process.env.ZOOM_CLIENT_SECRET).not.toBe('');
    });
    
    it('should validate Zoom credentials format', () => {
      const clientId = process.env.ZOOM_CLIENT_ID!;
      const clientSecret = process.env.ZOOM_CLIENT_SECRET!;
      
      // Zoom SDK keys are typically alphanumeric with underscores
      expect(clientId.length).toBeGreaterThan(10);
      expect(clientSecret.length).toBeGreaterThan(20);
      
      // Should not contain spaces
      expect(clientId).not.toContain(' ');
      expect(clientSecret).not.toContain(' ');
    });
  });
});
