import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import Stripe from "stripe";
import { getCourseStripePrice } from "./products";
import { adminNotifications } from "./events";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    markWelcomeSeen: protectedProcedure.mutation(async ({ ctx }) => {
      await db.markUserWelcomeSeen(ctx.user.id);
      return { success: true };
    }),
  }),

  // Public course procedures
  courses: router({
    list: publicProcedure.query(async () => {
      return await db.getAllPublishedCourses();
    }),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const course = await db.getCourseById(input.id);
        if (!course) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }
        return course;
      }),
    
    // Check if user has access to a course
    hasAccess: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ ctx, input }) => {
        const course = await db.getCourseById(input.courseId);
        if (!course) return false;
        
        // Free courses are accessible to all authenticated users
        if (course.isFree) return true;
        
        // Check if user purchased the course
        return await db.hasUserPurchasedCourse(ctx.user.id, input.courseId);
      }),
    
    // Get modules with lessons for course learning page
    getModulesWithLessons: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ input }) => {
        return await db.getCourseModulesWithLessons(input.courseId);
      }),
    
    // Get user progress for a course
    getUserProgress: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getUserCourseProgress(ctx.user.id, input.courseId);
      }),
    
    // Check if user has access (alias for hasAccess)
    checkAccess: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ ctx, input }) => {
        const course = await db.getCourseById(input.courseId);
        if (!course) return false;
        if (course.isFree) return true;
        return await db.hasUserPurchasedCourse(ctx.user.id, input.courseId);
      }),
    
    // Mark lesson as completed
    markLessonComplete: protectedProcedure
      .input(z.object({
        lessonId: z.number(),
        courseId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.markLessonComplete(ctx.user.id, input.lessonId, input.courseId);
      }),
    
    // Update lesson watch progress
    updateLessonProgress: protectedProcedure
      .input(z.object({
        lessonId: z.number(),
        courseId: z.number(),
        watchedDuration: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.updateLessonProgress(
          ctx.user.id,
          input.lessonId,
          input.courseId,
          input.watchedDuration
        );
      }),
  }),

  // User purchase procedures
  purchases: router({
    myPurchases: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserPurchases(ctx.user.id);
    }),
    
    createCheckoutSession: protectedProcedure
      .input(z.object({
        courseId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const course = await db.getCourseById(input.courseId);
        if (!course) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }
        
        // Check if already purchased
        const alreadyPurchased = await db.hasUserPurchasedCourse(ctx.user.id, input.courseId);
        if (alreadyPurchased) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Course already purchased' });
        }
        
        // Free courses don't need checkout
        if (course.isFree) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This course is free' });
        }
        
        // Get origin for redirect URLs
        const origin = ctx.req.headers.origin || `${ctx.req.protocol}://${ctx.req.get('host')}`;
        
        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: getCourseStripePrice(course.price, course.title),
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${origin}/course/${course.id}?success=true`,
          cancel_url: `${origin}/course/${course.id}?canceled=true`,
          customer_email: ctx.user.email || undefined,
          client_reference_id: ctx.user.id.toString(),
          metadata: {
            user_id: ctx.user.id.toString(),
            course_id: course.id.toString(),
            customer_email: ctx.user.email || '',
            customer_name: ctx.user.name || '',
          },
          allow_promotion_codes: true,
        });
        
        return { url: session.url };
      }),
  }),

  // File upload
  upload: adminProcedure
    .input(z.object({
      key: z.string(),
      data: z.string(), // base64 encoded
      contentType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Decode base64 to buffer
      const buffer = Buffer.from(input.data, 'base64');
      
      // Upload to S3
      const result = await storagePut(input.key, buffer, input.contentType);
      
      return result;
    }),

  // Admin course management
  admin: router({
    dashboard: router({
      stats: adminProcedure.query(async () => {
        return await db.getDashboardStats();
      }),
      
      revenue: adminProcedure.query(async () => {
        return await db.getRevenueByPeriod();
      }),
      
      revenueTimeSeries: adminProcedure
        .input(z.object({
          startDate: z.string(),
          endDate: z.string(),
        }))
        .query(async ({ input }) => {
          const start = new Date(input.startDate);
          const end = new Date(input.endDate);
          return await db.getRevenueTimeSeries(start, end);
        }),
      
      userGrowthTimeSeries: adminProcedure
        .input(z.object({
          startDate: z.string(),
          endDate: z.string(),
        }))
        .query(async ({ input }) => {
          const start = new Date(input.startDate);
          const end = new Date(input.endDate);
          return await db.getUserGrowthTimeSeries(start, end);
        }),
      
      analytics: adminProcedure
        .input(z.object({
          startDate: z.string(),
          endDate: z.string(),
        }))
        .query(async ({ input }) => {
          const start = new Date(input.startDate);
          const end = new Date(input.endDate);
          return await db.getAnalytics(start, end);
        }),
    }),
    
    courses: router({
      list: adminProcedure.query(async () => {
        return await db.getAllCourses();
      }),
      
      create: adminProcedure
        .input(z.object({
          title: z.string().min(1),
          description: z.string().min(1),
          price: z.string(),
          originalPrice: z.string().optional(),
          imageUrl: z.string().optional(),
          imageKey: z.string().optional(),
          isFree: z.boolean(),
          isPublished: z.boolean(),
        }))
        .mutation(async ({ input }) => {
          return await db.createCourse(input);
        }),
      
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          title: z.string().min(1).optional(),
          description: z.string().min(1).optional(),
          price: z.string().optional(),
          originalPrice: z.string().optional(),
          imageUrl: z.string().optional(),
          imageKey: z.string().optional(),
          imageCropZoom: z.string().optional(),
          imageCropOffsetX: z.string().optional(),
          imageCropOffsetY: z.string().optional(),
          previewVideoUrl: z.string().optional(),
          previewVideoKey: z.string().optional(),
          isFree: z.boolean().optional(),
          isPublished: z.boolean().optional(),
          isTopPick: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...updates } = input;
          return await db.updateCourse(id, updates);
        }),
      
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteCourse(input.id);
          return { success: true };
        }),
    }),
    
    // Course content management (modules and lessons)
    courseContent: router({
      // Get all modules for a course
      getModules: adminProcedure
        .input(z.object({ courseId: z.number() }))
        .query(async ({ input }) => {
          return await db.getCourseModules(input.courseId);
        }),
      
      // Get all lessons for a module
      getLessons: adminProcedure
        .input(z.object({ moduleId: z.number() }))
        .query(async ({ input }) => {
          return await db.getModuleLessons(input.moduleId);
        }),
      
      // Create a new module
      createModule: adminProcedure
        .input(z.object({
          courseId: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          order: z.number().default(0),
        }))
        .mutation(async ({ input }) => {
          return await db.createCourseModule(input);
        }),
      
      // Update a module
      updateModule: adminProcedure
        .input(z.object({
          id: z.number(),
          title: z.string().min(1).optional(),
          description: z.string().optional(),
          videoUrl: z.string().optional(),
          videoKey: z.string().optional(),
          order: z.number().optional(),
          isPublished: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...updates } = input;
          return await db.updateCourseModule(id, updates);
        }),
      
      // Delete a module
      deleteModule: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteCourseModule(input.id);
          return { success: true };
        }),
      
      // Create a new lesson
      createLesson: adminProcedure
        .input(z.object({
          moduleId: z.number(),
          courseId: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          videoUrl: z.string().optional(),
          videoKey: z.string().optional(),
          duration: z.number().optional(),
          content: z.string().optional(),
          order: z.number().default(0),
          isFree: z.boolean().default(false),
        }))
        .mutation(async ({ input }) => {
          return await db.createCourseLesson(input);
        }),
      
      // Update a lesson
      updateLesson: adminProcedure
        .input(z.object({
          id: z.number(),
          title: z.string().min(1).optional(),
          description: z.string().optional(),
          videoUrl: z.string().optional(),
          videoKey: z.string().optional(),
          duration: z.number().optional(),
          content: z.string().optional(),
          order: z.number().optional(),
          isPublished: z.boolean().optional(),
          isFree: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...updates } = input;
          return await db.updateCourseLesson(id, updates);
        }),
      
      // Delete a lesson
      deleteLesson: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteCourseLesson(input.id);
          return { success: true };
        }),
      
      // Reorder modules
      reorderModules: adminProcedure
        .input(z.object({
          courseId: z.number(),
          moduleIds: z.array(z.number()),
        }))
        .mutation(async ({ input }) => {
          await db.reorderCourseModules(input.courseId, input.moduleIds);
          return { success: true };
        }),
      
      // Reorder lessons
      reorderLessons: adminProcedure
        .input(z.object({
          moduleId: z.number(),
          lessonIds: z.array(z.number()),
        }))
        .mutation(async ({ input }) => {
          await db.reorderModuleLessons(input.moduleId, input.lessonIds);
          return { success: true };
        }),
    }),
    
    // Availability management
    availability: router({
      list: adminProcedure.query(async () => {
        return await db.getAllAvailabilitySlots();
      }),
      
      upcoming: publicProcedure
        .input(z.object({ limit: z.number().optional().default(6) }))
        .query(async ({ input }) => {
          return await db.getUpcomingAvailableSlots(input.limit);
        }),
      
      create: adminProcedure
        .input(z.object({
          startTime: z.string(),
          endTime: z.string(),
          eventType: z.enum(["online", "in-person"]),
          location: z.string().optional(),
          isFree: z.boolean(),
          price: z.string().optional(),
          title: z.string(),
          description: z.string().optional(),
          sessionType: z.enum(["private", "group"]).default("private"),
          capacity: z.number().min(1).default(1),
        }))
        .mutation(async ({ input }) => {
          return await db.createAvailabilitySlot({
            startTime: new Date(input.startTime),
            endTime: new Date(input.endTime),
            eventType: input.eventType,
            location: input.location,
            isFree: input.isFree,
            price: input.price,
            title: input.title,
            description: input.description,
            sessionType: input.sessionType,
            capacity: input.capacity,
            currentBookings: 0,
            isBooked: false,
          });
        }),
      
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteAvailabilitySlot(input.id);
          return { success: true };
        }),
      
      bulkDelete: adminProcedure
        .input(z.object({ ids: z.array(z.number()) }))
        .mutation(async ({ input }) => {
          for (const id of input.ids) {
            await db.deleteAvailabilitySlot(id);
          }
          return { success: true, count: input.ids.length };
        }),
      
      search: adminProcedure
        .input(z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }))
        .query(async ({ input }) => {
          const allSlots = await db.getAllAvailabilitySlots();
          
          if (!input.startDate && !input.endDate) {
            return allSlots;
          }
          
          return allSlots.filter(slot => {
            const slotDate = new Date(slot.startTime);
            const start = input.startDate ? new Date(input.startDate) : null;
            const end = input.endDate ? new Date(input.endDate) : null;
            
            if (start && slotDate < start) return false;
            if (end) {
              const endOfDay = new Date(end);
              endOfDay.setHours(23, 59, 59, 999);
              if (slotDate > endOfDay) return false;
            }
            
            return true;
          });
        }),
    }),
    
    // Booking management
    bookings: router({
      list: adminProcedure.query(async () => {
        return await db.getAllBookings();
      }),
      
      cancel: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          const booking = await db.getBookingById(input.id);
          if (!booking) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
          }
          
          await db.cancelBooking(input.id);
          await db.updateAvailabilitySlot(booking.slotId, { isBooked: false });
          
          return { success: true };
        }),
    }),

    // Settings management
    settings: router({
      get: publicProcedure
        .input(z.object({ key: z.string() }))
        .query(async ({ input }) => {
          return await db.getSetting(input.key);
        }),
      
      update: adminProcedure
        .input(z.object({ key: z.string(), value: z.string() }))
        .mutation(async ({ input }) => {
          await db.setSetting(input.key, input.value);
          return { success: true };
        }),
    }),

    // Testimonial management
    testimonials: router({
      // List all testimonials
      list: adminProcedure.query(async () => {
        return await db.getAllTestimonials();
      }),

      // Approve testimonial
      approve: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.updateTestimonial(input.id, { status: 'approved' });
          return { success: true };
        }),

      // Reject testimonial
      reject: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.updateTestimonial(input.id, { status: 'rejected' });
          return { success: true };
        }),

      // Toggle featured status
      toggleFeatured: adminProcedure
        .input(z.object({ id: z.number(), isFeatured: z.boolean() }))
        .mutation(async ({ input }) => {
          await db.updateTestimonial(input.id, { isFeatured: input.isFeatured });
          return { success: true };
        }),

      // Delete testimonial
      delete: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteTestimonial(input.id);
          return { success: true };
        }),
    }),

    // Banner management
    banner: router({
      get: adminProcedure.query(async () => {
        const enabled = await db.getSetting('banner_enabled');
        const text = await db.getSetting('banner_text');
        return {
          enabled: enabled === 'true',
          text: text || '',
        };
      }),
      
      update: adminProcedure
        .input(z.object({
          enabled: z.boolean(),
          text: z.string(),
        }))
        .mutation(async ({ input }) => {
          await db.setSetting('banner_enabled', input.enabled.toString());
          await db.setSetting('banner_text', input.text);
          return { success: true };
        }),
    }),

    // User management
    users: router({
      // List all users (legacy - for simple admin pages)
      list: adminProcedure.query(async () => {
        return await db.getAllUsers();
      }),

      // List users with pagination, search, and filters (new - for User Management page)
      listPaginated: adminProcedure
        .input(z.object({
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(20),
          search: z.string().optional(),
          roleFilter: z.enum(['all', 'admin', 'user']).default('all'),
          courseFilter: z.number().optional(),
        }))
        .query(async ({ input }) => {
          return await db.listUsers(input);
        }),

      // Create new user (manual admin creation)
      create: adminProcedure
        .input(z.object({
          name: z.string().min(1),
          email: z.string().email(),
          role: z.enum(['user', 'admin']).default('user'),
        }))
        .mutation(async ({ ctx, input }) => {
          return await db.createUserManually(input, ctx.user.id);
        }),

      // Delete user
      delete: adminProcedure
        .input(z.object({ userId: z.number() }))
        .mutation(async ({ ctx, input }) => {
          if (input.userId === ctx.user.id) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot delete your own account',
            });
          }
          return await db.deleteUser(input.userId);
        }),

      updateRole: adminProcedure
        .input(z.object({
          userId: z.number(),
          role: z.enum(['admin', 'user']),
        }))
        .mutation(async ({ input }) => {
          await db.updateUserRole(input.userId, input.role);
          return { success: true };
        }),

      getById: adminProcedure
        .input(z.object({ userId: z.number() }))
        .query(async ({ input }) => {
          const user = await db.getUserById(input.userId);
          if (!user) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
          }
          return user;
        }),
    }),

    // Course Assignment Management
    courseAssignment: router({
      // Get all courses enrolled by a specific user
      getUserCourses: adminProcedure
        .input(z.object({ userId: z.number() }))
        .query(async ({ input }) => {
          return await db.getUserEnrolledCourses(input.userId);
        }),

      // Assign a course to a user
      assign: adminProcedure
        .input(z.object({
          userId: z.number(),
          courseId: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {
          return await db.assignCourseToUser(
            input.userId,
            input.courseId,
            ctx.user.id
          );
        }),

      // Remove a course from a user
      remove: adminProcedure
        .input(z.object({
          userId: z.number(),
          courseId: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {
          return await db.removeCourseFromUser(input.userId, input.courseId);
        }),

      // Bulk assign courses to multiple users
      bulkAssign: adminProcedure
        .input(z.object({
          userIds: z.array(z.number()).min(1),
          courseIds: z.array(z.number()).min(1),
        }))
        .mutation(async ({ ctx, input }) => {
          return await db.bulkAssignCourses(
            input.userIds,
            input.courseIds,
            ctx.user.id
          );
        }),

      // Bulk remove courses from multiple users
      bulkRemove: adminProcedure
        .input(z.object({
          userIds: z.array(z.number()).min(1),
          courseIds: z.array(z.number()).min(1),
        }))
        .mutation(async ({ ctx, input }) => {
          return await db.bulkRemoveCourses(input.userIds, input.courseIds);
        }),
    }),

    // Popup settings management
    popup: router({
      get: adminProcedure.query(async () => {
        return await db.getPopupSettings();
      }),
      
      upsert: adminProcedure
        .input(z.object({
          enabled: z.boolean(),
          title: z.string(),
          message: z.string(),
          imageUrl: z.string().nullable().optional(),
          buttonText: z.string(),
          showEmailInput: z.boolean(),
          emailPlaceholder: z.string().optional(),
          backgroundColor: z.string().optional(),
          textColor: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          return await db.upsertPopupSettings(input);
        }),
    }),
    
    // Section headings management
    sectionHeadings: router({
      list: adminProcedure.query(async () => {
        return await db.getAllSectionHeadings();
      }),
      
      get: adminProcedure
        .input(z.object({ section: z.string() }))
        .query(async ({ input }) => {
          return await db.getSectionHeading(input.section);
        }),
      
      create: adminProcedure
        .input(z.object({
          section: z.string(),
          heading: z.string(),
          subheading: z.string().optional(),
          displayOrder: z.number().default(0),
          isVisible: z.boolean().default(true),
        }))
        .mutation(async ({ input }) => {
          return await db.createSectionHeading(input);
        }),
      
      update: adminProcedure
        .input(z.object({
          section: z.string(),
          heading: z.string().optional(),
          subheading: z.string().optional(),
          displayOrder: z.number().optional(),
          isVisible: z.boolean().optional(),
        }))
        .mutation(async ({ input }) => {
          const { section, ...updates } = input;
          return await db.updateSectionHeading(section, updates);
        }),
      
      delete: adminProcedure
        .input(z.object({ section: z.string() }))
        .mutation(async ({ input }) => {
          await db.deleteSectionHeading(input.section);
          return { success: true };
        }),
    }),
    
    // Site content management
    content: router({
      get: publicProcedure
        .input(z.object({ key: z.string() }))
        .query(async ({ input }) => {
          return await db.getSetting(input.key);
        }),

      update: adminProcedure
        .input(z.object({
          key: z.string(),
          value: z.string(),
        }))
        .mutation(async ({ input }) => {
          await db.setSetting(input.key, input.value);
          return { success: true };
        }),
    }),

    // Media upload endpoints
    media: router({
      // Upload course preview video
      uploadCourseVideo: adminProcedure
        .input(z.object({
          courseId: z.number(),
          filename: z.string(),
          contentType: z.string(),
          data: z.string(), // base64 encoded
        }))
        .mutation(async ({ input }) => {
          const { storagePut } = await import('./storage');
          
          // Decode base64 data
          const buffer = Buffer.from(input.data, 'base64');
          
          // Generate unique filename
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(7);
          const fileKey = `courses/${input.courseId}/preview-${timestamp}-${randomSuffix}-${input.filename}`;
          
          // Upload to S3
          const result = await storagePut(fileKey, buffer, input.contentType);
          
          // Update course with video URL
          await db.updateCourse(input.courseId, {
            previewVideoUrl: result.url,
            previewVideoKey: fileKey,
          });
          
          return { url: result.url, key: fileKey };
        }),

      // Upload module video
      uploadModuleVideo: adminProcedure
        .input(z.object({
          moduleId: z.number(),
          filename: z.string(),
          contentType: z.string(),
          data: z.string(), // base64 encoded
        }))
        .mutation(async ({ input }) => {
          const { storagePut } = await import('./storage');
          
          // Decode base64 data
          const buffer = Buffer.from(input.data, 'base64');
          
          // Generate unique filename
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(7);
          const fileKey = `modules/${input.moduleId}/video-${timestamp}-${randomSuffix}-${input.filename}`;
          
          // Upload to S3
          const result = await storagePut(fileKey, buffer, input.contentType);
          
          // Update module with video URL
          await db.updateCourseModule(input.moduleId, {
            videoUrl: result.url,
            videoKey: fileKey,
          });
          
          return { url: result.url, key: fileKey };
        }),

      // Upload lesson video
      uploadLessonVideo: adminProcedure
        .input(z.object({
          lessonId: z.number(),
          filename: z.string(),
          contentType: z.string(),
          data: z.string(), // base64 encoded
        }))
        .mutation(async ({ input }) => {
          const { storagePut } = await import('./storage');
          
          // Decode base64 data
          const buffer = Buffer.from(input.data, 'base64');
          
          // Generate unique filename
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(7);
          const fileKey = `lessons/${input.lessonId}/video-${timestamp}-${randomSuffix}-${input.filename}`;
          
          // Upload to S3
          const result = await storagePut(fileKey, buffer, input.contentType);
          
          // Update lesson with video URL
          await db.updateCourseLesson(input.lessonId, {
            videoUrl: result.url,
            videoKey: fileKey,
          });
          
          return { url: result.url, key: fileKey };
        }),

      // Upload image (for thumbnails, etc.)
      uploadImage: adminProcedure
        .input(z.object({
          fileName: z.string(),
          fileType: z.string(),
          fileData: z.string(), // base64 encoded
        }))
        .mutation(async ({ input }) => {
          const { storagePut } = await import('./storage');
          
          // Decode base64 data
          const buffer = Buffer.from(input.fileData, 'base64');
          
          // Generate unique filename
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(7);
          const fileKey = `images/${timestamp}-${randomSuffix}-${input.fileName}`;
          
          // Upload to S3
          const result = await storagePut(fileKey, buffer, input.fileType);
          
          return { url: result.url, key: fileKey };
        }),
    }),
  }),

  // Public banner status
  banner: router({
    get: publicProcedure.query(async () => {
      const enabled = await db.getSetting('banner_enabled');
      const text = await db.getSetting('banner_text');
      return {
        enabled: enabled === 'true',
        text: text || '',
      };
    }),
  }),

  // Public popup
  popup: router({
    get: publicProcedure.query(async () => {
      return await db.getPopupSettings();
    }),
    
    recordInteraction: publicProcedure
      .input(z.object({
        popupId: z.number(),
        email: z.string().email().optional(),
        action: z.enum(['dismissed', 'email_submitted']),
      }))
      .mutation(async ({ input, ctx }) => {
        await db.recordPopupInteraction({
          userId: ctx.user?.id || null,
          popupId: input.popupId,
          email: input.email,
          action: input.action,
        });
        return { success: true };
      }),
  }),

  // Booking system
  bookings: router({
    // Get available slots for booking with optional filter
    availableSlots: publicProcedure
      .input(z.object({
        eventType: z.enum(["online", "in-person", "all"]).optional(),
        sessionType: z.enum(["private", "group", "all"]).optional(),
      }).optional())
      .query(async ({ input }) => {
        let slots = await db.getAvailableSlots();
        
        // Filter by event type
        if (input?.eventType && input.eventType !== "all") {
          slots = slots.filter(slot => slot.eventType === input.eventType);
        }
        
        // Filter by session type
        if (input?.sessionType && input.sessionType !== "all") {
          slots = slots.filter(slot => slot.sessionType === input.sessionType);
        }
        
        return slots;
      }),
    
    // Create a booking (free sessions only)
    create: protectedProcedure
      .input(z.object({
        slotId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if slot exists and is available
        const slot = await db.getAvailabilitySlotById(input.slotId);
        if (!slot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Time slot not found' });
        }
        if (!slot.isFree) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This session requires payment. Use the payment flow instead.' });
        }
        
        // Check capacity for group sessions
        if (slot.sessionType === 'group') {
          if (slot.currentBookings >= slot.capacity) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'This session is fully booked' });
          }
        } else {
          // Private session - check if already booked
          if (slot.isBooked) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'This time slot is already booked' });
          }
        }
        
        // Generate Zoom link for online sessions
        const zoomLink = slot.eventType === 'online' 
          ? `https://zoom.us/j/${Math.random().toString().slice(2, 12)}`
          : null;
        
        // Create booking
        const booking = await db.createBooking({
          userId: ctx.user.id,
          slotId: input.slotId,
          sessionType: slot.title,
          zoomLink: zoomLink || undefined,
          status: 'confirmed',
          notes: input.notes,
          paymentRequired: false,
          paymentStatus: 'not_required',
        });
        
        // Update slot booking status
        if (slot.sessionType === 'group') {
          // Increment current bookings for group sessions
          await db.updateAvailabilitySlot(input.slotId, { 
            currentBookings: slot.currentBookings + 1 
          });
        } else {
          // Mark private session as booked
          await db.updateAvailabilitySlot(input.slotId, { isBooked: true });
        }
        
        // Emit real-time notification for admin
        adminNotifications.emitBooking(booking);
        
        return booking;
      }),
    
    // Create checkout session for paid bookings
    createCheckout: protectedProcedure
      .input(z.object({
        slotId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const slot = await db.getAvailabilitySlotById(input.slotId);
        if (!slot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Time slot not found' });
        }
        if (slot.isFree) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This session is free. Use the free booking flow.' });
        }
        if (!slot.price) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Session price not configured' });
        }
        
        // Check capacity
        if (slot.sessionType === 'group') {
          if (slot.currentBookings >= slot.capacity) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'This session is fully booked' });
          }
        } else {
          // Private session
          if (slot.isBooked) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'This time slot is already booked' });
          }
        }

        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-12-15.clover' });

        const origin = ctx.req.headers.origin || `${ctx.req.protocol}://${ctx.req.get('host')}`;
        const priceInCents = Math.round(parseFloat(slot.price) * 100);

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'eur',
                product_data: {
                  name: slot.title,
                  description: `${slot.eventType === 'online' ? 'Online' : 'In-person'} session on ${new Date(slot.startTime).toLocaleString()}`,
                },
                unit_amount: priceInCents,
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${origin}/book-session?success=true`,
          cancel_url: `${origin}/book-session?cancelled=true`,
          client_reference_id: ctx.user.id.toString(),
          customer_email: ctx.user.email || undefined,
          metadata: {
            user_id: ctx.user.id.toString(),
            slot_id: input.slotId.toString(),
            customer_email: ctx.user.email || '',
            customer_name: ctx.user.name || '',
            notes: input.notes || '',
          },
          allow_promotion_codes: true,
        });

        return { checkoutUrl: session.url };
      }),
    
    // Get user's bookings
    myBookings: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserBookings(ctx.user.id);
    }),
    
    // Cancel a booking
    cancel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const booking = await db.getBookingById(input.id);
        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Booking not found' });
        }
        if (booking.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not your booking' });
        }
        
        // Cancel booking and update slot availability
        await db.cancelBooking(input.id);
        
        const slot = await db.getAvailabilitySlotById(booking.slotId);
        if (slot) {
          if (slot.sessionType === 'group') {
            // Decrement current bookings for group sessions
            await db.updateAvailabilitySlot(booking.slotId, { 
              currentBookings: Math.max(0, slot.currentBookings - 1) 
            });
          } else {
            // Free up private session
            await db.updateAvailabilitySlot(booking.slotId, { isBooked: false });
          }
        }
        
        return { success: true };
      }),
  }),

  // AI Chat support
  chat: router({
    send: publicProcedure
      .input(z.object({
        message: z.string().min(1),
        history: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id ?? null;
        
        // Save user message
        await db.createChatMessage({
          userId,
          role: 'user',
          content: input.message,
        });
        
        // Build conversation context
        const systemPrompt = `You are a helpful customer support assistant for High Heels Dance, a dance course platform by Elizabeth Zolotova.

