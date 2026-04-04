# Store System — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a product catalog with admin Store Manager, public `/store` page with product detail modal, and featured products section on the homepage.

**Architecture:** New Drizzle tables for store products, images, and variants. Separate `server/storeDb.ts` and `server/storeRouter.ts` files (with Supabase REST fallback for Render production). Frontend follows the existing purple gradient glassmorphic theme. Admin Store Manager follows existing AdminLayout pattern.

**Tech Stack:** Drizzle ORM, tRPC, Supabase (storage for images), React + wouter, Tailwind CSS, Framer Motion

**Spec:** `docs/superpowers/specs/2026-04-04-store-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `drizzle/schema.ts` | Add store_products, store_product_images, store_product_variants tables |
| Modify | `server/db.ts` | Import and re-export new schema types |
| Create | `server/storeDb.ts` | All store DB query functions with REST fallback |
| Create | `server/storeRouter.ts` | tRPC routes (public store + admin store manager) |
| Modify | `server/routers.ts` | Mount store + adminStore routers |
| Create | `client/src/pages/Store.tsx` | Public /store page with grid + product detail modal |
| Create | `client/src/pages/admin/StoreManager.tsx` | Admin Store Manager page |
| Modify | `client/src/pages/Home.tsx` | Add featured products section |
| Modify | `client/src/App.tsx` | Add routes |
| Modify | `client/src/components/AdminLayout.tsx` | Add Store Manager menu item |

---

### Task 1: Database Schema

**Files:**
- Modify: `drizzle/schema.ts` (append after line 534)
- Modify: `server/db.ts` (add imports)

- [ ] **Step 1: Add store tables to schema**

Append to `drizzle/schema.ts` after the `newsletterSubscribers` table:

```typescript
/**
 * Store products — physical goods (clothes, accessories, shoes)
 */
export const storeProducts = pgTable("store_products", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).unique().notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  subcategory: varchar("subcategory", { length: 50 }),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
  discountPercent: integer("discount_percent"),
  seoTitle: varchar("seo_title", { length: 255 }),
  seoDescription: text("seo_description"),
  isPublished: boolean("is_published").default(false).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("store_products_slug_idx").on(table.slug),
  index("store_products_published_idx").on(table.isPublished),
  index("store_products_category_idx").on(table.category),
]);

export type StoreProduct = typeof storeProducts.$inferSelect;
export type InsertStoreProduct = typeof storeProducts.$inferInsert;

/**
 * Product images — multiple images per product with ordering
 */
export const storeProductImages = pgTable("store_product_images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  imageUrl: text("image_url").notNull(),
  altText: varchar("alt_text", { length: 255 }),
  displayOrder: integer("display_order").default(0).notNull(),
}, (table) => [
  index("store_images_product_idx").on(table.productId),
]);

export type StoreProductImage = typeof storeProductImages.$inferSelect;
export type InsertStoreProductImage = typeof storeProductImages.$inferInsert;

/**
 * Product variants — color+size combinations with individual stock and price modifier
 */
export const storeProductVariants = pgTable("store_product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  variantKey: varchar("variant_key", { length: 50 }).notNull(),
  color: varchar("color", { length: 50 }),
  size: varchar("size", { length: 20 }),
  sku: varchar("sku", { length: 50 }).unique(),
  priceModifier: numeric("price_modifier", { precision: 10, scale: 2 }).default("0").notNull(),
  stock: integer("stock").default(0).notNull(),
}, (table) => [
  index("store_variants_product_idx").on(table.productId),
  unique("store_variants_product_key").on(table.productId, table.variantKey),
]);

export type StoreProductVariant = typeof storeProductVariants.$inferSelect;
export type InsertStoreProductVariant = typeof storeProductVariants.$inferInsert;
```

- [ ] **Step 2: Add imports to server/db.ts**

Add to the import block in `server/db.ts`:

```typescript
  storeProducts,
  StoreProduct,
  InsertStoreProduct,
  storeProductImages,
  StoreProductImage,
  InsertStoreProductImage,
  storeProductVariants,
  StoreProductVariant,
  InsertStoreProductVariant,
