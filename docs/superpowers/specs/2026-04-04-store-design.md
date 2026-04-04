# Store System Design

## Overview

A premium e-commerce store for the High Heels Dance platform where users can browse and purchase dance clothing, accessories, and shoes. Features product catalog with color+size variants, persistent cart (localStorage for guests, Supabase for logged-in users), Stripe Checkout for payments, order management for admin, and a featured products section on the homepage.

## Implementation Phases

**Phase 1 — Product Catalog + Admin Store Manager + Public Store Page + Homepage Section**
Gets products visible on the site. Admin can add/edit products, manage variants and images, set stock levels.

**Phase 2 — Cart + Checkout + Order Management**
Adds cart persistence, Stripe Checkout integration, order creation on payment, admin order tracking with status updates.

---

## Database Schema

### `store_products`

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| title | varchar(255) | not null |
| slug | varchar(255) | unique, not null |
| description | text | not null |
| category | varchar(50) | not null |
| subcategory | varchar(50) | nullable |
| base_price | numeric(10,2) | not null |
| discount_percent | integer | nullable, 0-100 |
| seo_title | varchar(255) | nullable |
| seo_description | text | nullable |
| is_published | boolean | not null, default false |
| is_featured | boolean | not null, default false |
| created_at | timestamp | not null, default now() |

Index on `slug`. Index on `is_published`. Index on `category`.

### `store_product_images`

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| product_id | integer | FK → store_products, not null, on delete cascade |
| image_url | text | not null |
| alt_text | varchar(255) | nullable |
| display_order | integer | not null, default 0 |

Index on `product_id`.

### `store_product_variants`

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| product_id | integer | FK → store_products, not null, on delete cascade |
| variant_key | varchar(50) | not null (e.g. "Black-S", "Red-M", "One Size") |
| color | varchar(50) | nullable |
| size | varchar(20) | nullable |
| sku | varchar(50) | unique, nullable |
| price_modifier | numeric(10,2) | not null, default 0 |
| stock | integer | not null, default 0 |

Unique constraint on `(product_id, variant_key)`. Index on `product_id`.

### `store_cart_items`

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| user_id | integer | FK → users, not null, on delete cascade |
| product_id | integer | FK → store_products, not null |
| variant_id | integer | FK → store_product_variants, not null |
| quantity | integer | not null, default 1 |
| added_at | timestamp | not null, default now() |

Unique constraint on `(user_id, product_id, variant_id)`.

### `store_orders`

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
| discount_amount | numeric(10,2) | not null, default 0 |
| discount_code | varchar(50) | nullable |
| shipping_cost | numeric(10,2) | not null, default 0 |
| total | numeric(10,2) | not null |
| customer_notes | text | nullable |
| stripe_session_id | varchar(255) | nullable |
| stripe_payment_id | varchar(255) | nullable |
| created_at | timestamp | not null, default now() |

Index on `user_id`. Index on `status`.

### `store_order_items`

| Column | Type | Constraints |
|--------|------|-------------|
| id | serial | PK |
| order_id | integer | FK → store_orders, not null, on delete cascade |
| product_id | integer | FK → store_products, not null |
| variant_id | integer | FK → store_product_variants, nullable |
| quantity | integer | not null |
| unit_price | numeric(10,2) | not null |

Index on `order_id`.

---

## tRPC Routes

### Public Routes

```
store.list({ category?, page, limit }) → { products: Product[], total }
  - Published products with first image and variant summary
  - Filterable by category
  - Ordered by created_at DESC

store.getBySlug({ slug }) → Product with all images + all variants
  - Full product detail for product page/modal
  - Only published products

store.featured() → Product[]
  - Products where is_featured=true and is_published=true
  - Limited to 6, with first image
```

### User Routes (authenticated)

```
store.cart.get() → CartItem[] (with product title, image, variant details, stock)
store.cart.add({ productId, variantId, quantity }) → CartItem
  - Upsert: if item exists, increment quantity
  - Validate stock availability
store.cart.update({ productId, variantId, quantity }) → CartItem
  - Set exact quantity, validate stock
store.cart.remove({ productId, variantId }) → { ok }
store.cart.clear() → { ok }
store.cart.merge({ items: { productId, variantId, quantity }[] }) → CartItem[]
  - Merge localStorage cart into DB cart on login
  - DB quantity wins on conflict (takes max)
```

