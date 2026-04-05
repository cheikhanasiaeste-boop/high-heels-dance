# Store Phase 2 — Cart, Checkout, Orders

## Overview

Phase 2 adds persistent shopping cart, Stripe Checkout integration, order management, and discount code support to the existing store. Builds on Phase 1 (product catalog, admin Store Manager, public `/store` page).

**Key decisions:**
- Stripe Checkout (hosted) — matches existing course/session checkout patterns
- Dual-storage cart: localStorage for guests, DB for authenticated users, merge on login
- Guest checkout supported (user_id nullable on orders)
- Discount codes extended from existing system (no new tables)
- Stock validated at checkout initiation + decremented atomically in webhook

---

## Database Schema

### New tables

#### `store_cart_items`

Persistent cart for authenticated users. Guest cart lives in `localStorage("hh-cart")`.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| user_id | integer | FK → users, not null, on delete cascade |
| product_id | integer | FK → store_products, not null |
| variant_id | integer | FK → store_product_variants, not null |
| quantity | integer | not null, default 1 |
| added_at | timestamp | not null, default now() |

Unique on `(user_id, product_id, variant_id)`.

#### `store_orders`

Created by Stripe webhook after successful payment.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| user_id | integer | FK → users, nullable |
| email | varchar(255) | not null |
| status | varchar(20) | not null, default 'pending' |
| currency | varchar(3) | not null, default 'EUR' |
| shipping_name | varchar(255) | not null |
| shipping_address | text | not null |
| shipping_city | varchar(100) | not null |
| shipping_country | varchar(100) | not null |
| shipping_postal_code | varchar(20) | not null |
| shipping_method | varchar(50) | nullable |
| subtotal | numeric(10,2) | not null |
| total_before_discount | numeric(10,2) | not null |
| discount_code | varchar(50) | nullable |
| discount_amount | numeric(10,2) | not null, default 0 |
| shipping_cost | numeric(10,2) | not null, default 0 |
| total | numeric(10,2) | not null |
| customer_notes | text | nullable |
| stripe_session_id | varchar(255) | nullable |
| stripe_payment_id | varchar(255) | nullable |
| has_stock_issue | boolean | not null, default false |
| created_at | timestamp | not null, default now() |

Index on `user_id`, `status`, `stripe_session_id`.

#### `store_order_items`

Snapshot of purchased items. Prices frozen at time of purchase.

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| order_id | integer | FK → store_orders, not null, on delete cascade |
| product_id | integer | FK → store_products, not null |
| variant_id | integer | FK → store_product_variants, nullable |
| variant_key | varchar(50) | nullable (denormalized, e.g. "Black-M") |
| quantity | integer | not null |
| unit_price | numeric(10,2) | not null |

Index on `order_id`.

### Modified tables

#### `discountCodes`

Extend `applicableTo` type from `"all" | "subscriptions" | "courses"` to `"all" | "subscriptions" | "courses" | "products"`.

#### `discountUsage`

Extend `transactionType` type from `"subscription" | "course"` to `"subscription" | "course" | "product"`.

---

## Cart Logic

### Dual-storage architecture

**Guest (not logged in):**
- Cart stored in `localStorage` key `"hh-cart"` as `Array<{ productId, variantId, quantity }>`
- All operations read/write localStorage directly
- Product details (title, image, price, stock) fetched via tRPC to enrich display
- On add/update: client calls `store.getBySlug` to fetch current stock and validates quantity before writing to localStorage. This prevents guests from adding more than available stock.

**Authenticated:**
- Cart stored in `store_cart_items` table
- All operations go through tRPC mutations
- Server validates stock on every add/update — rejects if `quantity > variant.stock`

### Merge on login

When a user signs in and has items in localStorage, inside a single transaction:

1. Client reads localStorage `"hh-cart"` items
2. Calls `store.cart.merge({ items })` mutation
3. Server per item:
   - If item exists in DB cart → DB quantity wins: `new_qty = min(db_qty, variant.stock)`. Only use localStorage quantity if it's higher AND stock allows: `new_qty = min(max(db_qty, local_qty), variant.stock)`
   - If item is new → `new_qty = min(local_qty, variant.stock)`
   - If variant doesn't exist or stock is 0 → skip silently, do not error
4. Returns full merged cart (enriched with product details)
5. Client clears localStorage `"hh-cart"`

On logout: export DB cart to localStorage, then clear DB cart.

### CartContext API

```typescript
// client/src/contexts/CartContext.tsx

interface CartItem {
  productId: number;
  variantId: number;
  quantity: number;
  title: string;
  imageUrl: string | null;
  variantKey: string;
  color: string | null;
  size: string | null;
  unitPrice: number;       // basePrice + priceModifier
  stock: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number;           // sum of all quantities
  subtotal: number;        // sum of unitPrice * quantity
  addToCart: (productId: number, variantId: number, qty: number) => void;
  removeFromCart: (productId: number, variantId: number) => void;
  updateQuantity: (productId: number, variantId: number, qty: number) => void;
  clearCart: () => void;
  isLoading: boolean;
}
```

