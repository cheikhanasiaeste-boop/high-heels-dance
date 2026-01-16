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
    
    // Availability management
    availability: router({
      list: adminProcedure.query(async () => {
        return await db.getAllAvailabilitySlots();
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
