import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';
import * as db from './db';

describe('admin.media router', () => {
  let adminContext: TrpcContext;
  let userContext: TrpcContext;

  beforeAll(async () => {
    // Create admin context
    adminContext = {
      user: {
        id: 1,
        openId: 'admin-open-id',
        name: 'Admin User',
        email: 'admin@example.com',
        avatar: null,
        role: 'admin',
        createdAt: Date.now(),
      },
      sessionId: 'admin-session-id',
    };

    // Create regular user context
    userContext = {
      user: {
        id: 2,
        openId: 'user-open-id',
        name: 'Regular User',
        email: 'user@example.com',
        avatar: null,
        role: 'user',
        createdAt: Date.now(),
      },
      sessionId: 'user-session-id',
    };
  });

  describe('uploadImage', () => {
    it('should accept valid image upload parameters', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      // Create a small test image (1x1 red pixel PNG in base64)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      
      const input = {
        fileName: 'test-thumbnail.png',
        fileType: 'image/png',
        fileData: testImageBase64,
      };

      // This should not throw - validates input schema
      await expect(
        caller.admin.media.uploadImage(input)
      ).resolves.toBeDefined();
    });

    it('should require admin role', async () => {
      const caller = appRouter.createCaller(userContext);
      
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      
      const input = {
        fileName: 'test-thumbnail.png',
        fileType: 'image/png',
        fileData: testImageBase64,
      };

      await expect(
        caller.admin.media.uploadImage(input)
      ).rejects.toThrow();
    });

    it('should return url and key after upload', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      
      const input = {
        fileName: 'test-thumbnail.png',
        fileType: 'image/png',
        fileData: testImageBase64,
      };

      const result = await caller.admin.media.uploadImage(input);
      
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('key');
      expect(typeof result.url).toBe('string');
      expect(typeof result.key).toBe('string');
      expect(result.key).toContain('images/');
      expect(result.key).toContain('test-thumbnail.png');
    });
  });

  describe('uploadCourseVideo', () => {
    it('should accept valid course video upload parameters', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      // Create a test course first
      await db.createCourse({
        title: 'Test Course for Video',
        description: 'Test description',
        price: 0,
        duration: 60,
        level: 'beginner',
        imageUrl: '/test.jpg',
        isPublished: false,
      });

      const courses = await db.getAllCourses();
      const testCourse = courses.find(c => c.title === 'Test Course for Video');
      
      if (!testCourse) {
        throw new Error('Test course not created');
      }

      // Small test video data (just a few bytes as base64)
      const testVideoBase64 = 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
      
      const input = {
        courseId: testCourse.id,
        filename: 'test-video.mp4',
        contentType: 'video/mp4',
        data: testVideoBase64,
      };

      await expect(
        caller.admin.media.uploadCourseVideo(input)
      ).resolves.toBeDefined();
    });

    it('should require admin role', async () => {
      const caller = appRouter.createCaller(userContext);
      
      const testVideoBase64 = 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
      
      const input = {
        courseId: 1,
        filename: 'test-video.mp4',
        contentType: 'video/mp4',
        data: testVideoBase64,
      };

      await expect(
        caller.admin.media.uploadCourseVideo(input)
      ).rejects.toThrow();
    });

    it('should return url and key after upload', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      // Get existing test course
      const courses = await db.getAllCourses();
      const testCourse = courses.find(c => c.title === 'Test Course for Video');
      
      if (!testCourse) {
        throw new Error('Test course not found');
      }

      const testVideoBase64 = 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
      
      const input = {
        courseId: testCourse.id,
        filename: 'test-video.mp4',
        contentType: 'video/mp4',
        data: testVideoBase64,
      };

      const result = await caller.admin.media.uploadCourseVideo(input);
      
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('key');
      expect(typeof result.url).toBe('string');
      expect(typeof result.key).toBe('string');
      expect(result.key).toContain(`courses/${testCourse.id}/`);
      expect(result.key).toContain('test-video.mp4');
    });
  });

  describe('uploadModuleVideo', () => {
    it('should accept valid module video upload parameters', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      // Create test course and module
      await db.createCourse({
        title: 'Test Course for Module Video',
        description: 'Test description',
        price: 0,
        duration: 60,
        level: 'beginner',
        imageUrl: '/test.jpg',
        isPublished: false,
      });

      const courses = await db.getAllCourses();
      const testCourse = courses.find(c => c.title === 'Test Course for Module Video');
      
      if (!testCourse) {
        throw new Error('Test course not created');
      }

      await db.createCourseModule({
        courseId: testCourse.id,
        title: 'Test Module',
        description: 'Test module description',
        order: 1,
      });

      const modules = await db.getCourseModules(testCourse.id);
      const testModule = modules[0];

      const testVideoBase64 = 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
      
      const input = {
        moduleId: testModule.id,
        filename: 'module-video.mp4',
        contentType: 'video/mp4',
        data: testVideoBase64,
      };

      await expect(
        caller.admin.media.uploadModuleVideo(input)
      ).resolves.toBeDefined();
    });

    it('should require admin role', async () => {
      const caller = appRouter.createCaller(userContext);
      
      const testVideoBase64 = 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
      
      const input = {
        moduleId: 1,
        filename: 'module-video.mp4',
        contentType: 'video/mp4',
        data: testVideoBase64,
      };

      await expect(
        caller.admin.media.uploadModuleVideo(input)
      ).rejects.toThrow();
    });
  });

  describe('uploadLessonVideo', () => {
    it('should accept valid lesson video upload parameters', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      // Create test course, module, and lesson
      await db.createCourse({
        title: 'Test Course for Lesson Video',
        description: 'Test description',
        price: 0,
        duration: 60,
        level: 'beginner',
        imageUrl: '/test.jpg',
        isPublished: false,
      });

      const courses = await db.getAllCourses();
      const testCourse = courses.find(c => c.title === 'Test Course for Lesson Video');
      
      if (!testCourse) {
        throw new Error('Test course not created');
      }

      await db.createCourseModule({
        courseId: testCourse.id,
        title: 'Test Module for Lesson',
        description: 'Test module description',
        order: 1,
      });

      const modules = await db.getCourseModules(testCourse.id);
      const testModule = modules[0];

      await db.createCourseLesson({
        moduleId: testModule.id,
        courseId: testCourse.id,
        title: 'Test Lesson',
        description: 'Test lesson description',
        order: 1,
        duration: 10,
      });

      const lessons = await db.getModuleLessons(testModule.id);
      const testLesson = lessons[0];

      const testVideoBase64 = 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
      
      const input = {
        lessonId: testLesson.id,
        filename: 'lesson-video.mp4',
        contentType: 'video/mp4',
        data: testVideoBase64,
      };

      await expect(
        caller.admin.media.uploadLessonVideo(input)
      ).resolves.toBeDefined();
    });

    it('should require admin role', async () => {
      const caller = appRouter.createCaller(userContext);
      
      const testVideoBase64 = 'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
      
      const input = {
        lessonId: 1,
        filename: 'lesson-video.mp4',
        contentType: 'video/mp4',
        data: testVideoBase64,
      };

      await expect(
        caller.admin.media.uploadLessonVideo(input)
      ).rejects.toThrow();
    });
  });
});