### Checkout Route (authenticated or guest)

```
store.checkout({
  items: { productId, variantId, quantity }[],
  customerNotes?
}) → { url: string }
  - Validates all items are in stock
  - Calculates subtotal (base_price + price_modifier per variant, minus discount)
  - Calculates shipping (flat rate from siteSettings, free above threshold)
  - Creates Stripe Checkout session with line items
  - Stripe collects shipping address via shipping_address_collection
  - Returns Stripe Checkout URL
```

### Stripe Webhook

On `checkout.session.completed`:
- Create `store_orders` row with shipping details from Stripe session
- Create `store_order_items` rows
- Decrement `stock` on each variant
- Clear user's cart (if authenticated)

### Admin Routes

```
adminStore.products.list({ search?, category? }) → Product[]
  - All products (published + unpublished), with images and variant count

adminStore.products.getById({ id }) → Product with all images + all variants

adminStore.products.create({
  title, description, category, subcategory?, base_price,
  discount_percent?, seo_title?, seo_description?, is_featured?
}) → Product
  - Auto-generates slug from title
  - Created as unpublished draft

adminStore.products.update({ id, ...fields }) → Product
  - Update any product field

adminStore.products.delete({ id }) → { ok }
  - Cascades to images, variants, cart items

adminStore.products.publish({ id }) → Product
adminStore.products.unpublish({ id }) → Product

adminStore.images.add({ productId, imageUrl, altText?, displayOrder? }) → Image
adminStore.images.remove({ id }) → { ok }
adminStore.images.reorder({ productId, imageIds: number[] }) → { ok }
  - Sets display_order based on array position

adminStore.variants.add({
  productId, color?, size?, sku?, price_modifier?, stock
}) → Variant
  - Auto-generates variant_key from color+size (e.g. "Black-S")
  - If no color/size, variant_key = "One Size"

adminStore.variants.update({ id, stock?, price_modifier?, sku? }) → Variant
adminStore.variants.delete({ id }) → { ok }

adminStore.variants.bulkCreate({
  productId, colors: string[], sizes: string[], stock, price_modifier?
}) → Variant[]
  - Creates all color×size combinations at once

adminStore.orders.list({ status?, page, limit }) → { orders, total }
  - With order items and product titles

adminStore.orders.getById({ id }) → Order with items + product details

adminStore.orders.updateStatus({ id, status }) → Order
  - Transitions: pending→paid→shipped→delivered, or any→cancelled
```

---

## Cart Logic

### CartContext Provider

Wraps the app in `client/src/contexts/CartContext.tsx`.

**State:**
```typescript
interface CartItem {
  productId: number;
  variantId: number;
  quantity: number;
  // Enriched from product data:
  title?: string;
  imageUrl?: string;
  variantKey?: string;
  unitPrice?: number;
  stock?: number;
}
```

**Guest flow (not authenticated):**
- Cart stored in `localStorage` key `"hh-cart"`
- All operations read/write localStorage
- Product details fetched on mount to enrich items

**Authenticated flow:**
- Cart stored in `store_cart_items` table
- All operations call tRPC mutations
- On login: call `store.cart.merge` with localStorage items, then clear localStorage
- On logout: export DB cart to localStorage, then clear DB cart

**Exposed API:**
```typescript
const {
  items,         // CartItem[]
  count,         // total quantity
  subtotal,      // sum of unitPrice * quantity
  addToCart,     // (productId, variantId, qty) => void
  removeFromCart, // (productId, variantId) => void
  updateQuantity, // (productId, variantId, qty) => void
  clearCart,     // () => void
  isLoading,     // boolean
} = useCart();
```

---

## Shipping Configuration

Stored in existing `siteSettings` table:
- `store_shipping_flat_rate` — flat rate amount (e.g. "5.00")
- `store_shipping_free_threshold` — free shipping above this amount (e.g. "50.00")
- `store_currency` — currency code (default "EUR")

Admin configures these in Site Settings page.

---

## Frontend Pages

### `/store` — Store Page

- Same purple gradient background + ambient glows as rest of site
- Header: "Shop" title, subtitle
- Category filter tabs: All / Tops / Bottoms / Accessories / Shoes
- Product grid: 1 col mobile, 2 cols tablet, 3 cols desktop
- Product cards (glassmorphic):
  - Main product image (first by display_order)
  - Title, price (with discount strikethrough if applicable)
  - "Quick View" on hover
  - Category badge
