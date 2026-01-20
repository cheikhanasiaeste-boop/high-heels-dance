import { describe, it, expect } from 'vitest';
import { generateMeetLink, isValidMeetLink } from './meet';

/**
 * Google Meet Integration Tests
 * 
 * Tests the Google Meet integration including:
 * - Meet link generation
 * - Link validation
 * - Format compliance
 */

describe('Google Meet Integration', () => {
  describe('Meet Link Generation', () => {
    it('should generate a valid Google Meet link', () => {
      const meetLink = generateMeetLink();
      
      // Verify format: https://meet.google.com/xxx-xxxx-xxx
      expect(meetLink).toMatch(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    });
    
    it('should generate unique links on each call', () => {
      const link1 = generateMeetLink();
      const link2 = generateMeetLink();
      const link3 = generateMeetLink();
      
      // All links should be different
      expect(link1).not.toBe(link2);
      expect(link2).not.toBe(link3);
      expect(link1).not.toBe(link3);
    });
    
    it('should generate links with correct segment lengths', () => {
      const meetLink = generateMeetLink();
      const code = meetLink.replace('https://meet.google.com/', '');
      const parts = code.split('-');
      
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(3);
      expect(parts[1]).toHaveLength(4);
      expect(parts[2]).toHaveLength(3);
    });
    
    it('should only use lowercase letters in meeting codes', () => {
      const meetLink = generateMeetLink();
      const code = meetLink.replace('https://meet.google.com/', '');
      
      // Should only contain lowercase letters and hyphens
      expect(code).toMatch(/^[a-z-]+$/);
      
      // Should not contain numbers
      expect(code).not.toMatch(/[0-9]/);
      
      // Should not contain uppercase letters
      expect(code).not.toMatch(/[A-Z]/);
    });
    
    it('should generate 100 unique links without collision', () => {
      const links = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        links.add(generateMeetLink());
      }
      
      // All 100 links should be unique
      expect(links.size).toBe(100);
    });
  });
  
  describe('Meet Link Validation', () => {
    it('should validate correct Google Meet links', () => {
      const validLinks = [
        'https://meet.google.com/abc-defg-hij',
        'https://meet.google.com/xyz-abcd-efg',
        'https://meet.google.com/aaa-bbbb-ccc',
      ];
      
      validLinks.forEach(link => {
        expect(isValidMeetLink(link)).toBe(true);
      });
    });
    
    it('should reject invalid Google Meet links', () => {
      const invalidLinks = [
        'http://meet.google.com/abc-defg-hij', // Wrong protocol
        'https://meet.google.com/abc-def-hij', // Wrong segment length
        'https://meet.google.com/ABC-DEFG-HIJ', // Uppercase letters
        'https://meet.google.com/abc-123-hij', // Contains numbers
        'https://zoom.us/j/123456789', // Wrong domain
        'https://meet.google.com/abcdefghij', // No hyphens
        'meet.google.com/abc-defg-hij', // Missing protocol
        '', // Empty string
      ];
      
      invalidLinks.forEach(link => {
        expect(isValidMeetLink(link)).toBe(false);
      });
    });
    
    it('should validate generated links', () => {
      // Generate 10 links and verify they all pass validation
      for (let i = 0; i < 10; i++) {
        const link = generateMeetLink();
        expect(isValidMeetLink(link)).toBe(true);
      }
    });
  });
  
  describe('Integration Readiness', () => {
    it('should generate links that match expected format for database storage', () => {
      const meetLink = generateMeetLink();
      
      // Verify it's a string
      expect(typeof meetLink).toBe('string');
      
      // Verify it's not too long for typical database text fields
      expect(meetLink.length).toBeLessThan(255);
      
      // Verify it starts with the correct protocol
      expect(meetLink.startsWith('https://')).toBe(true);
    });
    
    it('should generate links suitable for iframe embedding', () => {
      const meetLink = generateMeetLink();
      
      // Verify it's a valid URL
      expect(() => new URL(meetLink)).not.toThrow();
      
      // Verify it uses HTTPS (required for iframe embedding)
      const url = new URL(meetLink);
      expect(url.protocol).toBe('https:');
    });
    
    it('should generate links that are user-friendly', () => {
      const meetLink = generateMeetLink();
      
      // Should be reasonably short
      expect(meetLink.length).toBeLessThan(50);
      
      // Should be easy to read (lowercase only, no numbers)
      expect(meetLink).toBe(meetLink.toLowerCase());
      expect(meetLink).not.toMatch(/[0-9]/);
      
      // Should have consistent format
      expect(meetLink).toMatch(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    });
  });
  
  describe('Performance', () => {
    it('should generate links quickly', () => {
      const start = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        generateMeetLink();
      }
      
      const duration = Date.now() - start;
      
      // Should generate 1000 links in less than 100ms
      expect(duration).toBeLessThan(100);
    });
    
    it('should validate links quickly', () => {
      const testLinks = Array.from({ length: 1000 }, () => generateMeetLink());
      
      const start = Date.now();
      
      testLinks.forEach(link => {
        isValidMeetLink(link);
      });
      
      const duration = Date.now() - start;
      
      // Should validate 1000 links in less than 50ms
      expect(duration).toBeLessThan(50);
    });
  });
});
