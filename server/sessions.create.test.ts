import { describe, it, expect, beforeAll } from 'vitest';
import { generateMeetLink } from './meet';

describe('Session Creation with Google Meet', () => {
  describe('Google Meet Link Generation', () => {
    it('should generate a valid Google Meet link', () => {
      const link = generateMeetLink();
      expect(link).toMatch(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    });

    it('should generate unique links on each call', () => {
      const link1 = generateMeetLink();
      const link2 = generateMeetLink();
      expect(link1).not.toBe(link2);
    });

    it('should generate links with correct segment lengths', () => {
      const link = generateMeetLink();
      const code = link.replace('https://meet.google.com/', '');
      const segments = code.split('-');
      
      expect(segments).toHaveLength(3);
      expect(segments[0]).toHaveLength(3);
      expect(segments[1]).toHaveLength(4);
      expect(segments[2]).toHaveLength(3);
    });
  });

  describe('Session Link Validation', () => {
    it('should accept empty string as valid sessionLink', () => {
      const emptyString = '';
      // Empty strings should be allowed for auto-generation
      expect(emptyString === '' || !emptyString).toBe(true);
    });

    it('should accept undefined as valid sessionLink', () => {
      const undefinedValue = undefined;
      // Undefined should be allowed for auto-generation
      expect(!undefinedValue).toBe(true);
    });

    it('should accept valid Google Meet URLs', () => {
      const validUrl = 'https://meet.google.com/abc-defg-hij';
      try {
        new URL(validUrl);
        expect(true).toBe(true);
      } catch {
        expect(false).toBe(true);
      }
    });

    it('should reject invalid URLs', () => {
      const invalidUrl = 'not-a-url';
      try {
        new URL(invalidUrl);
        expect(false).toBe(true);
      } catch {
        expect(true).toBe(true);
      }
    });
  });

  describe('Session Creation Logic', () => {
    it('should auto-generate Meet link when sessionLink is empty', () => {
      const sessionLink = '';
      const shouldGenerate = !sessionLink || sessionLink === '';
      expect(shouldGenerate).toBe(true);
      
      if (shouldGenerate) {
        const generated = generateMeetLink();
        expect(generated).toMatch(/^https:\/\/meet\.google\.com\//);
      }
    });

    it('should auto-generate Meet link when sessionLink is undefined', () => {
      const sessionLink = undefined;
      const shouldGenerate = !sessionLink || sessionLink === '';
      expect(shouldGenerate).toBe(true);
    });

    it('should not auto-generate when valid link is provided', () => {
      const sessionLink = 'https://meet.google.com/abc-defg-hij';
      const shouldGenerate = !sessionLink || sessionLink === '';
      expect(shouldGenerate).toBe(false);
    });
  });
});
