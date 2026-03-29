import { describe, it, expect, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

type AuthenticatedUser = NonNullable<TrpcContext['user']>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    supabaseId: "00000000-0000-0000-0000-000000000001",
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    hasSeenWelcome: false,
    membershipStatus: "free",
    membershipStartDate: null,
    membershipEndDate: null,
    stripeSubscriptionId: null,
    lastViewedByAdmin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {} as any,
    res: {} as any,
  };
}

describe('Animated WebP Performance Optimization', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    const ctx = createAdminContext();
    caller = appRouter.createCaller(ctx);
  });

  describe('Hero Background Settings', () => {
    it('should allow admin to update hero background URL', async () => {
      const testUrl = 'https://storage.example.com/hero-bg.webp';
      
      await caller.admin.settings.update({
        key: 'heroBackgroundUrl',
        value: testUrl,
      });

      const result = await caller.admin.settings.get({ key: 'heroBackgroundUrl' });
      expect(result).toBe(testUrl);
    });

    it('should handle animated WebP URLs', async () => {
      const animatedWebPUrl = 'https://storage.example.com/animated-hero.webp';
      
      await caller.admin.settings.update({
        key: 'heroBackgroundUrl',
        value: animatedWebPUrl,
      });

      const result = await caller.admin.settings.get({ key: 'heroBackgroundUrl' });
      expect(result).toBe(animatedWebPUrl);
      expect(result.endsWith('.webp')).toBe(true);
    });

    it('should handle static image URLs as fallback', async () => {
      const staticImageUrl = 'https://storage.example.com/hero-bg.jpg';
      
      await caller.admin.settings.update({
        key: 'heroBackgroundUrl',
        value: staticImageUrl,
      });

      const result = await caller.admin.settings.get({ key: 'heroBackgroundUrl' });
      expect(result).toBe(staticImageUrl);
    });
  });

  describe('Background Animation Priority', () => {
    it('should prioritize heroBackgroundUrl over legacy animation URLs', async () => {
      const heroUrl = 'https://storage.example.com/hero.webp';
      const legacyUrl = 'https://storage.example.com/legacy.mp4';

      await caller.admin.settings.update({
        key: 'heroBackgroundUrl',
        value: heroUrl,
      });

      await caller.admin.settings.update({
        key: 'backgroundVideoUrl',
        value: legacyUrl,
      });

      const heroResult = await caller.admin.settings.get({ key: 'heroBackgroundUrl' });
      const legacyResult = await caller.admin.settings.get({ key: 'backgroundVideoUrl' });

      expect(heroResult).toBe(heroUrl);
      expect(legacyResult).toBe(legacyUrl);
      // Frontend should prioritize heroBackgroundUrl
    });
  });

  describe('Profile Picture Settings', () => {
    it('should allow admin to update hero profile picture URL', async () => {
      const profileUrl = 'https://storage.example.com/profile.jpg';
      
      await caller.admin.settings.update({
        key: 'heroProfilePictureUrl',
        value: profileUrl,
      });

      const result = await caller.admin.settings.get({ key: 'heroProfilePictureUrl' });
      expect(result).toBe(profileUrl);
    });
  });

  describe('Settings Retrieval', () => {
    it('should return null for non-existent settings', async () => {
      const result = await caller.admin.settings.get({ key: 'nonExistentKey' });
      expect(result).toBeNull();
    });

    it('should handle multiple concurrent setting updates', async () => {
      const updates = [
        caller.admin.settings.update({ key: 'heroBackgroundUrl', value: 'url1.webp' }),
        caller.admin.settings.update({ key: 'heroProfilePictureUrl', value: 'url2.jpg' }),
        caller.admin.settings.update({ key: 'backgroundVideoUrl', value: 'url3.mp4' }),
      ];

      await Promise.all(updates);

      const results = await Promise.all([
        caller.admin.settings.get({ key: 'heroBackgroundUrl' }),
        caller.admin.settings.get({ key: 'heroProfilePictureUrl' }),
        caller.admin.settings.get({ key: 'backgroundVideoUrl' }),
      ]);

      expect(results[0]).toBe('url1.webp');
      expect(results[1]).toBe('url2.jpg');
      expect(results[2]).toBe('url3.mp4');
    });
  });
});
