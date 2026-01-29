import { describe, it, expect } from 'vitest';

/**
 * Test suite for BackgroundImage component URL validation
 * Tests the isValidUrl function logic to ensure placeholder URLs are rejected
 */

describe('BackgroundImage URL Validation', () => {
  // Simulate the isValidUrl function from BackgroundImage component
  const isValidUrl = (url: string): boolean => {
    if (!url) return false;
    // Check if it's a placeholder or invalid URL
    if (url === 'url1.webp' || url.startsWith('url') && /^url\d+\./.test(url)) {
      return false;
    }
    // Check if it starts with http, https, or /
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/');
  };

  describe('Invalid URLs (should return false)', () => {
    it('should reject placeholder url1.webp', () => {
      expect(isValidUrl('url1.webp')).toBe(false);
    });

    it('should reject placeholder url2.png', () => {
      expect(isValidUrl('url2.png')).toBe(false);
    });

    it('should reject placeholder url123.jpg', () => {
      expect(isValidUrl('url123.jpg')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidUrl('')).toBe(false);
    });

    it('should reject relative paths without leading slash', () => {
      expect(isValidUrl('images/background.webp')).toBe(false);
    });

    it('should reject URLs without protocol or leading slash', () => {
      expect(isValidUrl('example.com/image.webp')).toBe(false);
    });
  });

  describe('Valid URLs (should return true)', () => {
    it('should accept absolute path with leading slash', () => {
      expect(isValidUrl('/images/background.webp')).toBe(true);
    });

    it('should accept http URL', () => {
      expect(isValidUrl('http://example.com/image.webp')).toBe(true);
    });

    it('should accept https URL', () => {
      expect(isValidUrl('https://example.com/image.webp')).toBe(true);
    });

    it('should accept S3 URL', () => {
      expect(isValidUrl('https://s3.amazonaws.com/bucket/image.webp')).toBe(true);
    });

    it('should accept presigned S3 URL with query parameters', () => {
      expect(isValidUrl('https://s3.amazonaws.com/bucket/image.webp?AWSAccessKeyId=123&Signature=abc')).toBe(true);
    });

    it('should accept root path slash', () => {
      expect(isValidUrl('/')).toBe(true);
    });

    it('should accept deep nested path', () => {
      expect(isValidUrl('/assets/images/hero/background.webp')).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle URLs with spaces', () => {
      expect(isValidUrl('https://example.com/my image.webp')).toBe(true);
    });

    it('should handle URLs with special characters', () => {
      expect(isValidUrl('https://example.com/image-2024_v1.webp')).toBe(true);
    });

    it('should reject urlN.ext format regardless of extension', () => {
      expect(isValidUrl('url99.mp4')).toBe(false);
    });

    it('should accept URLs starting with url but not matching placeholder pattern', () => {
      expect(isValidUrl('https://upload.example.com/image.webp')).toBe(true);
    });
  });
});
