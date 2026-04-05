import Stripe from 'stripe';
import { Request, Response } from 'express';
import * as db from '../db';
import * as storeDb from '../storeDb';
import { adminNotifications } from '../events';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null;

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * Stripe webhook handler for subscription and payment events
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  if (!stripe) {
    return res.status(503).send('Payment system not configured');
  }

  if (!webhookSecret) {
    return res.status(503).send('Webhook secret not configured');
  }

  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle test events
  if (event.id.startsWith('evt_test_')) {
    console.log('[Webhook] Test event detected, returning verification response');
    return res.json({ verified: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error(`Webhook processing error: ${error.message}`);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Handle checkout session completion (both subscriptions and one-time payments)
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // Handle store orders
  if (session.metadata?.type === "store_order") {
    await handleStoreOrderCompleted(session);
    return;
  }

  const userId = parseInt(session.client_reference_id || '0');
  const discountCode = session.metadata?.discountCode;
  const courseId = session.metadata?.course_id ? parseInt(session.metadata.course_id) : null;
  const plan = session.metadata?.plan;

  if (!userId) {
    console.error('No user ID in session metadata');
    return;
  }

  // Record discount usage if applicable
  if (discountCode) {
    try {
      const discount = await db.getDiscountCodeByCode(discountCode);
      if (discount) {
        await db.recordDiscountUsage({
          discountCodeId: discount.id,
          userId,
          discountAmount: 0, // Will be calculated from Stripe
          originalAmount: 0,
          finalAmount: 0,
          transactionType: 'subscription',
          transactionId: session.id,
        });
      }
    } catch (error) {
      console.error(`Failed to record discount usage: ${error}`);
    }
  }

  // Handle subscription
  if (plan && (plan === 'monthly' || plan === 'annual')) {
    const subscription = await stripe!.subscriptions.retrieve(session.subscription as string);

    // Update user membership with correct end date from subscription
    await db.setUserMembership(userId, plan as 'monthly' | 'annual', subscription.id);

    console.log(`Membership activated for user ${userId}: ${plan} plan`);
  }

  // Handle course purchase
  if (courseId) {
    const course = await db.getCourseById(courseId);
    if (course) {
      await db.createPurchase({
        userId,
        courseId,
        amount: course.price,
        status: 'completed',
        stripePaymentId: session.id,
      });
      console.log(`Course ${courseId} purchased by user ${userId}`);
    }
  }
}

/**
 * Handle subscription creation
 */
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id ? parseInt(subscription.metadata.user_id) : null;

  if (!userId) {
    console.error('No user ID in subscription metadata');
    return;
  }

  const plan = subscription.metadata?.plan || 'monthly';

  await db.setUserMembership(userId, plan as 'monthly' | 'annual', subscription.id);

  console.log(`Subscription created for user ${userId}: ${subscription.id}`);
}

/**
 * Handle subscription updates (e.g., plan changes, billing updates)
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id ? parseInt(subscription.metadata.user_id) : null;

  if (!userId) {
    console.error('No user ID in subscription metadata');
    return;
  }

  // If subscription is active, update membership
  if (subscription.status === 'active') {
    const plan = subscription.metadata?.plan || 'monthly';
    await db.setUserMembership(userId, plan as 'monthly' | 'annual', subscription.id);
    console.log(`Subscription updated for user ${userId}`);
  }
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id ? parseInt(subscription.metadata.user_id) : null;

  if (!userId) {
    console.error('No user ID in subscription metadata');
    return;
  }

  // Set membership status to free when subscription is canceled
  await db.setUserMembership(userId, 'free');

  console.log(`Subscription canceled for user ${userId}`);
}

/**
 * Handle invoice paid (for recurring subscriptions)
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Get subscription ID from invoice
  const subscriptionId = (invoice as any).subscription as string | undefined;
  const discountCode = (invoice as any).metadata?.discountCode;

  if (!subscriptionId) {
    console.log('Invoice paid but no subscription ID found');
    return;
  }

  // Record discount usage if applicable
  if (discountCode) {
    try {
      const subscription = await stripe!.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.user_id ? parseInt(subscription.metadata.user_id) : null;
      
      if (userId) {
        const discount = await db.getDiscountCodeByCode(discountCode);
        if (discount) {
          await db.recordDiscountUsage({
            discountCodeId: discount.id,
            userId,
            discountAmount: 0,
            originalAmount: 0,
            finalAmount: 0,
            transactionType: 'subscription',
            transactionId: invoice.id,
          });
        }
      }
    } catch (error) {
      console.error(`Failed to record discount usage for invoice: ${error}`);
    }
  }

  console.log(`Invoice paid: ${invoice.id} for subscription ${subscriptionId}`);
}

/**
 * Handle store order completion — create order, decrement stock, clear cart.
 */
async function handleStoreOrderCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata!;

  // Idempotency: check if order already exists
  const existing = await storeDb.getOrderByStripeSession(session.id);
  if (existing) {
    console.log(`[Store] Order for session ${session.id} already exists (#${existing.id}), skipping`);
    return;
  }

  const userId = metadata.user_id ? parseInt(metadata.user_id) : null;
  const discountCode = metadata.discount_code || null;
  const discountAmount = metadata.discount_amount || "0";
  const totalBeforeDiscount = metadata.total_before_discount || "0";
  const shippingCost = metadata.shipping_cost || "0";
  const customerNotes = metadata.customer_notes || null;

  let cartItems = JSON.parse(metadata.cart_items || "[]") as Array<{
    productId: number;
    variantId: number;
    variantKey: string;
    quantity: number;
    unitPrice: number;
  }>;

  // Fallback: if cart_items was too large to fit in Stripe metadata (capped to ""),
  // reload the frozen snapshot from the user's current DB cart.
  if (cartItems.length === 0 && userId) {
    const dbCart = await storeDb.getCartItems(userId);
    cartItems = dbCart.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      variantKey: i.variantKey,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    }));
  }

  // Extract shipping from Stripe session
  const shipping = (session as any).shipping_details;
  const address = shipping?.address;

  const order = await storeDb.createOrder(
    {
      userId,
      email: session.customer_email || session.customer_details?.email || "unknown@email.com",
      status: "paid",
      currency: "EUR",
      shippingName: shipping?.name || "N/A",
      shippingAddress: [address?.line1, address?.line2].filter(Boolean).join(", ") || "N/A",
      shippingCity: address?.city || "N/A",
      shippingCountry: address?.country || "N/A",
      shippingPostalCode: address?.postal_code || "N/A",
      subtotal: totalBeforeDiscount,
      totalBeforeDiscount,
      discountCode,
      discountAmount,
      shippingCost,
      total: String((session.amount_total ?? 0) / 100),
      customerNotes,
      stripeSessionId: session.id,
      stripePaymentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
      hasStockIssue: false,
    },
    cartItems.map((item) => ({
      orderId: 0, // Will be set by createOrder
      productId: item.productId,
      variantId: item.variantId,
      variantKey: item.variantKey,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
    }))
  );

  console.log(`[Store] Order #${order.id} created for session ${session.id}`);

  // Decrement stock + check for issues (parallel — each targets a different variant row)
  const stockResults = await Promise.all(
    cartItems.map((item) => storeDb.decrementVariantStock(item.variantId, item.quantity))
  );
  let hasStockIssue = false;
  for (let i = 0; i < stockResults.length; i++) {
    if (stockResults[i].stock < 0) {
      hasStockIssue = true;
      console.warn(`[Store][STOCK_ISSUE] Order #${order.id}: ${stockResults[i].variantKey} stock=${stockResults[i].stock}`);
      adminNotifications.emitStockIssue(order.id, stockResults[i].variantKey, stockResults[i].stock);
    }
  }

  if (hasStockIssue) {
    await storeDb.setOrderStockIssue(order.id);
  }

  // Record discount usage
  if (discountCode) {
    try {
      const discount = await db.getDiscountCodeByCode(discountCode);
      if (discount) {
        await db.recordDiscountUsage({
          discountCodeId: discount.id,
          userId: userId || 0,
          discountAmount: parseFloat(discountAmount),
          originalAmount: parseFloat(totalBeforeDiscount),
          finalAmount: (session.amount_total ?? 0) / 100,
          transactionType: "product",
          transactionId: String(order.id),
        });
        // Increment the usage counter
        await db.incrementDiscountUsage(discount.id);
      }
    } catch (e) {
      console.error(`[Store] Failed to record discount usage for order #${order.id}:`, e);
    }
  }

  // Clear user's cart
  if (userId) {
    await storeDb.clearCart(userId);
  }

  // Emit admin notification
  adminNotifications.emitStoreOrder(order);
}
