import { systemRouter } from "./_core/systemRouter";
import { zoomRouter } from "./zoomRouter";
import { liveSessionRouter } from "./liveSessionRouter";
import { membershipRouter } from "./membershipRouter";
import { membershipManagementRouter } from "./membershipManagementRouter";
import { discountRouter } from "./discountRouter";
import { sessionDiscountRouter } from "./sessionDiscountRouter";
import { blogRouter, newsletterRouter, adminBlogRouter } from "./blogRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import Stripe from "stripe";
import { getCourseStripePrice } from "./products";
import { adminNotifications } from "./events";
import { generateMeetLink } from "./meet";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null;

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  zoom: zoomRouter,
  liveSessions: liveSessionRouter,
  membership: membershipRouter,
  membershipManagement: membershipManagementRouter,
  discount: discountRouter,
  sessionDiscount: sessionDiscountRouter,
  
  auth: router({
    /** Returns safe user profile data, or null if not authenticated. */
    me: publicProcedure.query((opts) => {
      if (!opts.ctx.user) return null;
      const { supabaseId, stripeSubscriptionId, lastViewedByAdmin, ...safeUser } = opts.ctx.user;
      return safeUser;
    }),

    /** Mark that the user has seen the welcome modal. */
    markWelcomeSeen: protectedProcedure.mutation(async ({ ctx }) => {
      await db.markUserWelcomeSeen(ctx.user.id);
      return { success: true };
    }),

    /**
     * Called by the frontend on every SIGNED_IN event.
     * Provisions or links the users row for this Supabase identity.
     * Runs as a publicProcedure because ctx.user is null on first call.
     */
    syncUser: publicProcedure
      .input(
        z.object({
          name: z.string(),
          email: z.string().email(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.supabaseUid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "No active Supabase session",
          });
        }
        const user = await db.syncUser({
          supabaseId: ctx.supabaseUid,
          name: input.name || null,
          email: input.email,
        });
        // Strip sensitive fields before returning to client
        const { supabaseId, stripeSubscriptionId, lastViewedByAdmin, ...safeUser } = user;
        return safeUser;
      }),
  }),

  // Public course procedures
  courses: router({
    list: publicProcedure.query(async () => {
      const courses = await db.getAllPublishedCourses();
      // Strip internal storage keys from public response
      return courses.map((c: any) => {
        const { imageKey, previewVideoKey, ...safe } = c;
        return safe;
      });
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const course = await db.getCourseById(input.id);
        if (!course) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }
        const { imageKey, previewVideoKey, ...safe } = course as any;
        return safe;
      }),
    
    // Check if user has access to a course
    hasAccess: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ ctx, input }) => {
        const course = await db.getCourseById(input.courseId);
        if (!course) return false;
        
        // Free courses are accessible to all authenticated users
        if (course.isFree) return true;
        
        // Check if user has active membership
        const { canAccessContent } = await import("./membership-products");
        const hasPurchased = await db.hasUserPurchasedCourse(ctx.user.id, input.courseId);
        
        return canAccessContent(
          ctx.user.membershipStatus,
          ctx.user.membershipEndDate,
          course.isFree,
          hasPurchased
        );
      }),
    
    // Get modules with lessons for course learning page — requires course access
    getModulesWithLessons: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Verify user has access to this course before returning full lesson data
        const course = await db.getCourseById(input.courseId);
        if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
        if (!course.isFree) {
          const hasAccess = await db.userHasCourseAccess(ctx.user.id, input.courseId);
          if (!hasAccess) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this course" });
        }
        const modules = await db.getCourseModulesWithLessons(input.courseId);
        // Strip raw video URLs — clients must use getVideoPlaybackUrl for signed URLs
        return modules.map((m: any) => ({
          ...m,
          lessons: (m.lessons || []).map((l: any) => {
            const { videoUrl, videoKey, bunnyVideoId, ...safeLes } = l;
            return { ...safeLes, hasVideo: !!(videoUrl || bunnyVideoId) };
          }),
        }));
      }),

    // Public curriculum overview — shows module/lesson titles + metadata but no video URLs
    getPublicCurriculum: publicProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ input }) => {
        const modules = await db.getCourseModulesWithLessons(input.courseId);
        // Strip sensitive data, keep only what's needed for the landing page
        return modules.map((m: any) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          lessons: (m.lessons || []).map((l: any) => ({
            id: l.id,
            title: l.title,
            durationSeconds: l.durationSeconds,
            isFree: l.isFree,
          })),
        }));
      }),
    
    // Get user progress for a course
    getUserProgress: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getUserCourseProgress(ctx.user.id, input.courseId);
      }),

    getLessonProgress: protectedProcedure
      .input(z.object({ lessonId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getLessonProgress(ctx.user.id, input.lessonId);
      }),

    // Student dashboard — one call for all dashboard data
    getDashboardData: protectedProcedure.query(async ({ ctx }) => {
      const userId = ctx.user.id;

      // 1. Get all user's data in parallel
      const [purchases, allCourses, allProgress, upcomingSessions, bookings] = await Promise.all([
        db.getUserPurchases(userId),
        db.getAllPublishedCourses(),
        db.getAllUserProgress(userId),
        db.getUpcomingLiveSessions(5),
        db.getUserBookingsWithSlots(userId),
      ]);

      const purchasedIds = new Set(
        purchases.filter((p: any) => p.status === 'completed').map((p: any) => p.courseId)
      );

      // Enrolled = purchased + free courses
      const enrolledIds = new Set<number>();
      const enrolledCourses = allCourses.filter((c: any) => {
        const enrolled = c.isFree || purchasedIds.has(c.id);
        if (enrolled) enrolledIds.add(c.id);
        return enrolled;
      });

      // Recommended = published courses the user hasn't enrolled in
      const recommendedCourses = allCourses
        .filter((c: any) => !enrolledIds.has(c.id))
        .slice(0, 4);

      // 2. Per-course progress
      const courseProgress = enrolledCourses.map((course: any) => {
        const courseModuleProgress = allProgress.filter((p: any) => p.courseId === course.id);
        const completedCount = courseModuleProgress.filter((p: any) => p.isCompleted).length;
        return {
          ...course,
          completedLessons: completedCount,
        };
      });

      // 3. Continue watching — most recently watched lesson
      const recentProgress = allProgress
        .filter((p: any) => p.lastWatchedAt && !p.isCompleted && p.watchedDuration > 0)
        .sort((a: any, b: any) =>
          new Date(b.lastWatchedAt).getTime() - new Date(a.lastWatchedAt).getTime()
        );

      let continueWatching = null;
      if (recentProgress.length > 0) {
        const recent = recentProgress[0];
        const lesson = await db.getLessonById(recent.lessonId);
        const course = allCourses.find((c: any) => c.id === recent.courseId);
        if (lesson && course) {
          continueWatching = {
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            courseId: course.id,
            courseTitle: course.title,
            thumbnailUrl: lesson.bunnyThumbnailUrl || course.imageUrl,
            watchedDuration: recent.watchedDuration,
            totalDuration: lesson.durationSeconds || 0,
            lastWatchedAt: recent.lastWatchedAt,
          };
        }
      }

      // 4. Stats + streak (consecutive days with activity)
      const totalCompleted = allProgress.filter((p: any) => p.isCompleted).length;

      // Calculate streak: count consecutive days backwards from today where user had activity
      let streakDays = 0;
      const activityDates = new Set(
        allProgress
          .filter((p: any) => p.lastWatchedAt)
          .map((p: any) => new Date(p.lastWatchedAt).toISOString().slice(0, 10))
      );
      const today = new Date();
      for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        if (activityDates.has(key)) {
          streakDays++;
        } else if (i > 0) {
          break; // gap found (skip today check to allow "not yet active today")
        }
      }

      // Total watch time in minutes
      const totalWatchMinutes = Math.round(
        allProgress.reduce((sum: number, p: any) => sum + (p.watchedDuration || 0), 0) / 60
      );

      // Filter upcoming bookings (sessions in the future)
      const now = new Date();
      const upcomingBookings = (bookings as any[])
        .filter((b: any) => b.status !== 'cancelled' && b.slotStartTime && new Date(b.slotStartTime) > now)
        .sort((a: any, b: any) => new Date(a.slotStartTime).getTime() - new Date(b.slotStartTime).getTime())
        .slice(0, 5);

      return {
        continueWatching,
        courses: courseProgress,
        recommendedCourses,
        upcomingSessions,
        upcomingBookings,
        stats: {
          totalCompleted,
          enrolledCourses: enrolledCourses.length,
          streakDays,
          totalWatchMinutes,
        },
      };
    }),

    // Check if user has access (alias for hasAccess)
    checkAccess: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ ctx, input }) => {
        const course = await db.getCourseById(input.courseId);
        if (!course) return false;
        if (course.isFree) return true;
        
        // Check membership or purchase
        const { canAccessContent } = await import("./membership-products");
        const hasPurchased = await db.hasUserPurchasedCourse(ctx.user.id, input.courseId);
        
        return canAccessContent(
          ctx.user.membershipStatus,
          ctx.user.membershipEndDate,
          course.isFree,
          hasPurchased
        );
      }),
    
    // Get signed Bunny.net playback URL for a lesson video
    // Access rules:
    //   - lesson.isFree = true  → any logged-in user can play (preview lessons)
    //   - course.isFree = true  → any logged-in user can play all lessons
    //   - otherwise             → requires course purchase OR active membership
    getVideoPlaybackUrl: protectedProcedure
      .input(z.object({ lessonId: z.number(), courseId: z.number() }))
      .query(async ({ ctx, input }) => {
        const course = await db.getCourseById(input.courseId);
        if (!course) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Course not found' });
        }

        const lesson = await db.getLessonById(input.lessonId);
        if (!lesson) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
        }

        // Verify the lesson actually belongs to the specified course (prevents IDOR bypass)
        const modules = await db.getCourseModulesWithLessons(input.courseId);
        const lessonBelongsToCourse = modules.some((m: any) =>
          m.lessons?.some((l: any) => l.id === input.lessonId)
        );
        if (!lessonBelongsToCourse) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lesson does not belong to this course' });
        }

        // Free/preview lessons and free courses skip purchase checks
        let hasAccess = lesson.isFree || course.isFree;

        if (!hasAccess) {
          const { canAccessContent } = await import("./membership-products");
          const hasPurchased = await db.hasUserPurchasedCourse(ctx.user.id, input.courseId);
          hasAccess = canAccessContent(
            ctx.user.membershipStatus,
            ctx.user.membershipEndDate,
            course.isFree,
            hasPurchased
          );
        }

        if (!hasAccess) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You need to purchase this course or have an active membership to watch this video.',
          });
        }

        if (lesson.bunnyVideoId && lesson.videoStatus === 'ready') {
          const bunny = await import('./lib/bunny');
          const url = await bunny.getSignedPlaybackUrl(lesson.bunnyVideoId);
          return { url, type: 'hls' as const, thumbnailUrl: lesson.bunnyThumbnailUrl };
        }

        if (lesson.videoUrl) {
          return { url: lesson.videoUrl, type: 'direct' as const, thumbnailUrl: null };
        }

        throw new TRPCError({ code: 'NOT_FOUND', message: 'No video available for this lesson' });
      }),

    // Public preview playback — no login required for isFree lessons
    getPreviewPlaybackUrl: publicProcedure
      .input(z.object({ lessonId: z.number(), courseId: z.number() }))
      .query(async ({ input }) => {
        const lesson = await db.getLessonById(input.lessonId);
        if (!lesson) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lesson not found' });
        }

        if (!lesson.isFree) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'This lesson requires a course purchase or membership.',
          });
        }

        if (lesson.bunnyVideoId && lesson.videoStatus === 'ready') {
          const bunny = await import('./lib/bunny');
          const url = await bunny.getSignedPlaybackUrl(lesson.bunnyVideoId);
          return { url, type: 'hls' as const, thumbnailUrl: lesson.bunnyThumbnailUrl };
        }

        if (lesson.videoUrl) {
          return { url: lesson.videoUrl, type: 'direct' as const, thumbnailUrl: null };
        }

        throw new TRPCError({ code: 'NOT_FOUND', message: 'No video available' });
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
    
    // Mark course as completed
    markComplete: protectedProcedure
      .input(z.object({
        courseId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { markCourseComplete } = await import("./db-course-completion");
        return await markCourseComplete(ctx.user.id, input.courseId);
      }),
    
    // Check if course is completed
    isCompleted: protectedProcedure
      .input(z.object({
        courseId: z.number(),
      }))
      .query(async ({ ctx, input }) => {
        const { isCourseCompleted } = await import("./db-course-completion");
        return await isCourseCompleted(ctx.user.id, input.courseId);
      }),

    // Get certificate data for a completed course
    getCertificateData: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .query(async ({ ctx, input }) => {
        const purchase = await db.getUserPurchaseForCourse(ctx.user.id, input.courseId);
        if (!purchase?.isCompleted || !purchase.certificateId) return null;

        const course = await db.getCourseById(input.courseId);
        const user = await db.getUserById(ctx.user.id);
        if (!course || !user) return null;

        const { getCertificateShareData } = await import("./lib/certificate");
        return getCertificateShareData({
          studentName: user.name || user.email || "Student",
          courseTitle: course.title,
          completionDate: purchase.completedAt || new Date(),
          certificateId: purchase.certificateId,
        });
      }),

    // Generate and return PDF certificate bytes (base64 encoded)
    downloadCertificate: protectedProcedure
      .input(z.object({ courseId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const purchase = await db.getUserPurchaseForCourse(ctx.user.id, input.courseId);
        if (!purchase?.isCompleted || !purchase.certificateId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No certificate available" });
        }

        const course = await db.getCourseById(input.courseId);
        const user = await db.getUserById(ctx.user.id);
        if (!course || !user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Course or user not found" });
        }

        const { generateCertificatePDF } = await import("./lib/certificate");
        const pdfBytes = await generateCertificatePDF({
          studentName: user.name || user.email || "Student",
          courseTitle: course.title,
          completionDate: purchase.completedAt || new Date(),
          certificateId: purchase.certificateId,
        });

        // Return as base64 for client-side download
        return {
          pdfBase64: Buffer.from(pdfBytes).toString("base64"),
          filename: `certificate-${course.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.pdf`,
        };
      }),
  }),

  // User purchase procedures
  purchases: router({
    myPurchases: protectedProcedure.query(async ({ ctx }) => {
      const purchases = await db.getUserPurchases(ctx.user.id);
      // Strip Stripe internal IDs from client response
      return purchases.map((p: any) => {
        const { stripePaymentId, ...safe } = p;
        return safe;
      });
    }),
    
    createCheckoutSession: protectedProcedure
      .input(z.object({
        courseId: z.number(),
        discountCode: z.string().optional(),
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

        if (!stripe) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Payment system not configured' });

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
            discountCode: input.discountCode || '',
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
      
      // Delete a module (also cleans up Bunny videos for all lessons in the module)
      deleteModule: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          // Clean up Bunny videos for all lessons in this module
          try {
            const bunny = await import('./lib/bunny');
            const lessons = await db.getLessonsByModuleId(input.id);
            await Promise.allSettled(
              lessons
                .filter((l: any) => l.bunnyVideoId)
                .map((l: any) => bunny.deleteVideo(l.bunnyVideoId))
            );
          } catch (e) {
            console.warn("[Bunny] Failed to clean up module videos:", (e as Error).message);
          }
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
      
      // Delete a lesson (also cleans up Bunny video if present)
      deleteLesson: adminProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          // Fetch lesson first to check for Bunny video
          const lesson = await db.getLessonById(input.id);
          if (lesson?.bunnyVideoId) {
            try {
              const bunny = await import('./lib/bunny');
              await bunny.deleteVideo(lesson.bunnyVideoId);
            } catch (e) {
              console.warn("[Bunny] Failed to delete video:", (e as Error).message);
              // Continue with lesson deletion even if Bunny cleanup fails
            }
          }
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
          sessionLink: z.string().optional(), // Zoom Meeting ID
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
            zoomMeetingId: input.sessionLink, // Store Zoom Meeting ID
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
    purchases: router({
      list: adminProcedure.query(async () => {
        return await db.getPurchasesWithDetails();
      }),
    }),

    bookings: router({
      list: adminProcedure.query(async () => {
        return await db.getBookingsWithDetails();
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
          // Only allow reading public-facing settings (hero images, display content)
          const publicKeys = [
            'heroBackgroundUrl', 'backgroundAnimationUrl', 'backgroundVideoUrl',
            'heroProfilePictureUrl', 'siteName', 'siteDescription',
          ];
          if (!publicKeys.includes(input.key)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Setting not publicly accessible' });
          }
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
      
      // Get pending testimonials count
      pendingCount: adminProcedure.query(async () => {
        const testimonials = await db.getAllTestimonials();
        return testimonials.filter(t => t.status === 'pending').length;
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

      newUserCount: adminProcedure.query(async () => {
        return await db.getNewUserCount();
      }),

      markUserViewed: adminProcedure
        .input(z.object({ userId: z.number() }))
        .mutation(async ({ input }) => {
          await db.markUserViewedByAdmin(input.userId);
          return { success: true };
        }),

      markAllUsersViewed: adminProcedure
        .mutation(async () => {
          await db.markAllUsersViewedByAdmin();
          return { success: true };
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
          // Only allow reading public display content (headings, text)
          const publicContentKeys = [
            'hero_title', 'hero_tagline', 'courses_heading', 'testimonials_heading',
            'about_text', 'footer_text',
          ];
          if (!publicContentKeys.includes(input.key)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Content key not publicly accessible' });
          }
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

      // Upload lesson video to Bunny.net Stream — full pipeline:
      //   1. Create Bunny video object
      //   2. Upload file to Bunny
      //   3. Extract duration locally with ffprobe
      //   4. Generate thumbnail locally with ffmpeg
      //   5. Upload thumbnail to storage
      //   6. Save everything to DB
      // Bunny encoding happens in background; pollBunnyVideoStatus tracks it.
      uploadLessonToBunny: adminProcedure
        .input(z.object({
          lessonId: z.number(),
          title: z.string(),
          data: z.string(), // base64 encoded video
        }))
        .mutation(async ({ input }) => {
          const bunny = await import('./lib/bunny');
          const buffer = Buffer.from(input.data, 'base64');

          // 1. Create video object in Bunny
          const video = await bunny.createVideo(input.title);
          await db.updateCourseLesson(input.lessonId, {
            bunnyVideoId: video.guid,
            videoStatus: 'uploading',
          });

          // 2. Upload file to Bunny
          try {
            await bunny.uploadVideoFile(video.guid, buffer);
          } catch (err) {
            await db.updateCourseLesson(input.lessonId, { videoStatus: 'failed' });
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Video upload to Bunny failed: ${(err as Error).message}`,
            });
          }

          await db.updateCourseLesson(input.lessonId, { videoStatus: 'processing' });

          // 3. Extract duration with ffprobe (local, fast)
          let durationSeconds = 0;
          try {
            const { getVideoDuration } = await import('./lib/videoProcessing');
            durationSeconds = await getVideoDuration(buffer);
          } catch (err) {
            console.warn("[ffprobe] Duration extraction failed, will use Bunny's value:", (err as Error).message);
          }

          // 4. Generate thumbnail with ffmpeg (local, fast)
          let thumbnailUrl = bunny.getThumbnailUrl(video.guid); // Bunny default fallback
          try {
            const { generateThumbnail } = await import('./lib/videoProcessing');
            const thumb = await generateThumbnail(buffer, 10);
            // Upload thumbnail to storage
            const { storagePut } = await import('./storage');
            const thumbKey = `thumbnails/lessons/${input.lessonId}/${video.guid}.jpg`;
            const stored = await storagePut(thumbKey, thumb.buffer, thumb.contentType);
            thumbnailUrl = stored.url;
          } catch (err) {
            console.warn("[ffmpeg] Thumbnail generation failed, using Bunny default:", (err as Error).message);
            // thumbnailUrl stays as Bunny's auto-generated one
          }

          // 5. Save metadata to DB
          await db.updateCourseLesson(input.lessonId, {
            videoStatus: 'processing', // Bunny is still encoding
            bunnyThumbnailUrl: thumbnailUrl,
            ...(durationSeconds > 0 ? { durationSeconds } : {}),
          });

          return {
            bunnyVideoId: video.guid,
            thumbnailUrl,
            durationSeconds,
            status: 'processing' as const,
          };
        }),

      // Poll Bunny.net video encoding status and update lesson when ready
      pollBunnyVideoStatus: adminProcedure
        .input(z.object({ lessonId: z.number() }))
        .query(async ({ input }) => {
          const lesson = await db.getLessonById(input.lessonId);
          if (!lesson?.bunnyVideoId) {
            return { status: 'pending' as const, encodeProgress: 0, durationSeconds: 0 };
          }

          const bunny = await import('./lib/bunny');
          const video = await bunny.getVideo(lesson.bunnyVideoId);
          const status = bunny.statusLabel(video.status);

          // If finished, update lesson with duration and final status
          if (status === 'ready' && lesson.videoStatus !== 'ready') {
            const updates: Record<string, any> = {
              videoStatus: 'ready',
              bunnyThumbnailUrl: lesson.bunnyThumbnailUrl || bunny.getThumbnailUrl(lesson.bunnyVideoId),
            };
            // Use Bunny's duration if we don't have one from ffprobe
            if (!lesson.durationSeconds || lesson.durationSeconds === 0) {
              updates.durationSeconds = Math.round(video.length);
            }
            await db.updateCourseLesson(input.lessonId, updates);
          }

          if (status === 'failed' && lesson.videoStatus !== 'failed') {
            await db.updateCourseLesson(input.lessonId, { videoStatus: 'failed' });
          }

          return {
            status,
            encodeProgress: video.encodeProgress,
            durationSeconds: lesson.durationSeconds || Math.round(video.length),
          };
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

  // Google Meet integration
  meet: router({
    // Generate Meet link for a session (admin only)
    generateLink: adminProcedure
      .input(z.object({
        slotId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const { slotId } = input;
        
        const slot = await db.getAvailabilitySlotById(slotId);
        if (!slot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
        }
        
        // Generate Google Meet link
        const meetLink = generateMeetLink();
        
        // Update availability slot with Meet link
        await db.updateAvailabilitySlot(slotId, {
          meetLink,
        });
        
        return {
          success: true,
          meetLink,
        };
      }),
    
    // Remove Meet link from a session (admin only)
    removeLink: adminProcedure
      .input(z.object({
        slotId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const slot = await db.getAvailabilitySlotById(input.slotId);
        if (!slot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
        }
        
        // Clear Meet link from slot
        await db.updateAvailabilitySlot(input.slotId, {
          meetLink: null,
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
        
        // Strip sensitive fields from public response
        return slots.map((slot: any) => {
          const { sessionLink, meetLink, zoomMeetingId, ...safe } = slot;
          return safe;
        });
      }),

    // Create a booking (free sessions, or paid sessions with valid discount code)
    create: protectedProcedure
      .input(z.object({
        slotId: z.number(),
        notes: z.string().optional(),
        discountCode: z.string().max(20).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if slot exists and is available
        const slot = await db.getAvailabilitySlotById(input.slotId);
        if (!slot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Time slot not found' });
        }

        // If session is paid, check for valid discount code
        let usedDiscountCode = false;
        if (!slot.isFree && input.discountCode) {
          // Session must have allowDiscountCodes enabled
          if (!(slot as any).allowDiscountCodes) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'This session does not accept discount codes' });
          }
          if (slot.eventType !== 'in-person') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Discount codes are only for in-person sessions' });
          }

          // Validate and redeem the code
          const { sessionDiscountCodes } = await import("../drizzle/schema");
          const { eq, and, isNull } = await import("drizzle-orm");
          const { db: drizzleDb } = await import("./db");
          const code = input.discountCode.toUpperCase();
          const codeRows = await drizzleDb
            .select()
            .from(sessionDiscountCodes)
            .where(and(
              eq(sessionDiscountCodes.code, code),
              eq(sessionDiscountCodes.isActive, true),
              isNull(sessionDiscountCodes.usedByUserId),
            ))
            .limit(1);

          if (codeRows.length === 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid, expired, or already used discount code' });
          }
          const discount = codeRows[0];
          if (discount.expiresAt && new Date() > discount.expiresAt) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Discount code has expired' });
          }

          // Atomic redeem
          await drizzleDb
            .update(sessionDiscountCodes)
            .set({ usedByUserId: ctx.user.id, usedAt: new Date() })
            .where(and(eq(sessionDiscountCodes.id, discount.id), isNull(sessionDiscountCodes.usedByUserId)));

          usedDiscountCode = true;
        } else if (!slot.isFree && !input.discountCode) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'This session requires payment. Use the payment flow or enter a discount code.' });
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
        
        // Generate Google Meet link for online sessions
        const meetLink = slot.eventType === 'online' 
          ? generateMeetLink()
          : null;
        
        // Create booking
        const booking = await db.createBooking({
          userId: ctx.user.id,
          slotId: input.slotId,
          sessionType: slot.title,
          meetLink: meetLink || undefined,
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

        if (!process.env.STRIPE_SECRET_KEY) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Payment system not configured' });
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' });

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
          cancel_url: `${origin}/book-session?canceled=true`,
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
      return await db.getUserBookingsWithSlots(ctx.user.id);
    }),
    
    // Get session detail by booking ID (with enrollment verification)
    getSessionDetail: protectedProcedure
      .input(z.object({ bookingId: z.number() }))
      .query(async ({ ctx, input }) => {
        const booking = await db.getBookingById(input.bookingId);
        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
        }
        
        // Verify user is enrolled in this session
        if (booking.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not enrolled in this session' });
        }
        
        // Get slot details
        const slot = await db.getAvailabilitySlotById(booking.slotId);
        if (!slot) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Session details not found' });
        }
        
        return {
          booking,
          slot,
        };
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
        message: z.string().min(1).max(2000),
        history: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().max(4000),
        })).max(20).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user?.id ?? null;

        // Save user message (non-blocking — don't let DB failure block the chat)
        db.createChatMessage({ userId, role: 'user', content: input.message }).catch(() => {});

        // Build conversation context — Elizabeth's warm, encouraging personality
        const systemPrompt = `You are Elizabeth Zolotova's friendly assistant on her dance platform. You speak with warmth, passion, and a touch of glamour — just like Elizabeth herself on her Instagram @elizabeth_zolotova.

Your personality:
- Warm, encouraging, and genuinely excited about dance
- Use a conversational, feminine tone — like chatting with a supportive friend
- Keep answers SHORT and concise (2-4 sentences max)
- Sprinkle in occasional emojis but don't overdo it (1-2 per message max)
- Always gently guide the conversation toward trying a course or booking a session

About Elizabeth & the platform:
- Elizabeth Zolotova is a professional high heels dancer and teacher
- She teaches both online and in-person classes (private 1-on-1 and group sessions)
- Courses range from beginner-friendly to advanced choreography
- There are free courses to get started and premium courses for deeper learning
- Sessions can be booked directly on the website
- Website: www.elizabeth-zolotova.com

IMPORTANT RULES:
- For website pages, use markdown links: [Courses](/courses), [Book a Session](/book-session)
- For social media, use these EXACT placeholders (the system will replace them with real links):
  - {{INSTAGRAM}} for Elizabeth's Instagram
  - {{YOUTUBE}} for Elizabeth's YouTube
  - {{FACEBOOK}} for Elizabeth's Facebook
  - {{COURSES}} for the Courses page
  - {{BOOK}} for the Book a Session page
  - {{WEBSITE}} for the main website
- NEVER write out any URLs or paths yourself — not even relative paths like /courses. ALWAYS use the placeholders above instead.
- NEVER use markdown link syntax with URLs. Only use placeholders.
- Keep all responses SHORT — 2-4 sentences max

When someone asks about:
- Courses → Use {{COURSES}} placeholder, mention free ones to start
- Booking → Use {{BOOK}} placeholder, highlight flexibility
- Pricing → Be transparent, mention free options, use {{COURSES}}
- Videos/content → Use {{YOUTUBE}} and {{INSTAGRAM}} placeholders
- The website → Use {{WEBSITE}} placeholder
- Experience level → Be encouraging! Everyone starts somewhere

If you don't know a specific detail, guide them to the website or suggest reaching out to Elizabeth directly.

Never be pushy. Be genuinely helpful and make people feel welcome.`;

        const messages = [
          { role: 'system' as const, content: systemPrompt },
          ...(input.history || []).map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
          { role: 'user' as const, content: input.message },
        ];
        
        // Get AI response — never throw to client, always return a message
        let assistantMessage: string;
        try {
          const response = await invokeLLM({ messages });
          const content = response.choices[0]?.message?.content;
          assistantMessage = typeof content === 'string' && content.trim()
            ? content
            : "I'd love to help! You can browse our courses or book a session directly on the website. Feel free to ask me anything about dance classes!";
        } catch (llmError: any) {
          console.error("[Chat] LLM error:", llmError.message);
          assistantMessage = "Thanks for reaching out! I'm having a little moment — but you can explore our courses or book a dance session right from the menu above. Elizabeth would love to dance with you!";
        }
        
        // ── Nuclear cleanup: strip ALL broken links, then inject correct ones ──

        // 1. Remove every markdown link (Gemini can't be trusted with URLs — they always get blocked)
        //    [any text](any url possibly with [blocked] inside) → just keep the text
        assistantMessage = assistantMessage.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

        // 2. Remove all [blocked] tags wherever they appear
        assistantMessage = assistantMessage.replace(/\s*\[blocked\]/gi, '');

        // 3. Remove leftover {{PLACEHOLDER}} tags (in case Gemini used them literally)
        assistantMessage = assistantMessage.replace(/\{\{[A-Z_]+\}\}/g, '');

        // 4. Clean up double spaces left behind
        assistantMessage = assistantMessage.replace(/  +/g, ' ').trim();

        // 5. Inject real links by replacing the LAST occurrence of each keyword
        //    (the last match is most likely the extracted link text, not natural prose)
        //    Group by topic so "course page" and "courses" don't both trigger
        const linkGroups: { patterns: RegExp[]; link: string }[] = [
          { patterns: [/\bcourses? page\b/i, /\bcourses?\b/i], link: '[Courses](/courses)' },
          { patterns: [/\bbook(?:ing)?(?:\s+a)?\s+session\b/i], link: '[Book a Session](/book-session)' },
          { patterns: [/\binstagram\b/i], link: '[Instagram](https://www.instagram.com/elizabeth_zolotova/)' },
          { patterns: [/\byoutube\b/i], link: '[YouTube](https://www.youtube.com/@HighHeelsTutorials)' },
          { patterns: [/\bfacebook\b/i], link: '[Facebook](https://www.facebook.com/liza.zolotova.399/)' },
          { patterns: [/\b(?:website|elizabeth-zolotova)\b/i], link: '[our website](https://www.elizabeth-zolotova.com)' },
        ];

        for (const group of linkGroups) {
          let bestMatch: { index: number; length: number } | null = null;
          for (const pattern of group.patterns) {
            const matches = [...assistantMessage.matchAll(new RegExp(pattern.source, 'gi'))];
            if (matches.length > 0) {
              const last = matches[matches.length - 1];
              if (!bestMatch || last.index! > bestMatch.index) {
                bestMatch = { index: last.index!, length: last[0].length };
              }
            }
          }
          if (bestMatch) {
            assistantMessage =
              assistantMessage.slice(0, bestMatch.index) +
              group.link +
              assistantMessage.slice(bestMatch.index + bestMatch.length);
          }
        }

        // 6. If "courses" was mentioned but no link was injected, append a helpful link footer
        const hasCoursesLink = assistantMessage.includes('[Courses]') || assistantMessage.includes('(/courses)');
        const hasBookingLink = assistantMessage.includes('[Book') || assistantMessage.includes('(/book-session)');
        const mentionsCourses = /\bcourses?\b/i.test(assistantMessage);
        const mentionsBooking = /\bbook|session|class\b/i.test(assistantMessage);

        const footerLinks: string[] = [];
        if (mentionsCourses && !hasCoursesLink) {
          footerLinks.push('[Browse Courses](/courses)');
        }
        if (mentionsBooking && !hasBookingLink) {
          footerLinks.push('[Book a Session](/book-session)');
        }
        if (footerLinks.length > 0) {
          assistantMessage += '\n\n' + footerLinks.join(' · ');
        }

        // Save assistant message (non-blocking)
        db.createChatMessage({ userId, role: 'assistant', content: assistantMessage }).catch(() => {});

        return { message: assistantMessage };
      }),
    
    history: protectedProcedure.query(async ({ ctx }) => {
      return await db.getChatHistory(ctx.user.id);
    }),
  }),



  // Testimonials
  testimonials: router({
    // Public: Get approved testimonials for homepage (strip PII)
    list: publicProcedure.query(async () => {
      const testimonials = await db.getApprovedTestimonials();
      return testimonials.map(({ userEmail, ...safe }) => safe);
    }),

    // Public: Get approved video testimonials for gallery (strip PII)
    videoTestimonials: publicProcedure.query(async () => {
      const testimonials = await db.getApprovedTestimonials();
      return testimonials.filter(t => t.videoUrl).map(({ userEmail, ...safe }) => safe);
    }),

    // Upload testimonial media (photo or video) — user-level, not admin
    uploadTestimonialMedia: protectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileType: z.string(),
        fileData: z.string(), // base64
      }))
      .mutation(async ({ ctx, input }) => {
        const { storagePut } = await import('./storage');
        const buffer = Buffer.from(input.fileData, 'base64');

        // Max 50MB
        if (buffer.length > 200 * 1024 * 1024) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'File must be under 200MB' });
        }

        const timestamp = Date.now();
        const safe = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '');
        const key = `testimonials/${ctx.user.id}/${timestamp}-${safe}`;
        const result = await storagePut(key, buffer, input.fileType);
        return { url: result.url };
      }),

    // Protected: Submit course completion testimonial
    submitCourseTestimonial: protectedProcedure
      .input(z.object({
        courseId: z.number(),
        rating: z.number().min(1).max(5),
        content: z.string().min(10),
        photoUrl: z.string().optional(),
        videoUrl: z.string().optional(),
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
          photoUrl: input.photoUrl,
          videoUrl: input.videoUrl,
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
        filename: z.string().max(200),
        contentType: z.string().max(100),
        data: z.string(), // base64 encoded
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import('./storage');

        // Decode and validate size (50MB max)
        const buffer = Buffer.from(input.data, 'base64');
        if (buffer.length > 200 * 1024 * 1024) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'File must be under 200MB' });
        }

        // Validate content type
        const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(input.contentType)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid file type' });
        }

        // Sanitize filename — strip path traversal and special chars
        const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '');
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(7);
        const fileKey = `testimonials/${timestamp}-${randomSuffix}-${safeName}`;

        const result = await storagePut(fileKey, buffer, input.contentType);
        return { url: result.url, key: fileKey };
      }),
  }),

  // Messages router
  messages: router({
    // Protected: Get user's messages
    myMessages: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserMessages(ctx.user.id);
    }),

    // Protected: Get unread message count
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUnreadMessageCount(ctx.user.id);
    }),

    // Protected: Mark message as read
    markAsRead: protectedProcedure
      .input(z.object({ messageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        return await db.markMessageAsRead(input.messageId, ctx.user.id);
      }),

    // Protected: Get conversations grouped by sender/recipient
    conversations: protectedProcedure.query(async ({ ctx }) => {
      return await db.getConversations(ctx.user.id);
    }),

    // Protected: Get full conversation thread with another user
    thread: protectedProcedure
      .input(z.object({ otherUserId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getConversationThread(ctx.user.id, input.otherUserId);
      }),

    // Protected: Send message to user (can be used by both users and admins)
    send: protectedProcedure
      .input(z.object({
        toUserId: z.number(),
        subject: z.string().min(1).max(255),
        body: z.string().min(1).max(10000),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.toUserId === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot message yourself' });
        }
        return await db.createMessage({
          fromUserId: ctx.user.id,
          toUserId: input.toUserId,
          subject: input.subject,
          body: input.body,
        });
      }),

    // Admin: Send message to user
    sendToUser: adminProcedure
      .input(z.object({
        toUserId: z.number(),
        subject: z.string().min(1).max(255),
        body: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        return await db.createMessage({
          fromUserId: ctx.user.id,
          toUserId: input.toUserId,
          subject: input.subject,
          body: input.body,
        });
      }),
  }),

  // Unified Sessions Admin Menu
  sessions: router({    // List all sessions with enrollment counts (admin only)
    list: adminProcedure.query(async () => {
      return await db.getAllSessionsWithEnrollmentCounts();
    }),

    // Get single session with full details
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const session = await db.getAvailabilitySlotById(input.id);
        if (!session) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
        }
        const enrollments = await db.getSessionEnrollments(input.id);
        return { ...session, enrollments };
      }),

    // Create new session
    create: adminProcedure
      .input(z.object({
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        startTime: z.date(),
        endTime: z.date(),
        eventType: z.enum(["online", "in-person"]),
        location: z.string().optional(),
        sessionLink: z.string().optional().refine((val) => !val || val === '' || z.string().url().safeParse(val).success, {
          message: 'Invalid URL format'
        }),
        isFree: z.boolean().default(true),
        price: z.string().optional(),
        sessionType: z.enum(["private", "group"]).default("private"),
        capacity: z.number().int().min(1).default(1),
        status: z.enum(["draft", "published"]).default("published"),
        allowDiscountCodes: z.boolean().default(false),
      }))
      .mutation(async ({ input }) => {
        // Auto-generate Google Meet link if empty for online sessions
        let sessionLink = input.sessionLink;
        if (input.eventType === 'online' && (!sessionLink || sessionLink === '')) {
          const { generateMeetLink } = await import('./meet');
          sessionLink = generateMeetLink();
        }
        
        // Validation: in-person sessions must have a location if published
        if (input.status === 'published' && input.eventType === 'in-person' && !input.location) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'In-person sessions must have a location before publishing' 
          });
        }

        return await db.createAvailabilitySlot({
          ...input,
          sessionLink,
          currentBookings: 0,
          isBooked: false,
        });
      }),

    // Update existing session
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        eventType: z.enum(["online", "in-person"]).optional(),
        location: z.string().optional(),
        sessionLink: z.string().optional().refine((val) => !val || val === '' || z.string().url().safeParse(val).success, {
          message: 'Invalid URL format'
        }),
        isFree: z.boolean().optional(),
        price: z.string().optional(),
        sessionType: z.enum(["private", "group"]).optional(),
        capacity: z.number().int().min(1).optional(),
        status: z.enum(["draft", "published"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        
        // Get current session to validate
        const session = await db.getAvailabilitySlotById(id);
        if (!session) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
        }

        // Merge with existing values for validation
        const merged = { ...session, ...updates };
        
        // Validation: online sessions must have a link if published
        if (merged.status === 'published' && merged.eventType === 'online' && !merged.sessionLink) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Online sessions must have a session link before publishing' 
          });
        }
        
        // Validation: in-person sessions must have a location if published
        if (merged.status === 'published' && merged.eventType === 'in-person' && !merged.location) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'In-person sessions must have a location before publishing' 
          });
        }

        await db.updateAvailabilitySlot(id, updates);
        return { success: true };
      }),

    // Delete session
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // Check if session has enrollments
        const enrollments = await db.getSessionEnrollments(input.id);
        if (enrollments.length > 0) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: `Cannot delete session with ${enrollments.length} active enrollment(s). Remove enrollments first.` 
          });
        }
        
        await db.deleteAvailabilitySlot(input.id);
        return { success: true };
      }),

    // Update session status (draft/published)
    updateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "published"]),
      }))
      .mutation(async ({ input }) => {
        const session = await db.getAvailabilitySlotById(input.id);
        if (!session) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found' });
        }

        // Validation before publishing
        if (input.status === 'published') {
          if (session.eventType === 'online' && !session.sessionLink) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'Online sessions must have a session link before publishing' 
            });
          }
          if (session.eventType === 'in-person' && !session.location) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'In-person sessions must have a location before publishing' 
            });
          }
        }

        await db.updateAvailabilitySlot(input.id, { status: input.status });
        return { success: true };
      }),

    // Get enrollments for a session
    getEnrollments: adminProcedure
      .input(z.object({ sessionId: z.number() }))
      .query(async ({ input }) => {
        return await db.getSessionEnrollments(input.sessionId);
      }),

    // Add users to session (bulk)
    addUsers: adminProcedure
      .input(z.object({
        sessionId: z.number(),
        userIds: z.array(z.number()).min(1),
      }))
      .mutation(async ({ input }) => {
        await db.addUsersToSession(input.sessionId, input.userIds);
        return { success: true };
      }),

    // Remove users from session (bulk)
    removeUsers: adminProcedure
      .input(z.object({
        sessionId: z.number(),
        userIds: z.array(z.number()).min(1),
      }))
      .mutation(async ({ input }) => {
        await db.removeUsersFromSession(input.sessionId, input.userIds);
        return { success: true };
      }),
  }),

  blog: blogRouter,
  newsletter: newsletterRouter,
  adminBlog: adminBlogRouter,
});

export type AppRouter = typeof appRouter;
