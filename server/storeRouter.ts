import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as storeDb from "./storeDb";
import Stripe from "stripe";
import * as db from "./db";
import { adminNotifications } from "./events";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null;

function sanitize(text: string, maxLength = 500): string {
  return text.replace(/<[^>]*>/g, "").slice(0, maxLength).trim();
}

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

// ---------------------------------------------------------------------------
// Public store router
// ---------------------------------------------------------------------------

export const storeRouter = router({
  list: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(12),
      })
    )
    .query(({ input }) =>
      storeDb.getPublishedProducts(input.category, input.page, input.limit)
    ),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const product = await storeDb.getProductBySlug(input.slug);
      if (!product) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      }
      return product;
    }),

  featured: publicProcedure.query(() => storeDb.getFeaturedProducts()),

  cart: router({
    get: protectedProcedure.query(({ ctx }) =>
      storeDb.getCartItems(ctx.user.id)
    ),

    add: protectedProcedure
      .input(z.object({
        productId: z.number(),
        variantId: z.number(),
        quantity: z.number().min(1),
      }))
      .mutation(({ ctx, input }) =>
        storeDb.addCartItem(ctx.user.id, input.productId, input.variantId, input.quantity)
      ),

    update: protectedProcedure
      .input(z.object({
        productId: z.number(),
        variantId: z.number(),
        quantity: z.number().min(0),
      }))
      .mutation(({ ctx, input }) =>
        storeDb.updateCartItemQuantity(ctx.user.id, input.productId, input.variantId, input.quantity)
      ),

    remove: protectedProcedure
      .input(z.object({
        productId: z.number(),
        variantId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        await storeDb.removeCartItem(ctx.user.id, input.productId, input.variantId);
        return { ok: true };
      }),

    clear: protectedProcedure
      .mutation(async ({ ctx }) => {
        await storeDb.clearCart(ctx.user.id);
        return { ok: true };
      }),

    merge: protectedProcedure
      .input(z.object({
        items: z.array(z.object({
          productId: z.number(),
          variantId: z.number(),
          quantity: z.number().min(1),
        })),
      }))
      .mutation(({ ctx, input }) =>
        storeDb.mergeCart(ctx.user.id, input.items)
      ),
  }),

  validateDiscount: publicProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ input }) => {
      const discount = await db.getDiscountCodeByCode(input.code);
      if (!discount) return { valid: false, reason: "Code not found" };
      if (!discount.isActive) return { valid: false, reason: "Code is no longer active" };
      const now = new Date();
      if (now < discount.validFrom) return { valid: false, reason: "Code is not yet valid" };
      if (now > discount.validTo) return { valid: false, reason: "Code has expired" };
      if (discount.maxUses && discount.currentUses >= discount.maxUses) return { valid: false, reason: "Usage limit reached" };
      if (discount.applicableTo !== "all" && discount.applicableTo !== "products") {
        return { valid: false, reason: "Code not applicable to store purchases" };
      }
      return { valid: true, discountType: discount.discountType, discountValue: discount.discountValue };
    }),

  checkout: protectedProcedure
    .input(z.object({
      discountCode: z.string().optional(),
      customerNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Check stripe is configured
      if (!stripe) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment system not configured" });
      }

      // 2. Load cart
      const cartItems = await storeDb.getCartItems(ctx.user.id);
      if (!cartItems || cartItems.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cart is empty" });
      }

      // 3. Validate stock
      const problems = cartItems
        .filter((item) => item.quantity > item.stock)
        .map((item) => ({ productId: item.productId, variantId: item.variantId, requested: item.quantity, available: item.stock }));
      if (problems.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: JSON.stringify({ code: "STOCK_INSUFFICIENT", problems }),
        });
      }

      // 4. Validate discount if provided
      let discountRecord: Awaited<ReturnType<typeof db.getDiscountCodeByCode>> | null = null;
      if (input.discountCode) {
        discountRecord = await db.getDiscountCodeByCode(input.discountCode);
        if (!discountRecord || !discountRecord.isActive) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or inactive discount code" });
        }
        const now = new Date();
        if (now < discountRecord.validFrom || now > discountRecord.validTo) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Discount code is not currently valid" });
        }
        if (discountRecord.maxUses && discountRecord.currentUses >= discountRecord.maxUses) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Discount code usage limit reached" });
        }
        if (discountRecord.applicableTo !== "all" && discountRecord.applicableTo !== "products") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Discount code not applicable to store purchases" });
        }
      }

      // 5. Calculate totals
      const subtotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

      let discountAmount = 0;
      if (discountRecord) {
        if (discountRecord.discountType === "percentage") {
          discountAmount = subtotal * (parseFloat(discountRecord.discountValue) / 100);
        } else {
          discountAmount = Math.min(parseFloat(discountRecord.discountValue), subtotal);
        }
      }

      const shippingRateStr = await db.getSetting("store_shipping_flat_rate") ?? "5.00";
      const freeThresholdStr = await db.getSetting("store_shipping_free_threshold") ?? "50.00";
      const shippingRate = parseFloat(shippingRateStr);
      const freeThreshold = parseFloat(freeThresholdStr);
      const afterDiscount = subtotal - discountAmount;
      const shippingCost = afterDiscount >= freeThreshold ? 0 : shippingRate;

      // 6. Distribute discount proportionally across line items
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = cartItems.map((item, idx) => {
        const itemSubtotal = item.unitPrice * item.quantity;
        let itemDiscount = subtotal > 0 ? (itemSubtotal / subtotal) * discountAmount : 0;
        // Fix rounding remainder on last item
        if (idx === cartItems.length - 1) {
          const allocated = cartItems.slice(0, -1).reduce((sum, it) => {
            const its = it.unitPrice * it.quantity;
            return sum + (subtotal > 0 ? (its / subtotal) * discountAmount : 0);
          }, 0);
          itemDiscount = discountAmount - allocated;
        }
        const unitAmountAfterDiscount = Math.max(0, Math.round(((itemSubtotal - itemDiscount) / item.quantity) * 100));
        const variantLabel = [item.color, item.size].filter(Boolean).join(" / ");
        return {
          price_data: {
            currency: "gbp",
            product_data: {
              name: sanitize(item.title),
              description: variantLabel ? sanitize(variantLabel) : undefined,
            },
            unit_amount: unitAmountAfterDiscount,
          },
          quantity: item.quantity,
        };
      });

      const baseUrl = process.env.NODE_ENV === "production"
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME || "high-heels-dance.onrender.com"}`
        : `http://localhost:${process.env.PORT || 3000}`;

      // 7. Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        shipping_address_collection: { allowed_countries: ["GB", "US", "CA", "AU", "IE", "FR", "DE", "ES", "IT", "NL"] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] },
        line_items: lineItems,
        shipping_options: shippingCost > 0
          ? [{ shipping_rate_data: { type: "fixed_amount", fixed_amount: { amount: Math.round(shippingCost * 100), currency: "gbp" }, display_name: "Standard Shipping" } }]
          : [{ shipping_rate_data: { type: "fixed_amount", fixed_amount: { amount: 0, currency: "gbp" }, display_name: "Free Shipping" } }],
        success_url: `${baseUrl}/store/order-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/store/cart`,
        customer_email: ctx.user.email ?? undefined,
        metadata: {
          type: "store_order",
          user_id: String(ctx.user.id),
          discount_code: input.discountCode ?? "",
          discount_amount: discountAmount.toFixed(2),
          total_before_discount: subtotal.toFixed(2),
          shipping_cost: shippingCost.toFixed(2),
          customer_notes: sanitize(input.customerNotes ?? "", 500),
          cart_items: JSON.stringify(cartItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          }))),
        },
      });

      // 8. Return session URL
      return { url: session.url };
    }),

  orderBySession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const order = await storeDb.getOrderByStripeSession(input.sessionId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      return order;
    }),
});

