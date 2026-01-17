import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';
import * as db from './db';

describe('admin.courses crop settings', () => {
  let adminContext: TrpcContext;
  let testCourseId: number;

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

    // Create a test course
    const course = await db.createCourse({
      title: 'Test Course for Crop',
      description: 'Test description',
      price: '0',
      duration: 60,
      level: 'beginner',
      imageUrl: 'https://example.com/test.jpg',
      isPublished: false,
    });
    
    testCourseId = course.id;
  });

  describe('update course with crop settings', () => {
    it('should accept crop zoom parameter', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropZoom: '1.50',
      });

      expect(result).toBeDefined();
      
      // Verify the update was saved
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropZoom).toBe('1.50');
    });

    it('should accept crop offsetX parameter', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropOffsetX: '25.00',
      });

      expect(result).toBeDefined();
      
      // Verify the update was saved
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropOffsetX).toBe('25.00');
    });

    it('should accept crop offsetY parameter', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropOffsetY: '-15.00',
      });

      expect(result).toBeDefined();
      
      // Verify the update was saved
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropOffsetY).toBe('-15.00');
    });

    it('should accept all crop parameters together', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropZoom: '2.00',
        imageCropOffsetX: '50.00',
        imageCropOffsetY: '-25.00',
      });

      expect(result).toBeDefined();
      
      // Verify all updates were saved
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropZoom).toBe('2.00');
      expect(course?.imageCropOffsetX).toBe('50.00');
      expect(course?.imageCropOffsetY).toBe('-25.00');
    });

    it('should reset crop settings to defaults', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      // First set some values
      await caller.admin.courses.update({
        id: testCourseId,
        imageCropZoom: '2.50',
        imageCropOffsetX: '75.00',
        imageCropOffsetY: '50.00',
      });
      
      // Then reset to defaults
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropZoom: '1.00',
        imageCropOffsetX: '0.00',
        imageCropOffsetY: '0.00',
      });

      expect(result).toBeDefined();
      
      // Verify reset
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropZoom).toBe('1.00');
      expect(course?.imageCropOffsetX).toBe('0.00');
      expect(course?.imageCropOffsetY).toBe('0.00');
    });

    it('should preserve crop settings when updating other fields', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      // Set crop values
      await caller.admin.courses.update({
        id: testCourseId,
        imageCropZoom: '1.75',
        imageCropOffsetX: '30.00',
        imageCropOffsetY: '-10.00',
      });
      
      // Update only title
      await caller.admin.courses.update({
        id: testCourseId,
        title: 'Updated Title',
      });
      
      // Verify crop settings are preserved
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropZoom).toBe('1.75');
      expect(course?.imageCropOffsetX).toBe('30.00');
      expect(course?.imageCropOffsetY).toBe('-10.00');
      expect(course?.title).toBe('Updated Title');
    });

    it('should handle decimal precision correctly', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropZoom: '1.23',
        imageCropOffsetX: '45.67',
        imageCropOffsetY: '-89.01',
      });

      expect(result).toBeDefined();
      
      // Verify precision is maintained
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropZoom).toBe('1.23');
      expect(course?.imageCropOffsetX).toBe('45.67');
      expect(course?.imageCropOffsetY).toBe('-89.01');
    });
  });

  describe('course retrieval with crop settings', () => {
    it('should return crop settings when fetching course', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      // Set crop values
      await caller.admin.courses.update({
        id: testCourseId,
        imageCropZoom: '1.80',
        imageCropOffsetX: '20.00',
        imageCropOffsetY: '15.00',
      });
      
      // Fetch course
      const course = await db.getCourseById(testCourseId);
      
      expect(course).toBeDefined();
      expect(course?.imageCropZoom).toBe('1.80');
      expect(course?.imageCropOffsetX).toBe('20.00');
      expect(course?.imageCropOffsetY).toBe('15.00');
    });

    it('should return default crop values for courses without settings', async () => {
      // Create a new course without crop settings
      const newCourse = await db.createCourse({
        title: 'Course Without Crop',
        description: 'Test',
        price: '0',
        duration: 60,
        level: 'beginner',
        imageUrl: 'https://example.com/test2.jpg',
        isPublished: false,
      });
      
      const course = await db.getCourseById(newCourse.id);
      
      expect(course).toBeDefined();
      // Default values from schema
      expect(course?.imageCropZoom).toBe('1.00');
      expect(course?.imageCropOffsetX).toBe('0.00');
      expect(course?.imageCropOffsetY).toBe('0.00');
    });
  });

  describe('crop settings validation', () => {
    it('should handle zoom at minimum value (1.00)', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropZoom: '1.00',
      });

      expect(result).toBeDefined();
      
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropZoom).toBe('1.00');
    });

    it('should handle zoom at maximum value (3.00)', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropZoom: '3.00',
      });

      expect(result).toBeDefined();
      
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropZoom).toBe('3.00');
    });

    it('should handle offset at negative boundary (-100)', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropOffsetX: '-100.00',
        imageCropOffsetY: '-100.00',
      });

      expect(result).toBeDefined();
      
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropOffsetX).toBe('-100.00');
      expect(course?.imageCropOffsetY).toBe('-100.00');
    });

    it('should handle offset at positive boundary (100)', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      const result = await caller.admin.courses.update({
        id: testCourseId,
        imageCropOffsetX: '100.00',
        imageCropOffsetY: '100.00',
      });

      expect(result).toBeDefined();
      
      const course = await db.getCourseById(testCourseId);
      expect(course?.imageCropOffsetX).toBe('100.00');
      expect(course?.imageCropOffsetY).toBe('100.00');
    });
  });
});