```

- [ ] **Step 3: Push schema to database**

Run: `npx drizzle-kit push`

- [ ] **Step 4: Commit**

```bash
git add drizzle/schema.ts server/db.ts
git commit -m "feat(store): add store_products, store_product_images, store_product_variants tables"
```

---

### Task 2: Store DB Functions

**Files:**
- Create: `server/storeDb.ts`

- [ ] **Step 1: Create server/storeDb.ts with all DB query functions**

This file must export these functions (all with Supabase REST API fallback, matching the pattern in `blogDb.ts`):

**Product functions:**
1. `getPublishedProducts(category?: string, page: number, limit: number)` → `{ products, total }` — published products with first image and variant count, filterable by category, ordered by createdAt DESC
2. `getProductBySlug(slug: string)` → product with all images (ordered by displayOrder) + all variants, only published
3. `getFeaturedProducts()` → up to 6 featured+published products with first image
4. `getAllProducts(search?: string, category?: string)` → all products (admin), with first image and variant/stock summary
5. `getProductById(id: number)` → product with all images + all variants (admin, no publish check)
6. `insertProduct(product: InsertStoreProduct)` → created product
7. `updateProduct(id: number, data: Partial<StoreProduct>)` → updated product
8. `deleteProduct(id: number)` → void (cascades handled by deleting images+variants first)
9. `publishProduct(id: number)` → updated product
10. `unpublishProduct(id: number)` → updated product

**Image functions:**
11. `addProductImage(image: InsertStoreProductImage)` → created image
12. `removeProductImage(id: number)` → void
13. `reorderProductImages(productId: number, imageIds: number[])` → void (sets displayOrder by array position)

**Variant functions:**
14. `addProductVariant(variant: InsertStoreProductVariant)` → created variant (auto-generate variantKey from color+size)
15. `updateProductVariant(id: number, data: { stock?: number, priceModifier?: string, sku?: string })` → updated variant
16. `deleteProductVariant(id: number)` → void
17. `bulkCreateVariants(productId: number, colors: string[], sizes: string[], stock: number, priceModifier?: string)` → created variants array

For the REST API fallback, use snake_case column names and add mapper helpers (`mapStoreProduct`, `mapStoreProductImage`, `mapStoreProductVariant`) similar to `blogDb.ts`.

For `getProductBySlug` and `getProductById`: fetch the product, then separately fetch its images and variants, and return them combined as `{ ...product, images: [...], variants: [...] }`.

For `getAllProducts`: use a subquery or separate query to get the first image per product (min displayOrder) and variant count + total stock.

- [ ] **Step 2: Commit**

```bash
git add server/storeDb.ts
git commit -m "feat(store): add store DB query functions with REST fallback"
```

---

### Task 3: Store tRPC Routers

**Files:**
- Create: `server/storeRouter.ts`
- Modify: `server/routers.ts` (mount routers)

- [ ] **Step 1: Create server/storeRouter.ts**

Exports two routers: `storeRouter` (public) and `adminStoreRouter` (admin).

**`storeRouter` (public):**
- `list` — publicProcedure, input: `{ category?: string, page: number (default 1), limit: number (default 12) }`, calls `storeDb.getPublishedProducts`
- `getBySlug` — publicProcedure, input: `{ slug: string }`, calls `storeDb.getProductBySlug`, throws NOT_FOUND if null
- `featured` — publicProcedure, no input, calls `storeDb.getFeaturedProducts`

**`adminStoreRouter` (admin):**

Products:
- `products.list` — input: `{ search?: string, category?: string }`, calls `storeDb.getAllProducts`
- `products.getById` — input: `{ id: number }`, calls `storeDb.getProductById`, throws NOT_FOUND
- `products.create` — input: `{ title, description, category, subcategory?, basePrice, discountPercent?, seoTitle?, seoDescription?, isFeatured? }`, auto-generates slug from title, calls `storeDb.insertProduct`
- `products.update` — input: `{ id, ...optional fields }`, calls `storeDb.updateProduct`
- `products.delete` — input: `{ id }`, calls `storeDb.deleteProduct`
- `products.publish` — input: `{ id }`, calls `storeDb.publishProduct`
- `products.unpublish` — input: `{ id }`, calls `storeDb.unpublishProduct`

Images:
- `images.add` — input: `{ productId, imageUrl, altText?, displayOrder? }`, calls `storeDb.addProductImage`
- `images.remove` — input: `{ id }`, calls `storeDb.removeProductImage`
- `images.reorder` — input: `{ productId, imageIds: number[] }`, calls `storeDb.reorderProductImages`

Variants:
- `variants.add` — input: `{ productId, color?, size?, sku?, priceModifier?, stock }`, calls `storeDb.addProductVariant`
- `variants.update` — input: `{ id, stock?, priceModifier?, sku? }`, calls `storeDb.updateProductVariant`
- `variants.delete` — input: `{ id }`, calls `storeDb.deleteProductVariant`
- `variants.bulkCreate` — input: `{ productId, colors: string[], sizes: string[], stock, priceModifier? }`, calls `storeDb.bulkCreateVariants`

Slug generation helper (in same file):
```typescript
function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 200);
}
```

- [ ] **Step 2: Mount in server/routers.ts**

Add import after line 8:
```typescript
import { storeRouter, adminStoreRouter } from "./storeRouter";
```

Add to `appRouter` before closing `});`:
```typescript
  store: storeRouter,
  adminStore: adminStoreRouter,