- `addToCart`: increments quantity if already in cart (capped at stock). Toast on success.
- `removeFromCart`: removes item entirely.
- `updateQuantity`: sets exact quantity. If 0, removes. Capped at stock.
- `clearCart`: empties everything (called after checkout success).

Context checks auth state internally to decide localStorage vs tRPC. Transparent to consumers.

### Stock validation points

1. **On add/update** — quantity capped at `variant.stock`
2. **At checkout initiation** — server re-validates all items in a single transaction. Returns structured error with problem list if any fail.
3. **In webhook** — atomic stock decrement. If stock goes negative, order still processes (customer paid) but flagged with `has_stock_issue = true`.

---

## Checkout Flow

### `store.checkout` mutation

**protectedProcedure** for authenticated users. Rate-limited: 5 requests/minute per user.

For guest checkout: a separate `store.guestCheckout` mutation that accepts cart items from the client but re-validates everything server-side.

**Input:**
```typescript
{
  discountCode?: string;
  customerNotes?: string;  // sanitized: strip HTML, limit 500 chars
}
```

**Server steps (single read transaction for validation):**

1. **Load cart from DB** — join `store_cart_items` → `store_product_variants` → `store_products` → first image. Empty cart → `BAD_REQUEST("Cart is empty")`.

2. **Validate stock** — compare each item's quantity against variant stock. Build problems array:
   ```typescript
   type StockProblem = {
     productId: number;
     variantId: number;
     variantKey: string;
     productTitle: string;
     requested: number;
     available: number;
   };
   ```
   Any problems → throw `BAD_REQUEST({ code: "STOCK_INSUFFICIENT", problems })`.

3. **Validate discount** (if provided):
   - Fetch code, check `isActive`, within date range, under max uses
   - Check `applicableTo` is `"all"` or `"products"`
   - Invalid → throw `BAD_REQUEST({ code: "DISCOUNT_INVALID", reason: "..." })`

4. **Calculate totals server-side:**
   - `unitPrice = parseFloat(basePrice) + parseFloat(priceModifier)`
   - `subtotal = sum(unitPrice * quantity)`
   - `totalBeforeDiscount = subtotal`
   - Discount: percentage → `discountAmount = round(subtotal * value / 100, 2)`, fixed → `min(value, subtotal)`
   - `afterDiscount = subtotal - discountAmount`
   - Shipping from `siteSettings`:
     - Fetch `store_shipping_flat_rate` (e.g. "5.00") and `store_shipping_free_threshold` (e.g. "50.00")
     - If either setting is missing, default to flatRate=5.00, freeThreshold=50.00
     - `shippingCost = afterDiscount >= freeThreshold ? 0 : flatRate`
   - `total = afterDiscount + shippingCost`

5. **Distribute discount across line items** (no Stripe coupons):
   ```
   For each item:
     itemTotal = unitPrice * quantity
     itemShare = (itemTotal / subtotal) * discountAmount
     adjustedUnitPrice = (itemTotal - itemShare) / quantity
     stripeUnitAmount = Math.round(adjustedUnitPrice * 100)
   ```
   Rounding remainder (1-2 cents) added to last item.

6. **Create Stripe Checkout Session:**
   ```typescript
   stripe.checkout.sessions.create({
     mode: "payment",
     customer_email: user.email,
     shipping_address_collection: {
       allowed_countries: ["FR", "DE", "IT", "ES", "NL", "BE", "AT", "PT"],
     },
     line_items: cartItems.map(item => ({
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
         type: "fixed_amount",
         fixed_amount: { amount: Math.round(shippingCost * 100), currency: "eur" },
       },
     }],
     metadata: {
       type: "store_order",
       user_id: String(user.id),
       discount_code: discountCode || "",
       discount_amount: String(discountAmount),
       total_before_discount: String(totalBeforeDiscount),
       shipping_cost: String(shippingCost),
       customer_notes: sanitize(customerNotes || ""),
       cart_items: JSON.stringify(cartItems.map(i => ({
         productId: i.productId,
         variantId: i.variantId,
         variantKey: i.variantKey,
         quantity: i.quantity,
         unitPrice: i.unitPrice,
       }))),
     },
     success_url: `${baseUrl}/store/success?session_id={CHECKOUT_SESSION_ID}`,
     cancel_url: `${baseUrl}/store`,
   })
   ```

7. **Return** `{ url: session.url }`

### Guest checkout (`store.guestCheckout`)

**publicProcedure**, rate-limited: 5/min per IP.

