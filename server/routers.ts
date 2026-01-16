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
          isFree: z.boolean().optional(),
          isPublished: z.boolean().optional(),
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
});

export type AppRouter = typeof appRouter;
