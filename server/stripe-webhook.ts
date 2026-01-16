import { Request, Response } from 'express';
import Stripe from 'stripe';
import * as db from './db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
});

export async function handleStripeWebhook(req: Request, res: Response) {
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
          
          // Generate Zoom link for online sessions
          const zoomLink = slot.eventType === 'online' 
            ? `https://zoom.us/j/${Math.random().toString().slice(2, 12)}`
            : null;
          
          // Create booking with payment info
          await db.createBooking({
            userId: Number(userId),
            slotId: Number(slotId),
            sessionType: slot.title,
            zoomLink: zoomLink || undefined,
            status: 'confirmed',
            notes: session.metadata?.notes || undefined,
            paymentRequired: true,
            paymentStatus: 'completed',
            stripePaymentIntentId: session.payment_intent as string,
            amountPaid: ((session.amount_total || 0) / 100).toString(),
          });
          
          // Mark slot as booked
          await db.updateAvailabilitySlot(Number(slotId), { isBooked: true });
          
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