About the business:
- Elizabeth Zolotova is a professional dancer and dance teacher
- We offer high heels dance courses for all levels (beginner to advanced)
- Courses include choreography tutorials, training modules, and technique classes
- Both free preview courses and paid courses are available
- Paid courses require account creation and payment

Common topics:
- Course information and recommendations
- Pricing and payment questions
- Account and login help
- Course access and technical support
- Refund and cancellation policies

Be friendly, professional, and helpful. If you don't know something specific, offer to connect them with support.`;

        const messages = [
          { role: 'system' as const, content: systemPrompt },
          ...(input.history || []).map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          { role: 'user' as const, content: input.message },
        ];
        
        // Get AI response
        const response = await invokeLLM({ messages });
        const content = response.choices[0]?.message?.content;
        const assistantMessage = typeof content === 'string' 
          ? content 
          : 'I apologize, but I am unable to respond at the moment. Please try again.';
        
        // Save assistant message
        await db.createChatMessage({
          userId,
          role: 'assistant',
          content: assistantMessage,
        });
        
        return { message: assistantMessage };
      }),
    
    history: protectedProcedure.query(async ({ ctx }) => {
      return await db.getChatHistory(ctx.user.id);
    }),
  }),



  // Testimonials
  testimonials: router({
    // Public: Get approved testimonials for homepage
    list: publicProcedure.query(async () => {
      return await db.getApprovedTestimonials();
    }),
    
    // Public: Get approved video testimonials for gallery
    videoTestimonials: publicProcedure.query(async () => {
      const testimonials = await db.getApprovedTestimonials();
      return testimonials.filter(t => t.videoUrl);
    }),

    // Protected: Submit course completion testimonial
    submitCourseTestimonial: protectedProcedure
      .input(z.object({
        courseId: z.number(),
        rating: z.number().min(1).max(5),
        content: z.string().min(10),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user already submitted feedback for this course
        const existing = await db.getUserTestimonialForItem(
          ctx.user.id,
          "course",
          input.courseId
        );

        if (existing) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You have already submitted feedback for this course',
          });
        }

        const testimonial = await db.createTestimonial({
          userId: ctx.user.id,
          userName: ctx.user.name || 'Anonymous',
          userEmail: ctx.user.email || undefined,
          rating: input.rating,
          review: input.content,
          type: "course",
          relatedId: input.courseId,
          status: 'pending',
        });

        return testimonial;
      }),
    
    // Protected: Submit feedback
    submit: protectedProcedure
      .input(z.object({
        type: z.enum(["session", "course"]),
        relatedId: z.number(),
        rating: z.number().min(1).max(5),
        review: z.string().min(10),
        photoUrl: z.string().optional(),
        videoUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user already submitted feedback for this item
        const existing = await db.getUserTestimonialForItem(
          ctx.user.id,
          input.type,
          input.relatedId
        );

        if (existing) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You have already submitted feedback for this item',
          });
        }

        const testimonial = await db.createTestimonial({
          userId: ctx.user.id,
          userName: ctx.user.name || 'Anonymous',
          userEmail: ctx.user.email || undefined,
          rating: input.rating,
          review: input.review,
          photoUrl: input.photoUrl,
          videoUrl: input.videoUrl,
          type: input.type,
          relatedId: input.relatedId,
          status: 'pending',
        });

        return testimonial;
      }),

    // Protected: Check if user can submit feedback
    canSubmit: protectedProcedure
      .input(z.object({
        type: z.enum(["session", "course"]),
        relatedId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const existing = await db.getUserTestimonialForItem(
          ctx.user.id,
          input.type,
          input.relatedId
        );
        return { canSubmit: !existing };
      }),

    // Protected: Upload video file
    uploadVideo: protectedProcedure
      .input(z.object({
        filename: z.string(),
        contentType: z.string(),
        data: z.string(), // base64 encoded
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import('./storage');
        
        // Decode base64 data
        const buffer = Buffer.from(input.data, 'base64');
        
        // Generate unique filename
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileKey = `testimonials/${timestamp}-${randomSuffix}-${input.filename}`;
        
        // Upload to S3
        const result = await storagePut(fileKey, buffer, input.contentType);
        
        return { url: result.url, key: fileKey };
      }),
  }),
});

export type AppRouter = typeof appRouter;