```

- [ ] **Step 3: Commit**

```bash
git add server/storeRouter.ts server/routers.ts
git commit -m "feat(store): add store and admin store tRPC routers"
```

---

### Task 4: Frontend Routes + Admin Menu

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/AdminLayout.tsx`

- [ ] **Step 1: Add routes to App.tsx**

Add imports:
```typescript
import Store from "./pages/Store";
import StoreManager from "./pages/admin/StoreManager";
```

Add public route (after `/blog/:slug`):
```tsx
<Route path="/store" component={Store} />
```

Add admin route (after `/admin/blog`):
```tsx
<Route path="/admin/store">{() => <AdminGuard><StoreManager /></AdminGuard>}</Route>
```

- [ ] **Step 2: Add Store Manager to AdminLayout sidebar**

In `client/src/components/AdminLayout.tsx`, add `ShoppingBag` to the lucide-react import. Add to `menuItems` array before "Manage Blog":
```typescript
{ path: "/admin/store", icon: ShoppingBag, label: "Store Manager" },
```

- [ ] **Step 3: Commit**

```bash
git add client/src/App.tsx client/src/components/AdminLayout.tsx
git commit -m "feat(store): add /store route and admin Store Manager menu item"
```

---

### Task 5: Public Store Page

**Files:**
- Create: `client/src/pages/Store.tsx`

- [ ] **Step 1: Create Store.tsx**

Full store page with:

**Layout:** Same purple gradient + ambient glows as blog/courses pages. Glassmorphic header with "Back" link and "Shop" title.

**Category filter tabs:** All / Tops / Bottoms / Accessories / Shoes — horizontal pill bar, same style as courses filter tabs. Uses `useState` for active category, passed to `trpc.store.list.useQuery({ category, page, limit: 12 })`.

**Product grid:** `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8`. Each card is glassmorphic (`bg-white/[0.04] backdrop-blur-sm rounded-2xl p-3 border border-[#E879F9]/10 hover:border-[#E879F9]/25 hover:shadow-[0_0_30px_rgba(232,121,249,0.08)] transition-all duration-500`).

**Product card contents:**
- Main image (first image from product, or gradient placeholder)
- Image has hover zoom: `transition-transform duration-700 group-hover:scale-[1.05]`
- Category badge (top-right, small uppercase text)
- Discount badge if `discountPercent` > 0 (e.g. "-20%")
- Title (hover color `#E879F9`)
- Price: show discounted price + original strikethrough if discount exists
- "Quick View" text appears on hover

**Product detail modal:** Opens when clicking a card. Uses Dialog component. Contains:
- Image carousel: show all product images, clickable thumbnails below main image
- Product title, description
- Price with discount
- Color selector: colored circles/swatches from unique variant colors
- Size selector: pill buttons from unique variant sizes for selected color
- Stock indicator based on selected variant
- Quantity selector (1-10, capped at stock)
- "Add to Cart" button — disabled if out of stock. For Phase 1, show a toast "Cart coming soon!" since cart is Phase 2.
- Close button