- Click → product detail modal:
  - Image carousel (swipeable on mobile)
  - Title, description, price
  - Color selector (swatches)
  - Size selector (buttons)
  - Stock indicator ("In Stock" / "Only 2 left" / "Out of Stock")
  - Quantity selector
  - "Add to Cart" button (disabled if out of stock)
- Pagination

### Homepage "Shop" Section

- Placed after courses section
- Section title: "Shop" with decorative separators (same pattern as courses heading)
- Grid of 4-6 featured products (is_featured=true)
- Each card: image, title, price
- "Browse All Products" button → /store

### Cart Drawer

- Slide-out from right side (triggered by cart icon in header)
- Cart icon in header shows badge with item count
- List of items: image, title, variant, quantity controls (- / + / remove), line total
- Subtotal, shipping estimate, total
- "Checkout" button → triggers Stripe Checkout
- Empty state: "Your cart is empty" with "Browse Store" link

### `/store/success` — Order Confirmation

- "Thank you for your order!" message
- Order summary
- "Continue Shopping" button

### Admin `/admin/store` — Store Manager

**Products Tab:**
- Table: image thumbnail, title, category, price, stock summary, status, actions
- Create button → modal with: title, description, category, subcategory, base_price, discount_percent, SEO fields
- Edit → same modal pre-filled
- Image management section in edit modal:
  - Upload multiple images
  - Drag/drop to reorder
  - Delete with confirmation
  - Alt text editing
- Variant management section:
  - List of existing variants with stock/price inline-editable
  - "Add Variant" form: color + size → auto-generates variant_key
  - "Bulk Create" button: select multiple colors + sizes → creates all combinations
  - Delete variant
- Publish/Unpublish toggle
- Feature toggle (star icon)

**Orders Tab:**
- Table: order #, customer email, items count, total, status badge, date
- Status filter: All / Pending / Paid / Shipped / Delivered / Cancelled
- Click → order detail: full shipping info, item list, status update dropdown

---

## File Structure

### Phase 1 (Product Catalog)
```
drizzle/schema.ts                          — add store tables
server/storeDb.ts                          — store DB functions (with REST fallback)
server/storeRouter.ts                      — store tRPC routes (public + admin products)
client/src/pages/Store.tsx                 — /store page with product grid + detail modal
client/src/pages/admin/StoreManager.tsx    — admin Store Manager (products tab)
client/src/pages/Home.tsx                  — add featured products section
client/src/App.tsx                         — add routes
client/src/components/AdminLayout.tsx      — add Store Manager menu item
server/routers.ts                          — mount store + adminStore routers
server/db.ts                               — add schema imports
```

### Phase 2 (Cart + Checkout + Orders)
```
client/src/contexts/CartContext.tsx         — cart state provider
client/src/components/CartDrawer.tsx        — slide-out cart
client/src/components/CartIcon.tsx          — header cart icon with badge
client/src/pages/StoreSuccess.tsx          — /store/success confirmation
client/src/pages/admin/StoreManager.tsx    — add orders tab
server/storeDb.ts                          — add cart + order DB functions
server/storeRouter.ts                      — add cart, checkout, webhook, admin order routes
client/src/pages/Home.tsx                  — add cart icon to header
```

---

## Stripe Checkout Configuration

Reuses existing Stripe setup. Checkout session created with:
- `line_items`: one per cart item with `price_data` (product name + variant, unit amount)
- `shipping_address_collection`: enabled, allowed countries configurable
- `mode`: "payment" (one-time, not subscription)
- `success_url`: `/store/success?session_id={CHECKOUT_SESSION_ID}`
- `cancel_url`: `/store`
- `metadata`: cart items JSON for webhook processing
- `customer_email`: user email if authenticated

Webhook handler: `checkout.session.completed` → create order, decrement stock, clear cart.

---

## Environment Variables

No new env vars needed — uses existing:
- `STRIPE_SECRET_KEY` — already configured
- `STRIPE_WEBHOOK_SECRET` — already configured (if using webhooks)
- Supabase storage for product images — already available

---

## Out of Scope

- Wishlist / favorites
- Product reviews / ratings
- Multi-currency support (EUR only for v1)
- Advanced discount codes (reuse existing discount system if needed later)
- Product search (category filter is sufficient for v1)
- Guest checkout (require account for v1 — simplifies cart sync and order history)