**Input:**
```typescript
{
  items: Array<{ productId: number; variantId: number; quantity: number }>;
  email: string;
  discountCode?: string;
  customerNotes?: string;
}
```

Same validation and Stripe session creation as authenticated checkout, but:
- Cart items come from input (re-validated server-side against DB prices and stock)
- `user_id` in metadata is empty
- `customer_email` is the provided email

### Fraud prevention

- Authenticated checkout: max 3 orders per user per hour
- Guest checkout: max 3 orders per IP per hour
- Exceeding limit → `TOO_MANY_REQUESTS` with "Please try again later"

---

## Webhook Handler

Extends existing `server/webhooks/stripe.ts`. On `checkout.session.completed` where `metadata.type === "store_order"`:

### Idempotency

Check `store_orders` for existing row with matching `stripe_session_id`. If found, return early.

### Processing (single DB transaction)

1. **Parse metadata** — user_id, discount_code, discount_amount, total_before_discount, shipping_cost, customer_notes, cart_items
2. **Extract shipping** from `session.shipping_details` — sanitize all values
3. **Create `store_orders` row** — status `"paid"`, `hasStockIssue: false`
4. **Create `store_order_items` rows** — with denormalized `variantKey` and frozen `unitPrice`
5. **Decrement stock atomically:**
   ```sql
   UPDATE store_product_variants
   SET stock = stock - :quantity
   WHERE id = :variantId
   RETURNING id, variant_key, stock
   ```
   If any resulting `stock < 0`:
   - Set `hasStockIssue = true` on the order
   - Log: `[Store][STOCK_ISSUE] Order #${orderId}: ${variantKey} stock=${stock}`
   - Push admin notification via existing SSE system
   - Send admin email notification (using existing email infrastructure if available, otherwise log-only for v1)
6. **Record discount usage** — increment `currentUses`, insert `discountUsage` row with `transactionType: "product"`
7. **Clear user's cart** — if `user_id` is present, delete from `store_cart_items`

Transaction failure → rollback, Stripe retries webhook.

---

## tRPC Routes

### Authenticated user routes (added to `storeRouter`)

```
store.cart.get() → CartItem[] (enriched with product details)
  - protectedProcedure

store.cart.add({ productId, variantId, quantity }) → CartItem
  - protectedProcedure
  - Upsert: if exists, increment quantity (capped at stock)

store.cart.update({ productId, variantId, quantity }) → CartItem
  - protectedProcedure
  - Set exact quantity, validate stock

store.cart.remove({ productId, variantId }) → { ok }
  - protectedProcedure

store.cart.clear() → { ok }
  - protectedProcedure

store.cart.merge({ items: { productId, variantId, quantity }[] }) → CartItem[]
  - protectedProcedure
  - Merge localStorage cart into DB on login

store.checkout({ discountCode?, customerNotes? }) → { url }
  - protectedProcedure, rate-limited 5/min
```

### Public routes (added to `storeRouter`)

```
store.guestCheckout({ items, email, discountCode?, customerNotes? }) → { url }
  - publicProcedure, rate-limited 5/min per IP

store.validateDiscount({ code }) → { valid, discountType, discountValue, reason? }
  - publicProcedure
  - For real-time discount code validation in cart drawer

store.orderBySession({ sessionId }) → Order with items
  - publicProcedure
  - For success page, lookup by stripe_session_id
  - Note: Stripe session IDs are long random strings, safe as public lookup key
```

### Admin routes (added to `adminStoreRouter`)

```
adminStore.orders.list({ status?, page, limit }) → { orders, total }
  - With order items and product titles
  - Includes hasStockIssue flag

adminStore.orders.getById({ id }) → Order with items + product details

adminStore.orders.updateStatus({ id, status }) → Order
  - Transitions: pending → paid → shipped → delivered, or any → cancelled

adminStore.orders.exportCsv({ status?, dateFrom?, dateTo? }) → { csv: string }
  - Returns CSV string for download
```

---

## Frontend Components

### Cart Icon (`client/src/components/CartIcon.tsx`)

- Lucide `ShoppingBag` icon in site header, next to auth area
- Fuchsia badge with count from `useCart()`, hidden when 0
- Pulse animation (scale-up + glow) when count changes
- Click toggles Cart Drawer

### Cart Drawer (`client/src/components/CartDrawer.tsx`)

Slide-out panel from right. `bg-black/90 backdrop-blur-xl border-l border-[#E879F9]/10`. Full height, ~400px desktop, full-width mobile.

**Header:** "Your Cart" + count + close button

**Item list (scrollable):**
- Thumbnail (64x64), title, variant key, unit price
- Quantity controls: -/+/remove (trash icon)
- Low stock: amber "Only X left" warning
- **Add animation:** slide-down + fade-in via Framer Motion