**Pagination:** Same Previous/Next as blog page.

**Loading/empty states** matching the theme.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Store.tsx
git commit -m "feat(store): add /store page with product grid and detail modal"
```

---

### Task 6: Admin Store Manager Page

**Files:**
- Create: `client/src/pages/admin/StoreManager.tsx`

- [ ] **Step 1: Create StoreManager.tsx**

Admin page following the same pattern as `admin/Blog.tsx`. Uses `AdminLayout` wrapper, auth checks.

**Product list:**
- Table with columns: Image (small thumbnail), Title, Category, Price, Stock (total across variants), Status (Published/Draft badge), Featured (star), Actions
- Search input for filtering by title
- Category dropdown filter
- Actions: Edit, Publish/Unpublish, Toggle Featured, Delete

**Create product button** → opens modal:
- Title, Description (textarea), Category (dropdown: tops, bottoms, accessories, shoes, other), Subcategory (optional input), Base Price (number), Discount % (optional), SEO Title, SEO Description
- Featured checkbox
- Save creates as unpublished draft

**Edit product modal** (same as create, pre-filled, plus):
- **Images section:**
  - List of current images with thumbnails, alt text input, display order
  - "Add Image" — URL input (or Supabase upload if storage is set up) + alt text
  - Delete image button with confirmation
  - Up/Down arrows or reorder buttons to change display_order
- **Variants section:**
  - Table of current variants: variant_key, color, size, stock (inline editable), price_modifier (inline editable), sku, delete button
  - "Add Variant" form: color input + size input → auto-generates variant_key
  - "Bulk Create" button: comma-separated colors + comma-separated sizes → creates all combinations with default stock
  - Stock is directly editable in the table (input field)

**tRPC hooks used:**
- `trpc.adminStore.products.list.useQuery`
- `trpc.adminStore.products.create.useMutation`
- `trpc.adminStore.products.update.useMutation`
- `trpc.adminStore.products.delete.useMutation`
- `trpc.adminStore.products.publish.useMutation`
- `trpc.adminStore.products.unpublish.useMutation`
- `trpc.adminStore.products.getById.useQuery` (for edit modal, fetches images+variants)
- `trpc.adminStore.images.add.useMutation`
- `trpc.adminStore.images.remove.useMutation`
- `trpc.adminStore.images.reorder.useMutation`
- `trpc.adminStore.variants.add.useMutation`
- `trpc.adminStore.variants.update.useMutation`
- `trpc.adminStore.variants.delete.useMutation`
- `trpc.adminStore.variants.bulkCreate.useMutation`

All mutations invalidate `adminStore.products.list` via `trpc.useUtils()`. Toast feedback on success/error.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/admin/StoreManager.tsx
git commit -m "feat(store): add admin Store Manager with product, image, and variant management"
```

---

### Task 7: Homepage Featured Products Section

**Files:**
- Modify: `client/src/pages/Home.tsx`

- [ ] **Step 1: Add featured products section to Home.tsx**

Add after the courses section (after line 654, before the testimonials section).

Uses `trpc.store.featured.useQuery()`.

Same section structure as courses:
- `<section>` with purple gradient background + ambient glows
- Section header: "Shop" with decorative separators (same pattern as courses heading)
- Subtitle: "Dance essentials handpicked for you"
- Grid of up to 6 products: 1 col mobile, 2 cols tablet, 3 cols desktop
- Each card (glassmorphic): product image, title, price (with discount if applicable)
- Click → navigates to `/store` (or specific product slug)
- "Browse All Products" button at bottom → `/store`

