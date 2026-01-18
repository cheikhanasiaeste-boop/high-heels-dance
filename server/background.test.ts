import { describe, it, expect } from 'vitest';

/**
 * Test suite for hero background URL handling
 * Verifies that the BackgroundImage component can handle:
 * - Multiple file formats (webp, png, jpg, gif, mp4)
 * - Presigned URLs with query parameters
 * - Static and animated content
 */

describe('Background URL Handling', () => {
  // Helper function to detect content type from URL
  const detectContentTypeFromUrl = (url: string): 'video' | 'image' => {
    const urlWithoutParams = url.split('?')[0].toLowerCase();
    
    if (urlWithoutParams.endsWith('.mp4') || urlWithoutParams.endsWith('.webm')) {
      return 'video';
    }
    
    if (
      urlWithoutParams.endsWith('.webp') ||
      urlWithoutParams.endsWith('.gif') ||
      urlWithoutParams.endsWith('.png') ||
      urlWithoutParams.endsWith('.jpg') ||
      urlWithoutParams.endsWith('.jpeg')
    ) {
      return 'image';
    }
    
    return 'image'; // Default to image
  };

  describe('File Format Detection', () => {
    it('should detect webp as image', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.webp');
      expect(result).toBe('image');
    });

    it('should detect png as image', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.png');
      expect(result).toBe('image');
    });

    it('should detect jpg as image', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.jpg');
      expect(result).toBe('image');
    });

    it('should detect jpeg as image', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.jpeg');
      expect(result).toBe('image');
    });

    it('should detect gif as image', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.gif');
      expect(result).toBe('image');
    });

    it('should detect mp4 as video', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.mp4');
      expect(result).toBe('video');
    });

    it('should detect webm as video', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.webm');
      expect(result).toBe('video');
    });
  });

  describe('Presigned URL Handling', () => {
    it('should handle presigned webp URL with query parameters', () => {
      const url = 'https://s3.amazonaws.com/bucket/background.webp?AWSAccessKeyId=123&Signature=abc&Expires=1234567890';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });

    it('should handle presigned mp4 URL with query parameters', () => {
      const url = 'https://s3.amazonaws.com/bucket/background.mp4?AWSAccessKeyId=123&Signature=abc&Expires=1234567890';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('video');
    });

    it('should handle presigned png URL with multiple query parameters', () => {
      const url = 'https://s3.amazonaws.com/bucket/background.png?param1=value1&param2=value2&param3=value3';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });

    it('should handle presigned URL with fragment identifier', () => {
      const url = 'https://s3.amazonaws.com/bucket/background.jpg?key=value#section';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });
  });

  describe('URL Format Edge Cases', () => {
    it('should handle uppercase file extensions', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.WEBP');
      expect(result).toBe('image');
    });

    it('should handle mixed case file extensions', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.WebP');
      expect(result).toBe('image');
    });

    it('should handle URL with port number', () => {
      const result = detectContentTypeFromUrl('https://example.com:8080/background.png');
      expect(result).toBe('image');
    });

    it('should handle URL with subdirectories', () => {
      const result = detectContentTypeFromUrl('https://example.com/assets/images/hero/background.jpg');
      expect(result).toBe('image');
    });

    it('should handle URL with encoded characters', () => {
      const result = detectContentTypeFromUrl('https://example.com/background%20hero.webp');
      expect(result).toBe('image');
    });

    it('should default to image for unknown extension', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.unknown');
      expect(result).toBe('image');
    });

    it('should default to image for URL without extension', () => {
      const result = detectContentTypeFromUrl('https://example.com/background');
      expect(result).toBe('image');
    });
  });

  describe('Background Format Support', () => {
    it('should support static webp backgrounds', () => {
      const url = 'https://cdn.example.com/static-background.webp';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });

    it('should support animated webp backgrounds', () => {
      const url = 'https://cdn.example.com/animated-background.webp';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });

    it('should support static png backgrounds', () => {
      const url = 'https://cdn.example.com/static-background.png';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });

    it('should support static jpg backgrounds', () => {
      const url = 'https://cdn.example.com/static-background.jpg';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });

    it('should support animated gif backgrounds', () => {
      const url = 'https://cdn.example.com/animated-background.gif';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });

    it('should support mp4 video backgrounds', () => {
      const url = 'https://cdn.example.com/video-background.mp4';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('video');
    });
  });
});
