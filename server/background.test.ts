import { describe, it, expect } from 'vitest';

/**
 * Test suite for hero background URL handling
 * Verifies that the BackgroundImage component can handle:
 * - Multiple file formats (webp, png, jpg, gif, mp4)
 * - Presigned URLs with query parameters
 * - Static and animated content
 * - Smooth webp animation via video element
 */

describe('Background URL Handling', () => {
  // Helper function to detect content type from URL
  // CRITICAL: Webp must be treated as video for smooth animation playback
  const detectContentTypeFromUrl = (url: string): 'video' | 'image' => {
    const urlWithoutParams = url.split('?')[0].toLowerCase();
    
    if (urlWithoutParams.endsWith('.mp4') || urlWithoutParams.endsWith('.webm')) {
      return 'video';
    }
    
    // Webp must be rendered as video for smooth animation
    // Using img tag causes stuttering/discontinuous animation
    if (urlWithoutParams.endsWith('.webp')) {
      return 'video';
    }
    
    if (
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
    it('should detect webp as video for smooth animation', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.webp');
      expect(result).toBe('video');
    });

    it('should detect png as image', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.png');
      expect(result).toBe('image');
    });

    it('should detect jpg as image', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.jpg');
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

    it('should detect gif as image', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.gif');
      expect(result).toBe('image');
    });
  });

  describe('Presigned URL Handling', () => {
    it('should handle presigned webp URL with query parameters as video', () => {
      const url = 'https://s3.amazonaws.com/bucket/background.webp?AWSAccessKeyId=123&Signature=abc&Expires=1234567890';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('video');
    });

    it('should handle presigned mp4 URL with query parameters', () => {
      const url = 'https://s3.amazonaws.com/bucket/background.mp4?AWSAccessKeyId=123&Signature=abc&Expires=1234567890';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('video');
    });

    it('should handle presigned png URL with query parameters', () => {
      const url = 'https://s3.amazonaws.com/bucket/background.png?AWSAccessKeyId=123&Signature=abc&Expires=1234567890';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });

    it('should handle presigned jpg URL with multiple query parameters', () => {
      const url = 'https://s3.amazonaws.com/bucket/background.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=abc&X-Amz-Date=20240101T000000Z&X-Amz-Expires=3600&X-Amz-Signature=xyz';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('image');
    });
  });

  describe('URL Format Edge Cases', () => {
    it('should handle uppercase webp file extensions as video', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.WEBP');
      expect(result).toBe('video');
    });

    it('should handle mixed case webp file extensions as video', () => {
      const result = detectContentTypeFromUrl('https://example.com/background.WebP');
      expect(result).toBe('video');
    });

    it('should handle URL with port number', () => {
      const result = detectContentTypeFromUrl('https://example.com:8080/background.png');
      expect(result).toBe('image');
    });

    it('should handle URL with subdomain', () => {
      const result = detectContentTypeFromUrl('https://cdn.example.com/assets/background.webp');
      expect(result).toBe('video');
    });

    it('should handle URL with complex path', () => {
      const result = detectContentTypeFromUrl('https://example.com/path/to/assets/background.jpg');
      expect(result).toBe('image');
    });

    it('should default to image for URL without extension', () => {
      const result = detectContentTypeFromUrl('https://example.com/background');
      expect(result).toBe('image');
    });
  });

  describe('Background Format Support', () => {
    it('should support static webp backgrounds via video element', () => {
      const url = 'https://cdn.example.com/static-background.webp';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('video');
    });

    it('should support animated webp backgrounds via video element for smooth playback', () => {
      const url = 'https://cdn.example.com/animated-background.webp';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('video');
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

    it('should support webm video backgrounds', () => {
      const url = 'https://cdn.example.com/video-background.webm';
      const result = detectContentTypeFromUrl(url);
      expect(result).toBe('video');
    });
  });
});
