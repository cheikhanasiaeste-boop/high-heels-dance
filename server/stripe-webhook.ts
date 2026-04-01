import { Request, Response } from 'express';
import Stripe from 'stripe';
import * as db from './db';
import { generateMeetLink } from './meet';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null;

export async function handleStripeWebhook(req: Request, res: Response) {
  if (!stripe) {
    return res.status(503).send('Payment system not configured');
  }

  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('[Webhook] No signature found');
    return res.status(400).send('No signature');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle test events
  if (event.id.startsWith('evt_test_')) {
    console.log('[Webhook] Test event detected, returning verification response');
    return res.json({ 
      verified: true,
    });
  }

  console.log('[Webhook] Event received:', event.type, event.id);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Extract metadata
        const userId = session.metadata?.user_id;
        const courseId = session.metadata?.course_id;
        const slotId = session.metadata?.slot_id;
        
        // Handle course purchase
        if (userId && courseId) {
          const course = await db.getCourseById(Number(courseId));
          if (!course) {
            console.error('[Webhook] Course not found:', courseId);
            break;
          }

          await db.createPurchase({
            userId: Number(userId),
            courseId: Number(courseId),
            amount: course.price,
            stripePaymentId: session.payment_intent as string,
            status: 'completed',
          });

          console.log('[Webhook] Purchase completed:', { userId, courseId });
        }
        
        // Handle session booking payment
        if (userId && slotId) {
          const slot = await db.getAvailabilitySlotById(Number(slotId));
          if (!slot) {
            console.error('[Webhook] Slot not found:', slotId);
            break;
          }
          
          if (slot.isBooked) {
            console.error('[Webhook] Slot already booked:', slotId);
            break;
          }
          
          // Generate Google Meet link for online sessions
          const meetLink = slot.eventType === 'online' 
            ? generateMeetLink()
            : null;
          
          // Create booking with payment info
          await db.createBooking({
            userId: Number(userId),
            slotId: Number(slotId),
            sessionType: slot.title,
            meetLink: meetLink || undefined,
            status: 'confirmed',
            notes: session.metadata?.notes || undefined,
            paymentRequired: true,
            paymentStatus: 'completed',
            stripePaymentIntentId: session.payment_intent as string,
            amountPaid: ((session.amount_total || 0) / 100).toString(),
          });
          
          // Update slot booking status (increment for groups, mark booked for private)
          if (slot.sessionType === 'group') {
            await db.updateAvailabilitySlot(Number(slotId), {
              currentBookings: slot.currentBookings + 1,
            });
          } else {
            await db.updateAvailabilitySlot(Number(slotId), { isBooked: true });
          }
          
          console.log('[Webhook] Session booking completed:', { userId, slotId });
        }
        
        if (!userId || (!courseId && !slotId)) {
          console.error('[Webhook] Missing required metadata in checkout session');
        }
        
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('[Webhook] Payment succeeded:', paymentIntent.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('[Webhook] Payment failed:', paymentIntent.id);
        
        // Update purchase status if exists
        // Note: In production, you'd want to track purchases by payment intent ID
        break;
      }

      default:
        console.log('[Webhook] Unhandled event type:', event.type);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error processing event:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
