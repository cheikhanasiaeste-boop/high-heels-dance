import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';
import { db } from './db';
import { siteSettings } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Hero Customization - File Upload', () => {
  let adminCaller: ReturnType<typeof appRouter.createCaller>;
  let guestCaller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    // Create admin context
    const adminCtx: TrpcContext = {
      user: {
        id: 1,
        openId: 'admin-test-user',
        email: 'admin@test.com',
        name: 'Admin User',
        loginMethod: 'manus',
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as any,
      res: {} as any,
    };

    // Create guest context
    const guestCtx: TrpcContext = {
      user: null,
      req: {} as any,
      res: {} as any,
    };

    // Create callers
    adminCaller = appRouter.createCaller(adminCtx);
    guestCaller = appRouter.createCaller(guestCtx);
  });

  describe('Hero Background Upload', () => {
    it('should allow admin to upload hero background image', async () => {
      // Create a small test image (1x1 red pixel PNG in base64)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

      const result = await adminCaller.admin.media.uploadImage({
        fileName: 'hero-background.png',
        fileType: 'image/png',
        fileData: testImageBase64,
      });

      expect(result).toBeDefined();
      expect(result.url).toBeDefined();
      expect(typeof result.url).toBe('string');
      expect(result.url).toContain('http');
    });

    it('should allow admin to save hero background URL to settings', async () => {
      const testUrl = 'https://example.com/hero-background.jpg';

      await adminCaller.admin.settings.update({
        key: 'heroBackgroundUrl',
        value: testUrl,
      });

      const savedValue = await adminCaller.admin.settings.get({
        key: 'heroBackgroundUrl',
      });

      expect(savedValue).toBe(testUrl);
    });

    it('should allow guests to retrieve hero background URL', async () => {
      const testUrl = 'https://example.com/hero-background-public.jpg';

      await adminCaller.admin.settings.update({
        key: 'heroBackgroundUrl',
        value: testUrl,
      });

      const retrievedValue = await guestCaller.admin.settings.get({
        key: 'heroBackgroundUrl',
      });

      expect(retrievedValue).toBe(testUrl);
    });
  });

  describe('Hero Profile Picture Upload', () => {
    it('should allow admin to upload hero profile picture', async () => {
      // Create a small test image (1x1 blue pixel PNG in base64)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==';

      const result = await adminCaller.admin.media.uploadImage({
        fileName: 'hero-profile.png',
        fileType: 'image/png',
        fileData: testImageBase64,
      });

      expect(result).toBeDefined();
      expect(result.url).toBeDefined();
      expect(typeof result.url).toBe('string');
      expect(result.url).toContain('http');
    });

    it('should allow admin to save hero profile picture URL to settings', async () => {
      const testUrl = 'https://example.com/hero-profile.jpg';

      await adminCaller.admin.settings.update({
        key: 'heroProfilePictureUrl',
        value: testUrl,
      });

      const savedValue = await adminCaller.admin.settings.get({
        key: 'heroProfilePictureUrl',
      });

      expect(savedValue).toBe(testUrl);
    });

    it('should allow guests to retrieve hero profile picture URL', async () => {
      const testUrl = 'https://example.com/hero-profile-public.jpg';

      await adminCaller.admin.settings.update({
        key: 'heroProfilePictureUrl',
        value: testUrl,
      });

      const retrievedValue = await guestCaller.admin.settings.get({
        key: 'heroProfilePictureUrl',
      });

      expect(retrievedValue).toBe(testUrl);
    });
  });

  describe('Combined Hero Customization', () => {
    it('should allow admin to update both hero background and profile picture', async () => {
      const backgroundUrl = 'https://example.com/combined-background.jpg';
      const profileUrl = 'https://example.com/combined-profile.jpg';

      await adminCaller.admin.settings.update({
        key: 'heroBackgroundUrl',
        value: backgroundUrl,
      });

      await adminCaller.admin.settings.update({
        key: 'heroProfilePictureUrl',
        value: profileUrl,
      });

      const savedBackground = await adminCaller.admin.settings.get({
        key: 'heroBackgroundUrl',
      });

      const savedProfile = await adminCaller.admin.settings.get({
        key: 'heroProfilePictureUrl',
      });

      expect(savedBackground).toBe(backgroundUrl);
      expect(savedProfile).toBe(profileUrl);
    });

    it('should persist hero settings across sessions', async () => {
      const backgroundUrl = 'https://example.com/persistent-background.jpg';
      const profileUrl = 'https://example.com/persistent-profile.jpg';

      await adminCaller.admin.settings.update({
        key: 'heroBackgroundUrl',
        value: backgroundUrl,
      });

      await adminCaller.admin.settings.update({
        key: 'heroProfilePictureUrl',
        value: profileUrl,
      });

      // Simulate new session by creating new caller
      const newGuestCtx: TrpcContext = {
        user: null,
        req: {} as any,
        res: {} as any,
      };
      const newGuestCaller = appRouter.createCaller(newGuestCtx);

      const retrievedBackground = await newGuestCaller.admin.settings.get({
        key: 'heroBackgroundUrl',
      });

      const retrievedProfile = await newGuestCaller.admin.settings.get({
        key: 'heroProfilePictureUrl',
      });

      expect(retrievedBackground).toBe(backgroundUrl);
      expect(retrievedProfile).toBe(profileUrl);
    });
  });

  describe('Error Handling', () => {
    it('should return null for non-existent settings keys', async () => {
      const result = await guestCaller.admin.settings.get({
        key: 'nonExistentKey',
      });

      expect(result).toBeNull();
    });

    it('should handle empty hero background URL gracefully', async () => {
      await adminCaller.admin.settings.update({
        key: 'heroBackgroundUrl',
        value: '',
      });

      const savedValue = await adminCaller.admin.settings.get({
        key: 'heroBackgroundUrl',
      });

      expect(savedValue).toBe('');
    });

    it('should handle empty hero profile picture URL gracefully', async () => {
      await adminCaller.admin.settings.update({
        key: 'heroProfilePictureUrl',
        value: '',
      });

      const savedValue = await adminCaller.admin.settings.get({
        key: 'heroProfilePictureUrl',
      });

      expect(savedValue).toBe('');
    });
  });
});
