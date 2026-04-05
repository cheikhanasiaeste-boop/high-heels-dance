# Store Phase 2 — Cart, Checkout, Orders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent shopping cart, Stripe Checkout integration, order management with admin dashboard, and discount code support to the existing store.

**Architecture:** Dual-storage cart (localStorage for guests, `store_cart_items` table for authenticated users) with merge on login. Stripe Checkout (hosted) for payments — matching existing course/session patterns. Webhook creates orders atomically with stock decrement. Admin Orders tab in existing StoreManager page.

**Tech Stack:** Drizzle ORM, tRPC, Stripe Checkout API, React + wouter, Tailwind CSS, Framer Motion, Sonner (toasts)

**Spec:** `docs/superpowers/specs/2026-04-05-store-phase2-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `drizzle/schema.ts` | Add store_cart_items, store_orders, store_order_items tables; extend discount types |
| Modify | `server/db.ts` | Import and re-export new schema types |
| Modify | `server/storeDb.ts` | Add cart, order, checkout DB functions |
| Modify | `server/storeRouter.ts` | Add cart, checkout, guest checkout, discount validation, order routes |
| Modify | `server/webhooks/stripe.ts` | Handle `store_order` checkout.session.completed |
| Modify | `server/events.ts` | Add store order + stock issue notification types |
| Create | `client/src/contexts/CartContext.tsx` | Dual-storage cart state provider |
| Create | `client/src/components/CartDrawer.tsx` | Slide-out cart panel |
| Create | `client/src/components/CartIcon.tsx` | Header cart icon with badge |
| Create | `client/src/pages/StoreSuccess.tsx` | Order confirmation page |
| Modify | `client/src/pages/Store.tsx` | Wire real addToCart, replace "Cart coming soon!" |
| Modify | `client/src/pages/admin/StoreManager.tsx` | Add Orders tab |
| Modify | `client/src/pages/Home.tsx` | Add CartIcon to header |
| Modify | `client/src/components/MobileNav.tsx` | Add CartIcon to mobile nav |
| Modify | `client/src/App.tsx` | Add /store/success route, wrap with CartProvider |

---

### Task 1: Database Schema — Cart, Orders, Order Items

**Files:**
- Modify: `drizzle/schema.ts` (append after line 596)
- Modify: `server/db.ts` (add imports at line 64)

- [ ] **Step 1: Add store_cart_items table to schema**

Append to `drizzle/schema.ts` after the `InsertStoreProductVariant` type export (line 596):

```typescript
/**
 * Store cart items — persistent cart for authenticated users
 */
export const storeCartItems = pgTable("store_cart_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => [
  unique("store_cart_user_product_variant").on(table.userId, table.productId, table.variantId),
  index("store_cart_user_idx").on(table.userId),
]);

export type StoreCartItem = typeof storeCartItems.$inferSelect;
export type InsertStoreCartItem = typeof storeCartItems.$inferInsert;
```

- [ ] **Step 2: Add store_orders table to schema**

Append below `storeCartItems`:

```typescript
/**
 * Store orders — created by Stripe webhook after successful payment
 */
export const storeOrders = pgTable("store_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  email: varchar("email", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  currency: varchar("currency", { length: 3 }).default("EUR").notNull(),
  shippingName: varchar("shipping_name", { length: 255 }).notNull(),
  shippingAddress: text("shipping_address").notNull(),
  shippingCity: varchar("shipping_city", { length: 100 }).notNull(),
  shippingCountry: varchar("shipping_country", { length: 100 }).notNull(),
  shippingPostalCode: varchar("shipping_postal_code", { length: 20 }).notNull(),
  shippingMethod: varchar("shipping_method", { length: 50 }),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  totalBeforeDiscount: numeric("total_before_discount", { precision: 10, scale: 2 }).notNull(),
  discountCode: varchar("discount_code", { length: 50 }),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).default("0").notNull(),
  shippingCost: numeric("shipping_cost", { precision: 10, scale: 2 }).default("0").notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  customerNotes: text("customer_notes"),
  stripeSessionId: varchar("stripe_session_id", { length: 255 }),
  stripePaymentId: varchar("stripe_payment_id", { length: 255 }),
  hasStockIssue: boolean("has_stock_issue").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("store_orders_user_idx").on(table.userId),
  index("store_orders_status_idx").on(table.status),
  index("store_orders_stripe_session_idx").on(table.stripeSessionId),
]);

export type StoreOrder = typeof storeOrders.$inferSelect;
export type InsertStoreOrder = typeof storeOrders.$inferInsert;
```

- [ ] **Step 3: Add store_order_items table to schema**

Append below `storeOrders`:

```typescript
/**
 * Store order items — snapshot of purchased items with frozen prices
 */
export const storeOrderItems = pgTable("store_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  variantId: integer("variant_id"),
  variantKey: varchar("variant_key", { length: 50 }),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
}, (table) => [
  index("store_order_items_order_idx").on(table.orderId),
]);

export type StoreOrderItem = typeof storeOrderItems.$inferSelect;
export type InsertStoreOrderItem = typeof storeOrderItems.$inferInsert;
```

- [ ] **Step 4: Extend discount type annotations**

In `drizzle/schema.ts`, find the `discountCodes` table `applicableTo` column (around line 416) and update the type:

Change:
```typescript
  applicableTo: text("applicableTo").$type<"all" | "subscriptions" | "courses">().default("all").notNull(),
```
To:
```typescript
  applicableTo: text("applicableTo").$type<"all" | "subscriptions" | "courses" | "products">().default("all").notNull(),
```

Find the `discountUsage` table `transactionType` column (around line 439) and update:

Change:
```typescript
  transactionType: text("transactionType").$type<"subscription" | "course">().notNull(),
```
To:
```typescript
  transactionType: text("transactionType").$type<"subscription" | "course" | "product">().notNull(),
```

- [ ] **Step 5: Add imports to server/db.ts**

In `server/db.ts`, add to the import block (after line 64, after `InsertStoreProductVariant`):

```typescript
  storeCartItems,
  StoreCartItem,
  InsertStoreCartItem,
  storeOrders,
  StoreOrder,
  InsertStoreOrder,
  storeOrderItems,
  StoreOrderItem,
  InsertStoreOrderItem,
```

- [ ] **Step 6: Also update recordDiscountUsage type in server/db.ts**

Find the `recordDiscountUsage` function (around line 2718) and update the `transactionType` type:

Change:
```typescript
  transactionType: 'subscription' | 'course';
```
To:
```typescript
  transactionType: 'subscription' | 'course' | 'product';