// ---------------------------------------------------------------------------
// Admin store router
// ---------------------------------------------------------------------------

export const adminStoreRouter = router({
  products: router({
    list: adminProcedure
      .input(
        z.object({
          search: z.string().optional(),
          category: z.string().optional(),
        })
      )
      .query(({ input }) => storeDb.getAllProducts(input.search, input.category)),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const product = await storeDb.getProductById(input.id);
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
        }
        return product;
      }),

    create: adminProcedure
      .input(
        z.object({
          title: z.string().min(1).max(255),
          description: z.string().min(1),
          category: z.string().min(1).max(50),
          subcategory: z.string().max(50).optional(),
          basePrice: z.string(),
          discountPercent: z.number().min(0).max(100).optional(),
          seoTitle: z.string().max(255).optional(),
          seoDescription: z.string().optional(),
          isFeatured: z.boolean().optional(),
        })
      )
      .mutation(({ input }) =>
        storeDb.insertProduct({
          ...input,
          slug: slugify(input.title),
          isPublished: false,
        })
      ),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          category: z.string().optional(),
          subcategory: z.string().optional(),
          basePrice: z.string().optional(),
          discountPercent: z.number().optional(),
          seoTitle: z.string().optional(),
          seoDescription: z.string().optional(),
          isFeatured: z.boolean().optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return storeDb.updateProduct(id, data);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await storeDb.deleteProduct(input.id);
        return { ok: true };
      }),

    publish: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => storeDb.publishProduct(input.id)),

    unpublish: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => storeDb.unpublishProduct(input.id)),
  }),

  images: router({
    add: adminProcedure
      .input(
        z.object({
          productId: z.number(),
          imageUrl: z.string().url(),
          altText: z.string().max(255).optional(),
          displayOrder: z.number().optional(),
        })
      )
      .mutation(({ input }) => storeDb.addProductImage(input)),

    remove: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await storeDb.removeProductImage(input.id);
        return { ok: true };
      }),

    reorder: adminProcedure
      .input(
        z.object({
          productId: z.number(),
          imageIds: z.array(z.number()),
        })
      )
      .mutation(async ({ input }) => {
        await storeDb.reorderProductImages(input.productId, input.imageIds);
        return { ok: true };
      }),
  }),

  variants: router({
    add: adminProcedure
      .input(
        z.object({
          productId: z.number(),
          color: z.string().max(50).optional(),
          size: z.string().max(20).optional(),
          sku: z.string().max(50).optional(),
          priceModifier: z.string().optional(),
          stock: z.number().min(0),
        })
      )
      .mutation(({ input }) => storeDb.addProductVariant({ ...input, variantKey: "" })),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          stock: z.number().min(0).optional(),
          priceModifier: z.string().optional(),
          sku: z.string().max(50).optional(),
        })
      )
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return storeDb.updateProductVariant(id, data);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await storeDb.deleteProductVariant(input.id);
        return { ok: true };
      }),

    bulkCreate: adminProcedure
      .input(
        z.object({
          productId: z.number(),
          colors: z.array(z.string()),
          sizes: z.array(z.string()),
          stock: z.number().min(0),
          priceModifier: z.string().optional(),
        })
      )
      .mutation(({ input }) =>
        storeDb.bulkCreateVariants(input.productId, input.colors, input.sizes, input.stock, input.priceModifier)
      ),
  }),

  orders: router({
    list: adminProcedure
      .input(z.object({
        status: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      }))
      .query(({ input }) => storeDb.getOrders(input.status, input.page, input.limit)),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const order = await storeDb.getOrderById(input.id);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
        return order;
      }),

    updateStatus: adminProcedure
      .input(z.object({ id: z.number(), status: z.string() }))
      .mutation(({ input }) => storeDb.updateOrderStatus(input.id, input.status)),

    exportCsv: adminProcedure
      .input(z.object({
        status: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { orders } = await storeDb.getOrders(input.status, 1, 1000);
        const filtered = orders.filter((o) => {
          if (input.dateFrom && o.createdAt < new Date(input.dateFrom)) return false;
          if (input.dateTo && o.createdAt > new Date(input.dateTo)) return false;
          return true;
        });
        const header = "Order #,Email,Items,Total,Status,Stock Issue,Date\n";
        const rows = filtered.map((o) =>
          `${o.id},"${o.email}",${o.itemCount},${o.total},${o.status},${o.hasStockIssue},${o.createdAt.toISOString()}`
        ).join("\n");
        return { csv: header + rows };
      }),
  }),
});