Only render the section if there are featured products (don't show empty section).

Add `ShoppingBag` to the lucide-react import.

Also add "Shop" to the desktop nav links (after "Blog"):
```tsx
<Link href="/store">
  <span className="text-sm font-medium text-white/70 uppercase tracking-[0.15em] hover:text-white transition-colors cursor-pointer">Shop</span>
</Link>
```

And add to MobileNav.tsx similarly.

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Home.tsx client/src/components/MobileNav.tsx
git commit -m "feat(store): add featured products section and Shop nav link to homepage"
```

---

### Task 8: Push Schema + Deploy

- [ ] **Step 1: Push schema to database**

Run: `npx drizzle-kit push`

- [ ] **Step 2: Verify dev server compiles**

Run: `npm run dev`
Navigate to `http://localhost:3000/store` and `http://localhost:3000/admin/store`

- [ ] **Step 3: Deploy to production**

Run: `./deploy.sh`

- [ ] **Step 4: Commit any fixes**

```bash
git push origin main
```

---

## Phase 2 Tasks (Cart + Checkout + Orders)

These tasks build on Phase 1 and should be implemented after Phase 1 is verified working in production.

### Task 9: Cart Database + DB Functions

**Files:**
- Modify: `drizzle/schema.ts` (add store_cart_items, store_orders, store_order_items)
- Modify: `server/db.ts` (add imports)
- Modify: `server/storeDb.ts` (add cart + order functions)

Add three tables: `store_cart_items`, `store_orders`, `store_order_items` per spec.

Add DB functions:
- `getCartItems(userId)`, `addCartItem(userId, productId, variantId, qty)`, `updateCartItemQuantity(userId, productId, variantId, qty)`, `removeCartItem(userId, productId, variantId)`, `clearCart(userId)`, `mergeCart(userId, items[])`
- `createOrder(data)`, `createOrderItems(orderId, items[])`, `getOrders(status?, page, limit)`, `getOrderById(id)`, `updateOrderStatus(id, status)`, `decrementVariantStock(variantId, quantity)`

Push schema: `npx drizzle-kit push`

### Task 10: Cart Context Provider

**Files:**
- Create: `client/src/contexts/CartContext.tsx`
- Modify: `client/src/App.tsx` (wrap with CartProvider)

CartContext with dual storage:
- Guest: localStorage `"hh-cart"`
- Authenticated: tRPC mutations to `store.cart.*`
- On login: merge localStorage → DB via `store.cart.merge`, clear localStorage
- Exposes: `items`, `count`, `subtotal`, `addToCart`, `removeFromCart`, `updateQuantity`, `clearCart`, `isLoading`

### Task 11: Cart tRPC Routes

**Files:**
- Modify: `server/storeRouter.ts` (add cart + checkout routes)

Add to `storeRouter`:
- `cart.get`, `cart.add`, `cart.update`, `cart.remove`, `cart.clear`, `cart.merge` (all protectedProcedure)
- `checkout` (protectedProcedure) — validates stock, calculates totals, creates Stripe Checkout session with `shipping_address_collection`, returns URL

### Task 12: Cart Drawer Component

**Files:**
- Create: `client/src/components/CartDrawer.tsx`
- Create: `client/src/components/CartIcon.tsx`
- Modify: `client/src/pages/Home.tsx` (add CartIcon to header)

CartDrawer: slide-out panel from right, shows items with images, variant info, quantity controls, subtotal, shipping estimate, "Checkout" button.

CartIcon: shopping bag icon with badge showing cart count, placed in header next to user profile.

### Task 13: Store Page — Wire Add to Cart

**Files:**
- Modify: `client/src/pages/Store.tsx`

Replace the "Cart coming soon!" toast with actual `addToCart` call from CartContext. Enable the full add-to-cart flow with variant selection.

### Task 14: Checkout + Stripe Webhook

**Files:**
- Modify: `server/storeRouter.ts` (add webhook handler)
- Create: `client/src/pages/StoreSuccess.tsx`
- Modify: `client/src/App.tsx` (add /store/success route)

Webhook on `checkout.session.completed`: create order, create order items, decrement stock, clear cart.

StoreSuccess page: "Thank you!" confirmation with order summary.

### Task 15: Admin Orders Tab

**Files:**
- Modify: `client/src/pages/admin/StoreManager.tsx` (add Orders tab)
- Modify: `server/storeRouter.ts` (add admin order routes)

Add tabbed view to StoreManager: Products | Orders.

Orders tab: table of orders with status badges, filters, click to view detail, status update dropdown.

### Task 16: Final Integration Test + Deploy

- Verify full flow: browse → add to cart → checkout → Stripe → order created → admin sees order
- Deploy to production