```

- [ ] **Step 7: Push schema to database**

Run: `npx drizzle-kit push`

Expected: Tables `store_cart_items`, `store_orders`, `store_order_items` created.

- [ ] **Step 8: Commit**

```bash
git add drizzle/schema.ts server/db.ts
git commit -m "feat(store): add cart, order, order_items tables; extend discount types"
```

---

### Task 2: Store DB Functions — Cart Operations

**Files:**
- Modify: `server/storeDb.ts` (append cart functions after line 1002)

- [ ] **Step 1: Add cart imports**

At the top of `server/storeDb.ts`, add to the import from `../drizzle/schema`:

```typescript
  storeCartItems,
  StoreCartItem,
  InsertStoreCartItem,
```

- [ ] **Step 2: Add cart mapper for REST fallback**

Add after the existing mapper functions (after `mapStoreProductVariant`, around line 58):

```typescript
function mapStoreCartItem(row: any): StoreCartItem {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    variantId: row.variant_id,
    quantity: row.quantity,
    addedAt: row.added_at ? new Date(row.added_at) : new Date(),
  };
}
```

- [ ] **Step 3: Add enriched cart item type and getCartItems function**

Append to `server/storeDb.ts`:

```typescript
// ---------------------------------------------------------------------------
// Cart Functions
// ---------------------------------------------------------------------------

export interface EnrichedCartItem {
  productId: number;
  variantId: number;
  quantity: number;
  title: string;
  imageUrl: string | null;
  variantKey: string;
  color: string | null;
  size: string | null;
  unitPrice: number;
  stock: number;
  basePrice: string;
  priceModifier: string;
  discountPercent: number | null;
}

/**
 * Get all cart items for a user, enriched with product + variant details.
 */