**Footer (sticky):**
- Subtotal
- Discount code: input + "Apply". Shows applied code + amount + remove on success. Inline error on failure.
- Shipping estimate
- **Total** (bold)
- **Checkout button:** fuchsia gradient, full-width. States: "Checkout" → spinner + "Processing..." while loading. Works for both guests and logged-in users.
- Lock icon + "Secure checkout powered by Stripe"

**Empty state:** Large faded bag icon, "Your cart is empty", "Browse Store" link

**Stock errors:** On `STOCK_INSUFFICIENT`, toast per problem item, auto-adjust quantities.

### Store page updates (`client/src/pages/Store.tsx`)

Replace "Cart coming soon!" with real `addToCart` from `useCart()`.

**"Add to Cart" button states:**
1. Default: "Add to Cart" — fuchsia gradient
2. Loading: spinner + "Adding..." — disabled
3. Success: checkmark + "Added!" — green tint, 2 seconds
4. After success: "View Cart" link appears below for 5 seconds, opens Cart Drawer on click

### Success page (`client/src/pages/StoreSuccess.tsx`)

Route: `/store/success?session_id={CHECKOUT_SESSION_ID}`

Calls `store.orderBySession` on mount.

**Layout:** Purple gradient, centered glassmorphic card.

**Checkmark animation:** SVG circle draws itself (stroke-dashoffset), then checkmark draws inside. Gradient stroke `#E879F9` → `#A855F7`. ~1.5s total.

**Content:**
- "Thank you for your order!"
- Order `#${id}`
- Items table: name, variant, qty, price
- Subtotal, discount, shipping, total
- Shipping address

**Track Order section:**
- Status timeline: `Paid → Shipped → Delivered`
- Current status = fuchsia dot, future steps grayed
- "We'll email you when your order ships"

**Buttons:** "Continue Shopping" → `/store`, "Back to Home" → `/`

**Error:** "We couldn't find your order. If you were charged, please contact us."

### Admin Orders tab (`client/src/pages/admin/StoreManager.tsx`)

Tab bar: **Products** | **Orders**

**Filters:** Status dropdown + date range + **"Export CSV"** button (right-aligned)

**Table:**
- Order #, red warning icon if `hasStockIssue`
- Customer email
- Items count + first title
- Total (EUR)
- Status badge (amber/blue/purple/green/red)
- Relative date

**Detail panel (slide-out):**
- **Red banner at top** if stock issue: "Stock issue: one or more items exceeded available inventory."
- Shipping address, items with images, discount info
- Status update dropdown + confirm
- Customer notes

---

## Shipping Configuration

Uses existing `siteSettings` table:
- `store_shipping_flat_rate` — e.g. "5.00"
- `store_shipping_free_threshold` — e.g. "50.00"
- `store_currency` — default "EUR"

Admin configures in Site Settings page.

---

## Security

| Concern | Mitigation |
|---------|-----------|
| Cart tampering | Authenticated: cart from DB only. Guest: items re-validated server-side. |
| Price manipulation | All prices calculated server-side from DB values |
| Stock races | Validated in transaction at checkout + atomic decrement in webhook |
| Webhook replay | Idempotency check on `stripe_session_id` |
| Webhook spoofing | Stripe signature verification (already implemented) |
| Checkout abuse | Rate limit: 5/min per user or per IP |
| Fraud | Max 3 orders per user/IP per hour |
| Input injection | Customer notes sanitized (strip HTML, 500 char limit) |
| SQL injection | Drizzle ORM parameterized queries throughout |
| Audit | Stock changes and discount usage logged with timestamps |

---

## File Structure

```
drizzle/schema.ts                          — add cart/order tables, extend discount types
server/db.ts                               — add new schema imports
server/storeDb.ts                          — add cart, order, checkout DB functions
server/storeRouter.ts                      — add cart, checkout, guest checkout, order routes
server/webhooks/stripe.ts                  — extend for store_order handling
client/src/contexts/CartContext.tsx         — cart state provider (dual storage)
client/src/components/CartDrawer.tsx        — slide-out cart panel
client/src/components/CartIcon.tsx          — header cart icon with badge
client/src/pages/Store.tsx                 — wire real addToCart
client/src/pages/StoreSuccess.tsx          — order confirmation page
client/src/pages/admin/StoreManager.tsx    — add Orders tab
client/src/pages/Home.tsx                  — add CartIcon to header
client/src/components/MobileNav.tsx        — add CartIcon to mobile nav
client/src/App.tsx                         — add /store/success route, wrap with CartProvider
```

---

## Out of Scope (Phase 2)

- Order confirmation emails (use Stripe's built-in receipt for now)
- Real-time order tracking / shipping carrier integration
- Wishlist / favorites
- Product reviews / ratings
- Multi-currency (EUR only)
- Inventory alerts (admin monitors via dashboard)