export async function getCartItems(userId: number): Promise<EnrichedCartItem[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db
        .select({
          productId: storeCartItems.productId,
          variantId: storeCartItems.variantId,
          quantity: storeCartItems.quantity,
          title: storeProducts.title,
          basePrice: storeProducts.basePrice,
          discountPercent: storeProducts.discountPercent,
          variantKey: storeProductVariants.variantKey,
          color: storeProductVariants.color,
          size: storeProductVariants.size,
          priceModifier: storeProductVariants.priceModifier,
          stock: storeProductVariants.stock,
        })
        .from(storeCartItems)
        .innerJoin(storeProducts, eq(storeProducts.id, storeCartItems.productId))
        .innerJoin(storeProductVariants, eq(storeProductVariants.id, storeCartItems.variantId))
        .where(eq(storeCartItems.userId, userId));

      // Get first image per product
      const productIds = [...new Set(rows.map((r) => r.productId))];
      const images = productIds.length > 0
        ? await db
            .select()
            .from(storeProductImages)
            .where(inArray(storeProductImages.productId, productIds))
            .orderBy(storeProductImages.displayOrder)
        : [];

      const imageMap = new Map<number, string>();
      for (const img of images) {
        if (!imageMap.has(img.productId)) {
          imageMap.set(img.productId, img.imageUrl);
        }
      }

      return rows.map((r) => ({
        productId: r.productId,
        variantId: r.variantId,
        quantity: r.quantity,
        title: r.title,
        imageUrl: imageMap.get(r.productId) ?? null,
        variantKey: r.variantKey,
        color: r.color,
        size: r.size,
        unitPrice: parseFloat(r.basePrice) + parseFloat(r.priceModifier),
        stock: r.stock,
        basePrice: r.basePrice,
        priceModifier: r.priceModifier,
        discountPercent: r.discountPercent,
      }));
    } catch (e) {
      console.warn("[Store] getCartItems direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data: cartRows, error } = await supabaseAdmin
    .from("store_cart_items")
    .select("*")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  if (!cartRows || cartRows.length === 0) return [];

  const productIds = [...new Set(cartRows.map((r: any) => r.product_id))];
  const variantIds = cartRows.map((r: any) => r.variant_id);

  const [productsRes, variantsRes, imagesRes] = await Promise.all([
    supabaseAdmin.from("store_products").select("*").in("id", productIds),
    supabaseAdmin.from("store_product_variants").select("*").in("id", variantIds),
    supabaseAdmin.from("store_product_images").select("*").in("product_id", productIds).order("display_order", { ascending: true }),
  ]);

  const productMap = new Map((productsRes.data ?? []).map((p: any) => [p.id, p]));
  const variantMap = new Map((variantsRes.data ?? []).map((v: any) => [v.id, v]));
  const imageMap = new Map<number, string>();
  for (const img of imagesRes.data ?? []) {
    if (!imageMap.has(img.product_id)) imageMap.set(img.product_id, img.image_url);
  }

  return cartRows.map((row: any) => {
    const product = productMap.get(row.product_id) as any;
    const variant = variantMap.get(row.variant_id) as any;
    return {
      productId: row.product_id,
      variantId: row.variant_id,
      quantity: row.quantity,
      title: product?.title ?? "Unknown",
      imageUrl: imageMap.get(row.product_id) ?? null,
      variantKey: variant?.variant_key ?? "",
      color: variant?.color ?? null,
      size: variant?.size ?? null,
      unitPrice: parseFloat(product?.base_price ?? "0") + parseFloat(variant?.price_modifier ?? "0"),
      stock: variant?.stock ?? 0,
      basePrice: product?.base_price ?? "0",
      priceModifier: variant?.price_modifier ?? "0",
      discountPercent: product?.discount_percent ?? null,
    };
  });
}
```

- [ ] **Step 4: Add addCartItem (upsert)**

```typescript
/**
 * Add item to cart. Upserts: if (user, product, variant) exists, increments quantity.
 * Caps at available stock. Returns the new quantity.
 */
export async function addCartItem(
  userId: number,
  productId: number,
  variantId: number,
  quantity: number
): Promise<{ quantity: number }> {
  // Fetch current stock
  const db = await getDb();
  if (db) {
    try {
      const [variant] = await db
        .select({ stock: storeProductVariants.stock })
        .from(storeProductVariants)
        .where(eq(storeProductVariants.id, variantId))
        .limit(1);

      if (!variant) throw new TRPCError({ code: "NOT_FOUND", message: "Variant not found" });

      const [existing] = await db
        .select()
        .from(storeCartItems)
        .where(
          and(
            eq(storeCartItems.userId, userId),
            eq(storeCartItems.productId, productId),
            eq(storeCartItems.variantId, variantId)
          )
        )
        .limit(1);

      const newQty = Math.min((existing?.quantity ?? 0) + quantity, variant.stock);
      if (newQty <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Out of stock" });

      if (existing) {
        await db
          .update(storeCartItems)
          .set({ quantity: newQty })
          .where(eq(storeCartItems.id, existing.id));
      } else {
        await db.insert(storeCartItems).values({
          userId,
          productId,
          variantId,
          quantity: newQty,
        });
      }

      return { quantity: newQty };
    } catch (e) {
      if (e instanceof TRPCError) throw e;
      console.warn("[Store] addCartItem direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data: variant } = await supabaseAdmin
    .from("store_product_variants")
    .select("stock")
    .eq("id", variantId)
    .single();

  if (!variant) throw new TRPCError({ code: "NOT_FOUND", message: "Variant not found" });

  const { data: existing } = await supabaseAdmin
    .from("store_cart_items")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("variant_id", variantId)
    .limit(1)
    .single();

  const newQty = Math.min((existing?.quantity ?? 0) + quantity, variant.stock);
  if (newQty <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Out of stock" });

  if (existing) {
    await supabaseAdmin
      .from("store_cart_items")
      .update({ quantity: newQty })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin
      .from("store_cart_items")
      .insert({ user_id: userId, product_id: productId, variant_id: variantId, quantity: newQty });
  }

  return { quantity: newQty };
}
```

Add this import at the top of `server/storeDb.ts`:

```typescript
import { TRPCError } from "@trpc/server";
```

- [ ] **Step 5: Add updateCartItemQuantity**

```typescript
/**
 * Set exact quantity for a cart item. Capped at stock. Removes if qty <= 0.
 */
export async function updateCartItemQuantity(
  userId: number,
  productId: number,
  variantId: number,
  quantity: number
): Promise<{ quantity: number }> {
  if (quantity <= 0) {
    await removeCartItem(userId, productId, variantId);
    return { quantity: 0 };
  }

  const db = await getDb();
  if (db) {
    try {
      const [variant] = await db
        .select({ stock: storeProductVariants.stock })
        .from(storeProductVariants)
        .where(eq(storeProductVariants.id, variantId))
        .limit(1);

      if (!variant) throw new TRPCError({ code: "NOT_FOUND", message: "Variant not found" });

      const cappedQty = Math.min(quantity, variant.stock);

      await db
        .update(storeCartItems)
        .set({ quantity: cappedQty })
        .where(
          and(
            eq(storeCartItems.userId, userId),
            eq(storeCartItems.productId, productId),
            eq(storeCartItems.variantId, variantId)
          )
        );

      return { quantity: cappedQty };
    } catch (e) {
      if (e instanceof TRPCError) throw e;
      console.warn("[Store] updateCartItemQuantity direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data: variant } = await supabaseAdmin
    .from("store_product_variants")
    .select("stock")
    .eq("id", variantId)
    .single();

  if (!variant) throw new TRPCError({ code: "NOT_FOUND", message: "Variant not found" });

  const cappedQty = Math.min(quantity, variant.stock);

  await supabaseAdmin
    .from("store_cart_items")
    .update({ quantity: cappedQty })
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("variant_id", variantId);

  return { quantity: cappedQty };
}
```

- [ ] **Step 6: Add removeCartItem and clearCart**

```typescript
/**
 * Remove a specific item from the cart.
 */
export async function removeCartItem(
  userId: number,
  productId: number,
  variantId: number
): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db
        .delete(storeCartItems)
        .where(
          and(
            eq(storeCartItems.userId, userId),
            eq(storeCartItems.productId, productId),
            eq(storeCartItems.variantId, variantId)
          )
        );
      return;
    } catch (e) {
      console.warn("[Store] removeCartItem direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  await supabaseAdmin
    .from("store_cart_items")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId)
    .eq("variant_id", variantId);
}

/**
 * Clear all cart items for a user.
 */
export async function clearCart(userId: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(storeCartItems).where(eq(storeCartItems.userId, userId));
      return;
    } catch (e) {
      console.warn("[Store] clearCart direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  await supabaseAdmin.from("store_cart_items").delete().eq("user_id", userId);
}
```

- [ ] **Step 7: Add mergeCart**

```typescript
/**
 * Merge localStorage cart into DB cart on login.
 * DB quantity wins on conflicts, capped at stock.
 */
export async function mergeCart(
  userId: number,
  items: { productId: number; variantId: number; quantity: number }[]
): Promise<EnrichedCartItem[]> {
  for (const item of items) {
    try {
      const db = await getDb();
      if (db) {
        const [variant] = await db
          .select({ stock: storeProductVariants.stock })
          .from(storeProductVariants)
          .where(eq(storeProductVariants.id, item.variantId))
          .limit(1);

        if (!variant || variant.stock <= 0) continue;

        const [existing] = await db
          .select()
          .from(storeCartItems)
          .where(
            and(
              eq(storeCartItems.userId, userId),
              eq(storeCartItems.productId, item.productId),
              eq(storeCartItems.variantId, item.variantId)
            )
          )
          .limit(1);

        const newQty = Math.min(
          Math.max(existing?.quantity ?? 0, item.quantity),
          variant.stock
        );

        if (existing) {
          await db
            .update(storeCartItems)
            .set({ quantity: newQty })
            .where(eq(storeCartItems.id, existing.id));
        } else {
          await db.insert(storeCartItems).values({
            userId,
            productId: item.productId,
            variantId: item.variantId,
            quantity: newQty,
          });
        }
      } else {
        // REST fallback
        const { supabaseAdmin } = await import("./lib/supabase");
        const { data: variant } = await supabaseAdmin
          .from("store_product_variants")
          .select("stock")
          .eq("id", item.variantId)
          .single();

        if (!variant || variant.stock <= 0) continue;

        const { data: existing } = await supabaseAdmin
          .from("store_cart_items")
          .select("*")
          .eq("user_id", userId)
          .eq("product_id", item.productId)
          .eq("variant_id", item.variantId)
          .limit(1)
          .single();

        const newQty = Math.min(
          Math.max(existing?.quantity ?? 0, item.quantity),
          variant.stock
        );

        if (existing) {
          await supabaseAdmin
            .from("store_cart_items")
            .update({ quantity: newQty })
            .eq("id", existing.id);
        } else {
          await supabaseAdmin
            .from("store_cart_items")
            .insert({ user_id: userId, product_id: item.productId, variant_id: item.variantId, quantity: newQty });
        }
      }
    } catch (e) {
      // Skip silently — individual item merge failure shouldn't block others
      console.warn(`[Store] mergeCart: skipping item ${item.productId}/${item.variantId}:`, (e as Error).message);
    }
  }

  return getCartItems(userId);
}
```

- [ ] **Step 8: Commit**

```bash
git add server/storeDb.ts
git commit -m "feat(store): add cart DB functions — get, add, update, remove, clear, merge"
```

---

### Task 3: Store DB Functions — Order Operations

**Files:**
- Modify: `server/storeDb.ts` (append order functions)

- [ ] **Step 1: Add order imports**

Add to the import from `../drizzle/schema` at top of `server/storeDb.ts`:

```typescript
  storeOrders,
  StoreOrder,
  InsertStoreOrder,
  storeOrderItems,
  StoreOrderItem,
  InsertStoreOrderItem,
```

- [ ] **Step 2: Add order mappers for REST fallback**

Add after `mapStoreCartItem`:

```typescript
function mapStoreOrder(row: any): StoreOrder {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    status: row.status,
    currency: row.currency,
    shippingName: row.shipping_name,
    shippingAddress: row.shipping_address,
    shippingCity: row.shipping_city,
    shippingCountry: row.shipping_country,
    shippingPostalCode: row.shipping_postal_code,
    shippingMethod: row.shipping_method,
    subtotal: row.subtotal,
    totalBeforeDiscount: row.total_before_discount,
    discountCode: row.discount_code,
    discountAmount: row.discount_amount,
    shippingCost: row.shipping_cost,
    total: row.total,
    customerNotes: row.customer_notes,
    stripeSessionId: row.stripe_session_id,
    stripePaymentId: row.stripe_payment_id,
    hasStockIssue: row.has_stock_issue,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  };
}

function mapStoreOrderItem(row: any): StoreOrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    variantId: row.variant_id,
    variantKey: row.variant_key,
    quantity: row.quantity,
    unitPrice: row.unit_price,
  };
}
```

- [ ] **Step 3: Add createOrder function**

Append to `server/storeDb.ts`:

```typescript
// ---------------------------------------------------------------------------
// Order Functions
// ---------------------------------------------------------------------------

/**
 * Create an order with its items. Returns the created order.
 */
export async function createOrder(
  order: InsertStoreOrder,
  items: InsertStoreOrderItem[]
): Promise<StoreOrder & { items: StoreOrderItem[] }> {
  const db = await getDb();
  if (db) {
    try {
      const [created] = await db.insert(storeOrders).values(order).returning();
      const orderItems = await db
        .insert(storeOrderItems)
        .values(items.map((item) => ({ ...item, orderId: created.id })))
        .returning();
      return { ...created, items: orderItems };
    } catch (e) {
      console.warn("[Store] createOrder direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data: orderData, error: orderErr } = await supabaseAdmin
    .from("store_orders")
    .insert({
      user_id: order.userId ?? null,
      email: order.email,
      status: order.status ?? "pending",
      currency: order.currency ?? "EUR",
      shipping_name: order.shippingName,
      shipping_address: order.shippingAddress,
      shipping_city: order.shippingCity,
      shipping_country: order.shippingCountry,
      shipping_postal_code: order.shippingPostalCode,
      shipping_method: order.shippingMethod ?? null,
      subtotal: order.subtotal,
      total_before_discount: order.totalBeforeDiscount,
      discount_code: order.discountCode ?? null,
      discount_amount: order.discountAmount ?? "0",
      shipping_cost: order.shippingCost ?? "0",
      total: order.total,
      customer_notes: order.customerNotes ?? null,
      stripe_session_id: order.stripeSessionId ?? null,
      stripe_payment_id: order.stripePaymentId ?? null,
      has_stock_issue: order.hasStockIssue ?? false,
    })
    .select("*")
    .single();

  if (orderErr) throw new Error(orderErr.message);
  const created = mapStoreOrder(orderData);

  const restItems = items.map((item) => ({
    order_id: created.id,
    product_id: item.productId,
    variant_id: item.variantId ?? null,
    variant_key: item.variantKey ?? null,
    quantity: item.quantity,
    unit_price: item.unitPrice,
  }));

  const { data: itemsData, error: itemsErr } = await supabaseAdmin
    .from("store_order_items")
    .insert(restItems)
    .select("*");

  if (itemsErr) throw new Error(itemsErr.message);

  return { ...created, items: (itemsData ?? []).map(mapStoreOrderItem) };
}
```

- [ ] **Step 4: Add getOrderByStripeSession**

```typescript
/**
 * Get order by Stripe session ID. Used for idempotency check and success page.
 */
export async function getOrderByStripeSession(
  sessionId: string
): Promise<(StoreOrder & { items: (StoreOrderItem & { productTitle?: string })[] }) | null> {
  const db = await getDb();
  if (db) {
    try {
      const [order] = await db
        .select()
        .from(storeOrders)
        .where(eq(storeOrders.stripeSessionId, sessionId))
        .limit(1);

      if (!order) return null;

      const items = await db
        .select({
          id: storeOrderItems.id,
          orderId: storeOrderItems.orderId,
          productId: storeOrderItems.productId,
          variantId: storeOrderItems.variantId,
          variantKey: storeOrderItems.variantKey,
          quantity: storeOrderItems.quantity,
          unitPrice: storeOrderItems.unitPrice,
          productTitle: storeProducts.title,
        })
        .from(storeOrderItems)
        .leftJoin(storeProducts, eq(storeProducts.id, storeOrderItems.productId))
        .where(eq(storeOrderItems.orderId, order.id));

      return { ...order, items };
    } catch (e) {
      console.warn("[Store] getOrderByStripeSession direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data: orderData } = await supabaseAdmin
    .from("store_orders")
    .select("*")
    .eq("stripe_session_id", sessionId)
    .limit(1)
    .single();

  if (!orderData) return null;
  const order = mapStoreOrder(orderData);

  const { data: itemsData } = await supabaseAdmin
    .from("store_order_items")
    .select("*")
    .eq("order_id", order.id);

  const productIds = [...new Set((itemsData ?? []).map((i: any) => i.product_id))];
  const { data: products } = await supabaseAdmin
    .from("store_products")
    .select("id, title")
    .in("id", productIds);

  const titleMap = new Map((products ?? []).map((p: any) => [p.id, p.title]));

  return {
    ...order,
    items: (itemsData ?? []).map((row: any) => ({
      ...mapStoreOrderItem(row),
      productTitle: titleMap.get(row.product_id) ?? "Unknown",
    })),
  };
}
```

- [ ] **Step 5: Add decrementVariantStock**

```typescript
/**
 * Decrement stock for a variant. Returns the new stock (may be negative).
 */
export async function decrementVariantStock(
  variantId: number,
  quantity: number
): Promise<{ variantId: number; variantKey: string; stock: number }> {
  const db = await getDb();
  if (db) {
    try {
      const [result] = await db
        .update(storeProductVariants)
        .set({ stock: sql`${storeProductVariants.stock} - ${quantity}` })
        .where(eq(storeProductVariants.id, variantId))
        .returning({
          variantId: storeProductVariants.id,
          variantKey: storeProductVariants.variantKey,
          stock: storeProductVariants.stock,
        });
      return result;
    } catch (e) {
      console.warn("[Store] decrementVariantStock direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data: current } = await supabaseAdmin
    .from("store_product_variants")
    .select("stock, variant_key")
    .eq("id", variantId)
    .single();

  const newStock = (current?.stock ?? 0) - quantity;
  await supabaseAdmin
    .from("store_product_variants")
    .update({ stock: newStock })
    .eq("id", variantId);

  return { variantId, variantKey: current?.variant_key ?? "", stock: newStock };
}
```

- [ ] **Step 6: Add setOrderStockIssue**

```typescript
/**
 * Flag an order as having a stock issue.
 */
export async function setOrderStockIssue(orderId: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db
        .update(storeOrders)
        .set({ hasStockIssue: true })
        .where(eq(storeOrders.id, orderId));
      return;
    } catch (e) {
      console.warn("[Store] setOrderStockIssue direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  await supabaseAdmin
    .from("store_orders")
    .update({ has_stock_issue: true })
    .eq("id", orderId);
}
```

- [ ] **Step 7: Add admin order query functions**

```typescript
/**
 * Get orders for admin — paginated, filterable by status.
 */
export async function getOrders(
  status: string | undefined,
  page: number,
  limit: number
): Promise<{ orders: (StoreOrder & { itemCount: number })[]; total: number }> {
  const db = await getDb();
  if (db) {
    try {
      const offset = (page - 1) * limit;
      const conditions: ReturnType<typeof eq>[] = [];
      if (status) conditions.push(eq(storeOrders.status, status));
      const where = conditions.length === 1 ? conditions[0] : conditions.length > 1 ? and(...conditions) : undefined;

      const [orders, [countRow]] = await Promise.all([
        db.select().from(storeOrders).where(where).orderBy(desc(storeOrders.createdAt)).limit(limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(storeOrders).where(where),
      ]);

      // Get item counts per order
      const orderIds = orders.map((o) => o.id);
      const itemCounts = orderIds.length > 0
        ? await db
            .select({
              orderId: storeOrderItems.orderId,
              count: sql<number>`count(*)::int`,
            })
            .from(storeOrderItems)
            .where(inArray(storeOrderItems.orderId, orderIds))
            .groupBy(storeOrderItems.orderId)
        : [];

      const countMap = new Map(itemCounts.map((c) => [c.orderId, c.count]));

      return {
        orders: orders.map((o) => ({ ...o, itemCount: countMap.get(o.id) ?? 0 })),
        total: countRow?.count ?? 0,
      };
    } catch (e) {
      console.warn("[Store] getOrders direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const offset = (page - 1) * limit;
  let query = supabaseAdmin.from("store_orders").select("*", { count: "exact" });
  if (status) query = query.eq("status", status);
  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const orders = (data ?? []).map(mapStoreOrder);

  // Get item counts
  const orderIds = orders.map((o) => o.id);
  if (orderIds.length === 0) return { orders: [], total: 0 };

  const { data: itemsData } = await supabaseAdmin
    .from("store_order_items")
    .select("order_id")
    .in("order_id", orderIds);

  const countMap = new Map<number, number>();
  for (const row of itemsData ?? []) {
    countMap.set(row.order_id, (countMap.get(row.order_id) ?? 0) + 1);
  }

  return {
    orders: orders.map((o) => ({ ...o, itemCount: countMap.get(o.id) ?? 0 })),
    total: count ?? 0,
  };
}

/**
 * Get a single order by ID with all items + product titles.
 */
export async function getOrderById(
  id: number
): Promise<(StoreOrder & { items: (StoreOrderItem & { productTitle?: string })[] }) | null> {
  const db = await getDb();
  if (db) {
    try {
      const [order] = await db.select().from(storeOrders).where(eq(storeOrders.id, id)).limit(1);
      if (!order) return null;

      const items = await db
        .select({
          id: storeOrderItems.id,
          orderId: storeOrderItems.orderId,
          productId: storeOrderItems.productId,
          variantId: storeOrderItems.variantId,
          variantKey: storeOrderItems.variantKey,
          quantity: storeOrderItems.quantity,
          unitPrice: storeOrderItems.unitPrice,
          productTitle: storeProducts.title,
        })
        .from(storeOrderItems)
        .leftJoin(storeProducts, eq(storeProducts.id, storeOrderItems.productId))
        .where(eq(storeOrderItems.orderId, id));

      return { ...order, items };
    } catch (e) {
      console.warn("[Store] getOrderById direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data: orderData } = await supabaseAdmin
    .from("store_orders")
    .select("*")
    .eq("id", id)
    .single();

  if (!orderData) return null;
  const order = mapStoreOrder(orderData);

  const { data: itemsData } = await supabaseAdmin
    .from("store_order_items")
    .select("*")
    .eq("order_id", id);

  const productIds = [...new Set((itemsData ?? []).map((i: any) => i.product_id))];
  const { data: products } = await supabaseAdmin
    .from("store_products")
    .select("id, title")
    .in("id", productIds);

  const titleMap = new Map((products ?? []).map((p: any) => [p.id, p.title]));

  return {
    ...order,
    items: (itemsData ?? []).map((row: any) => ({
      ...mapStoreOrderItem(row),
      productTitle: titleMap.get(row.product_id) ?? "Unknown",
    })),
  };
}

/**
 * Update order status. Validates transitions.
 */
export async function updateOrderStatus(id: number, status: string): Promise<StoreOrder> {
  const validStatuses = ["pending", "paid", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid status: ${status}` });
  }

  const db = await getDb();
  if (db) {
    try {
      const [updated] = await db
        .update(storeOrders)
        .set({ status })
        .where(eq(storeOrders.id, id))
        .returning();
      return updated;
    } catch (e) {
      console.warn("[Store] updateOrderStatus direct query failed, trying REST:", (e as Error).message);
    }
  }

  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("store_orders")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapStoreOrder(data);
}
```

- [ ] **Step 8: Commit**

```bash
git add server/storeDb.ts
git commit -m "feat(store): add order DB functions — create, query, status update, stock decrement"
```

---

### Task 4: Admin Notification for Store Orders

**Files:**
- Modify: `server/events.ts`

- [ ] **Step 1: Extend AdminNotification type and add emitters**

In `server/events.ts`, update the `AdminNotification` type (line 3) to include store types:

Change:
```typescript
  type: 'booking' | 'registration' | 'purchase' | 'testimonial';
```
To:
```typescript
  type: 'booking' | 'registration' | 'purchase' | 'testimonial' | 'store_order' | 'stock_issue';
```

Add two new methods to `AdminNotificationEmitter` class (before the closing `}`):

```typescript
  emitStoreOrder(order: any) {
    const notification: AdminNotification = {
      type: 'store_order',
      title: 'New Store Order',
      message: `Order #${order.id} — €${order.total} from ${order.email}`,
      timestamp: Date.now(),
      data: order,
    };
    this.emit('notification', notification);
  }

  emitStockIssue(orderId: number, variantKey: string, stock: number) {
    const notification: AdminNotification = {
      type: 'stock_issue',
      title: 'Stock Issue',
      message: `Order #${orderId}: ${variantKey} went to stock=${stock}`,
      timestamp: Date.now(),
      data: { orderId, variantKey, stock },
    };
    this.emit('notification', notification);
  }
```

- [ ] **Step 2: Commit**

```bash
git add server/events.ts
git commit -m "feat(store): add store order and stock issue admin notifications"
```

---

### Task 5: tRPC Routes — Cart + Checkout + Orders

**Files:**
- Modify: `server/storeRouter.ts` (add cart, checkout, order routes)

- [ ] **Step 1: Add Stripe import and sanitize helper at top of storeRouter.ts**

Add after the existing imports (after line 4):

```typescript
import Stripe from "stripe";
import * as db from "./db";
import { adminNotifications } from "./events";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-12-15.clover' })
  : null;

function sanitize(text: string, maxLength = 500): string {
  return text.replace(/<[^>]*>/g, "").slice(0, maxLength).trim();
}
```

- [ ] **Step 2: Add cart routes to storeRouter**

In `server/storeRouter.ts`, add a `cart` sub-router inside the existing `storeRouter` (after the `featured` route, before the closing `});` of storeRouter):

```typescript
  cart: router({
    get: protectedProcedure.query(({ ctx }) =>
      storeDb.getCartItems(ctx.user.id)
    ),

    add: protectedProcedure
      .input(z.object({
        productId: z.number(),
        variantId: z.number(),
        quantity: z.number().min(1).max(99),
      }))
      .mutation(({ ctx, input }) =>
        storeDb.addCartItem(ctx.user.id, input.productId, input.variantId, input.quantity)
      ),

    update: protectedProcedure
      .input(z.object({
        productId: z.number(),
        variantId: z.number(),
        quantity: z.number().min(0).max(99),
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

    clear: protectedProcedure.mutation(async ({ ctx }) => {
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
```

- [ ] **Step 3: Add validateDiscount public route**

Add to `storeRouter` (after the `cart` sub-router):

```typescript
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

      return {
        valid: true,
        discountType: discount.discountType,
        discountValue: discount.discountValue,
      };
    }),
```

- [ ] **Step 4: Add checkout mutation**

Add to `storeRouter`:

```typescript
  checkout: protectedProcedure
    .input(z.object({
      discountCode: z.string().optional(),
      customerNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!stripe) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment system not configured" });

      // 1. Load cart from DB
      const cartItems = await storeDb.getCartItems(ctx.user.id);
      if (cartItems.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cart is empty" });
      }

      // 2. Validate stock
      const problems = cartItems
        .filter((item) => item.quantity > item.stock)
        .map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          variantKey: item.variantKey,
          productTitle: item.title,
          requested: item.quantity,
          available: item.stock,
        }));

      if (problems.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: JSON.stringify({ code: "STOCK_INSUFFICIENT", problems }),
        });
      }

      // 3. Validate discount
      let discountAmount = 0;
      let discountCode = input.discountCode;
      if (discountCode) {
        const discount = await db.getDiscountCodeByCode(discountCode);
        if (!discount || !discount.isActive) {
          throw new TRPCError({ code: "BAD_REQUEST", message: JSON.stringify({ code: "DISCOUNT_INVALID", reason: "Code not found or inactive" }) });
        }
        const now = new Date();
        if (now < discount.validFrom || now > discount.validTo) {
          throw new TRPCError({ code: "BAD_REQUEST", message: JSON.stringify({ code: "DISCOUNT_INVALID", reason: "Code expired" }) });
        }
        if (discount.maxUses && discount.currentUses >= discount.maxUses) {
          throw new TRPCError({ code: "BAD_REQUEST", message: JSON.stringify({ code: "DISCOUNT_INVALID", reason: "Usage limit reached" }) });
        }
        if (discount.applicableTo !== "all" && discount.applicableTo !== "products") {
          throw new TRPCError({ code: "BAD_REQUEST", message: JSON.stringify({ code: "DISCOUNT_INVALID", reason: "Not applicable to store purchases" }) });
        }

        // Calculate discount
        const subtotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
        if (discount.discountType === "percentage") {
          discountAmount = Math.round(subtotal * parseFloat(discount.discountValue) / 100 * 100) / 100;
        } else {
          discountAmount = Math.min(parseFloat(discount.discountValue), subtotal);
        }
      }

      // 4. Calculate totals
      const subtotal = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const totalBeforeDiscount = subtotal;
      const afterDiscount = subtotal - discountAmount;

      const flatRate = parseFloat((await db.getSetting("store_shipping_flat_rate")) ?? "5.00");
      const freeThreshold = parseFloat((await db.getSetting("store_shipping_free_threshold")) ?? "50.00");
      const shippingCost = afterDiscount >= freeThreshold ? 0 : flatRate;
      const total = afterDiscount + shippingCost;

      // 5. Distribute discount across line items
      const lineItems = cartItems.map((item, index) => {
        const itemTotal = item.unitPrice * item.quantity;
        const itemShare = subtotal > 0 ? (itemTotal / subtotal) * discountAmount : 0;
        let adjustedUnitPrice = (itemTotal - itemShare) / item.quantity;
        let stripeUnitAmount = Math.round(adjustedUnitPrice * 100);

        return {
          ...item,
          stripeUnitAmount,
        };
      });

      // Fix rounding remainder
      const stripeSubtotal = lineItems.reduce((sum, item) => sum + item.stripeUnitAmount * item.quantity, 0);
      const expectedSubtotalCents = Math.round(afterDiscount * 100);
      if (stripeSubtotal !== expectedSubtotalCents && lineItems.length > 0) {
        lineItems[lineItems.length - 1].stripeUnitAmount += expectedSubtotalCents - stripeSubtotal;
      }

      // 6. Create Stripe Checkout Session
      const baseUrl = process.env.NODE_ENV === "production"
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME || "high-heels-dance.onrender.com"}`
        : `http://localhost:${process.env.PORT || 3000}`;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: ctx.user.email || undefined,
        shipping_address_collection: {
          allowed_countries: ["FR", "DE", "IT", "ES", "NL", "BE", "AT", "PT"] as any,
        },
        line_items: lineItems.map((item) => ({
          price_data: {
            currency: "eur",
            product_data: {
              name: `${item.title} — ${item.variantKey}`,
              images: item.imageUrl ? [item.imageUrl] : [],
            },
            unit_amount: item.stripeUnitAmount,
          },
          quantity: item.quantity,
        })),
        shipping_options: [{
          shipping_rate_data: {
            display_name: shippingCost > 0 ? "Standard Shipping" : "Free Shipping",
            type: "fixed_amount" as const,
            fixed_amount: { amount: Math.round(shippingCost * 100), currency: "eur" },
          },
        }],
        metadata: {
          type: "store_order",
          user_id: String(ctx.user.id),
          discount_code: discountCode || "",
          discount_amount: String(discountAmount),
          total_before_discount: String(totalBeforeDiscount),
          shipping_cost: String(shippingCost),
          customer_notes: sanitize(input.customerNotes || ""),
          cart_items: JSON.stringify(cartItems.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            variantKey: i.variantKey,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          }))),
        },
        success_url: `${baseUrl}/store/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/store`,
      });

      return { url: session.url };
    }),

  guestCheckout: publicProcedure
    .input(z.object({
      items: z.array(z.object({
        productId: z.number(),
        variantId: z.number(),
        quantity: z.number().min(1).max(99),
      })),
      email: z.string().email(),
      discountCode: z.string().optional(),
      customerNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!stripe) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment system not configured" });
      if (input.items.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Cart is empty" });

      // Re-validate all items server-side (never trust client data)
      const enrichedItems: Array<{
        productId: number; variantId: number; quantity: number;
        title: string; variantKey: string; imageUrl: string | null;
        unitPrice: number; stock: number;
      }> = [];

      for (const item of input.items) {
        const product = await storeDb.getProductById(item.productId);
        if (!product) continue;
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (!variant) continue;

        const unitPrice = parseFloat(product.basePrice) + parseFloat(variant.priceModifier);
        const firstImage = product.images[0]?.imageUrl ?? null;

        enrichedItems.push({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          title: product.title,
          variantKey: variant.variantKey,
          imageUrl: firstImage,
          unitPrice,
          stock: variant.stock,
        });
      }

      // Validate stock
      const problems = enrichedItems
        .filter((item) => item.quantity > item.stock)
        .map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          variantKey: item.variantKey,
          productTitle: item.title,
          requested: item.quantity,
          available: item.stock,
        }));

      if (problems.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: JSON.stringify({ code: "STOCK_INSUFFICIENT", problems }),
        });
      }

      // Same discount + total + Stripe session logic as authenticated checkout
      // but with user_id="" in metadata and customer_email from input
      // (Implementation follows same pattern as store.checkout above,
      //  with enrichedItems instead of DB cart items, and input.email as customer_email)

      // ... calculate totals, discounts, create Stripe session ...
      // Return { url: session.url }
    }),

  orderBySession: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const order = await storeDb.getOrderByStripeSession(input.sessionId);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      return order;
    }),
```

Note: The `guestCheckout` mutation shares the same discount validation, total calculation, and Stripe session creation logic as `checkout`. Extract the shared logic into a helper function `createCheckoutSession(items, email, userId, discountCode, customerNotes)` to avoid duplication.

- [ ] **Step 5: Add admin order routes**

Add an `orders` sub-router inside `adminStoreRouter` (after the existing `variants` router):

```typescript
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
      .input(z.object({
        id: z.number(),
        status: z.string(),
      }))
      .mutation(({ input }) => storeDb.updateOrderStatus(input.id, input.status)),

    exportCsv: adminProcedure
      .input(z.object({
        status: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }))
      .query(async ({ input }) => {
        // Fetch all matching orders (no pagination for export)
        const { orders } = await storeDb.getOrders(input.status, 1, 1000);
        const filtered = orders.filter((o) => {
          if (input.dateFrom && o.createdAt < new Date(input.dateFrom)) return false;
          if (input.dateTo && o.createdAt > new Date(input.dateTo)) return false;
          return true;
        });

        const header = "Order #,Email,Items,Total,Status,Stock Issue,Date,Shipping Name,Shipping Address,Shipping City,Shipping Country\n";
        const rows = filtered.map((o) =>
          `${o.id},"${o.email}",${o.itemCount},${o.total},${o.status},${o.hasStockIssue},${o.createdAt.toISOString()},"${o.shippingName}","${o.shippingAddress}","${o.shippingCity}","${o.shippingCountry}"`
        ).join("\n");

        return { csv: header + rows };
      }),
  }),
```

- [ ] **Step 6: Commit**

```bash
git add server/storeRouter.ts
git commit -m "feat(store): add cart, checkout, discount validation, and order tRPC routes"
```

---

### Task 6: Stripe Webhook — Store Order Handler

**Files:**
- Modify: `server/webhooks/stripe.ts`

- [ ] **Step 1: Add store imports**

Add at top of `server/webhooks/stripe.ts` (after line 4):

```typescript
import * as storeDb from '../storeDb';
import { adminNotifications } from '../events';
```

- [ ] **Step 2: Add store_order handler in checkout.session.completed**

In `handleCheckoutSessionCompleted` function (around line 73), add a check for `metadata.type === "store_order"` at the beginning, before the existing userId parsing:

Insert after `async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {`:

```typescript
  // Handle store orders
  if (session.metadata?.type === "store_order") {
    await handleStoreOrderCompleted(session);
    return;
  }
```

- [ ] **Step 3: Add handleStoreOrderCompleted function**

Add at the end of the file:

```typescript
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
  const cartItems = JSON.parse(metadata.cart_items || "[]") as Array<{
    productId: number;
    variantId: number;
    variantKey: string;
    quantity: number;
    unitPrice: number;
  }>;

  // Extract shipping from Stripe session
  const shipping = session.shipping_details;
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

  // Decrement stock + check for issues
  let hasStockIssue = false;
  for (const item of cartItems) {
    const result = await storeDb.decrementVariantStock(item.variantId, item.quantity);
    if (result.stock < 0) {
      hasStockIssue = true;
      console.warn(`[Store][STOCK_ISSUE] Order #${order.id}: ${result.variantKey} stock=${result.stock}`);
      adminNotifications.emitStockIssue(order.id, result.variantKey, result.stock);
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
```

- [ ] **Step 4: Commit**

```bash
git add server/webhooks/stripe.ts
git commit -m "feat(store): handle store_order in Stripe webhook — create order, decrement stock"
```

---

### Task 7: CartContext Provider

**Files:**
- Create: `client/src/contexts/CartContext.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create CartContext.tsx**

Create `client/src/contexts/CartContext.tsx` with the dual-storage cart provider. This is a large file — see the spec for full API. Key implementation points:

- Uses `useAuth()` to detect auth state
- Guest mode: reads/writes `localStorage("hh-cart")`, enriches items by fetching product data via `trpc.store.getBySlug`
- Auth mode: uses `trpc.store.cart.*` mutations
- On login (auth state changes from null to user): calls `store.cart.merge` with localStorage items, clears localStorage
- On logout: exports DB cart items to localStorage
- Exposes: `items, count, subtotal, addToCart, removeFromCart, updateQuantity, clearCart, isLoading`

The file should use `createContext`, `useContext`, and a `CartProvider` component wrapping children.

- [ ] **Step 2: Wrap App with CartProvider**

In `client/src/App.tsx`, import `CartProvider`:

```typescript
import { CartProvider } from "./contexts/CartContext";
```

In the `App` function, wrap the contents inside `<CartProvider>`:

```tsx
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <CartProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <WelcomeModal
              isOpen={showWelcome}
              onClose={handleCloseWelcome}
              userName={user?.name || undefined}
            />
          </TooltipProvider>
        </CartProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
```

- [ ] **Step 3: Add /store/success route**

In `client/src/App.tsx`, add import:

```typescript
import StoreSuccess from "./pages/StoreSuccess";
```

Add route (after the `/store` route, line 80):

```tsx
<Route path="/store/success" component={StoreSuccess} />
```

- [ ] **Step 4: Commit**

```bash
git add client/src/contexts/CartContext.tsx client/src/App.tsx
git commit -m "feat(store): add CartContext provider with dual-storage and app integration"
```

---

### Task 8: CartIcon + CartDrawer Components

**Files:**
- Create: `client/src/components/CartIcon.tsx`
- Create: `client/src/components/CartDrawer.tsx`

- [ ] **Step 1: Create CartIcon.tsx**

Create `client/src/components/CartIcon.tsx`:
- Import `ShoppingBag` from lucide-react
- Use `useCart()` for `count`
- Render shopping bag icon with fuchsia badge (count > 0)
- Badge uses `animate-pulse` briefly when count changes (track prev count with `useRef`)
- `onClick` prop toggles cart drawer open state

- [ ] **Step 2: Create CartDrawer.tsx**

Create `client/src/components/CartDrawer.tsx`:
- Slide-out panel from right, glassmorphic (`bg-black/90 backdrop-blur-xl border-l border-[#E879F9]/10`)
- Backdrop overlay with `onClick` to close
- Header: "Your Cart" + count + close button
- Scrollable item list with thumbnails, variant keys, quantity controls, prices
- Footer: subtotal, discount code input + Apply, shipping estimate, total, checkout button
- Checkout button: fuchsia gradient, spinner while loading, calls `store.checkout` mutation, redirects to Stripe URL
- Empty state: shopping bag icon + "Your cart is empty" + "Browse Store" link
- Uses Framer Motion for slide-in animation
- `isOpen` / `onClose` props

- [ ] **Step 3: Commit**

```bash
git add client/src/components/CartIcon.tsx client/src/components/CartDrawer.tsx
git commit -m "feat(store): add CartIcon with badge and CartDrawer slide-out panel"
```

---

### Task 9: Wire Cart Into Header + Store Page

**Files:**
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/components/MobileNav.tsx`
- Modify: `client/src/pages/Store.tsx`

- [ ] **Step 1: Add CartIcon + CartDrawer to Home.tsx header**

In `client/src/pages/Home.tsx`, import:

```typescript
import { CartIcon } from "@/components/CartIcon";
import { CartDrawer } from "@/components/CartDrawer";
```

Add `const [cartOpen, setCartOpen] = useState(false);` to the Home component.

Add `<CartIcon onClick={() => setCartOpen(true)} />` next to the `UserProfileDropdown` in the desktop header nav.

Add `<CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />` before closing `</>` of the page.

- [ ] **Step 2: Add CartIcon to MobileNav**

Similarly add CartIcon to the mobile navigation.

- [ ] **Step 3: Wire addToCart in Store.tsx**

In `client/src/pages/Store.tsx`, find the "Cart coming soon!" toast (line 174) and replace the entire `onClick` handler with:

```typescript
import { useCart } from "@/contexts/CartContext";

// Inside the component:
const { addToCart } = useCart();
const [addingToCart, setAddingToCart] = useState(false);
const [addedToCart, setAddedToCart] = useState(false);

// Replace the "Cart coming soon!" handler:
const handleAddToCart = async () => {
  if (!selectedVariant) return;
  setAddingToCart(true);
  try {
    addToCart(product.id, selectedVariant.id, quantity);
    setAddedToCart(true);
    toast.success("Added to cart!");
    setTimeout(() => setAddedToCart(false), 2000);
  } catch (e) {
    toast.error("Failed to add to cart");
  } finally {
    setAddingToCart(false);
  }
};
```

Update the "Add to Cart" button to show loading/success states.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Home.tsx client/src/components/MobileNav.tsx client/src/pages/Store.tsx
git commit -m "feat(store): wire CartIcon into header, replace 'Cart coming soon' with real addToCart"
```

---

### Task 10: Store Success Page

**Files:**
- Create: `client/src/pages/StoreSuccess.tsx`

- [ ] **Step 1: Create StoreSuccess.tsx**

Create `client/src/pages/StoreSuccess.tsx`:
- Read `session_id` from URL search params
- Call `trpc.store.orderBySession.useQuery({ sessionId })`
- Purple gradient background, centered glassmorphic card
- Animated checkmark SVG (circle draws, then checkmark, fuchsia-purple gradient stroke)
- Order summary: items table, subtotal, discount, shipping, total
- Shipping address
- Status timeline: Paid → Shipped → Delivered (current step highlighted fuchsia)
- "Continue Shopping" and "Back to Home" buttons
- Error state for invalid/missing session

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/StoreSuccess.tsx
git commit -m "feat(store): add order confirmation success page with animated checkmark"
```

---

### Task 11: Admin Orders Tab

**Files:**
- Modify: `client/src/pages/admin/StoreManager.tsx`

- [ ] **Step 1: Add tab bar and Orders tab**

In `client/src/pages/admin/StoreManager.tsx`:
- Add a tab state: `const [activeTab, setActiveTab] = useState<"products" | "orders">("products");`
- Add tab bar at top: Products | Orders (styled pill buttons)
- Wrap existing product content in `{activeTab === "products" && (...)}`
- Add Orders tab content when `activeTab === "orders"`:
  - Status filter dropdown
  - Orders table: #, email, items count, total, status badge, stock issue icon, date
  - Click row → order detail modal
  - Detail modal: red stock issue banner, shipping address, items, status update dropdown
  - Export CSV button

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/admin/StoreManager.tsx
git commit -m "feat(store): add Orders tab to admin Store Manager with status management"
```

---

### Task 12: Push Schema + Verify + Deploy

- [ ] **Step 1: Push schema to database**

Run: `npx drizzle-kit push`

- [ ] **Step 2: Verify dev server compiles**

Run: `npm run dev`

Navigate to:
- `http://localhost:3000/store` — verify add to cart works
- `http://localhost:3000/admin/store` — verify Orders tab appears

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix(store): Phase 2 compilation fixes"
```

- [ ] **Step 4: Deploy**

Run: `./deploy.sh`

- [ ] **Step 5: Verify production**

Check the Render dashboard for successful deploy. Test `/store` and `/admin/store` on production.
