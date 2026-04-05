import { eq, and, desc, sql, ilike, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  storeProducts,
  StoreProduct,
  InsertStoreProduct,
  storeProductImages,
  StoreProductImage,
  InsertStoreProductImage,
  storeProductVariants,
  StoreProductVariant,
  InsertStoreProductVariant,
  storeCartItems,
  StoreCartItem,
  InsertStoreCartItem,
} from "../drizzle/schema";

// ---------------------------------------------------------------------------
// Helpers — map Supabase REST snake_case rows to camelCase TypeScript types
// ---------------------------------------------------------------------------

function mapStoreProduct(row: any): StoreProduct {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    basePrice: row.base_price,
    discountPercent: row.discount_percent,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    isPublished: row.is_published,
    isFeatured: row.is_featured,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  };
}

function mapStoreProductImage(row: any): StoreProductImage {
  return {
    id: row.id,
    productId: row.product_id,
    imageUrl: row.image_url,
    altText: row.alt_text,
    displayOrder: row.display_order,
  };
}

function mapStoreProductVariant(row: any): StoreProductVariant {
  return {
    id: row.id,
    productId: row.product_id,
    variantKey: row.variant_key,
    color: row.color,
    size: row.size,
    sku: row.sku,
    priceModifier: row.price_modifier,
    stock: row.stock,
  };
}

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

// ---------------------------------------------------------------------------
// Product Functions
// ---------------------------------------------------------------------------

/**
 * Get published products, optionally filtered by category.
 * Returns products with their images, variant count, and total stock.
 * Ordered by createdAt DESC, paginated.
 */
export async function getPublishedProducts(
  category: string | undefined,
  page: number,
  limit: number
): Promise<{
  products: (StoreProduct & { images: StoreProductImage[]; variantCount: number; totalStock: number })[];
  total: number;
}> {
  const db = await getDb();
  if (db) {
    try {
      const offset = (page - 1) * limit;

      const conditions = [eq(storeProducts.isPublished, true)];
      if (category) conditions.push(eq(storeProducts.category, category));
      const where = conditions.length === 1 ? conditions[0] : and(...conditions);

      const [products, [countRow]] = await Promise.all([
        db
          .select()
          .from(storeProducts)
          .where(where)
          .orderBy(desc(storeProducts.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(storeProducts)
          .where(where),
      ]);

      // Fetch images + variant aggregates for each product
      const productIds = products.map((p) => p.id);
      if (productIds.length === 0) return { products: [], total: 0 };

      const [images, variantAggs] = await Promise.all([
        db
          .select()
          .from(storeProductImages)
          .where(inArray(storeProductImages.productId, productIds))
          .orderBy(storeProductImages.displayOrder),
        db
          .select({
            productId: storeProductVariants.productId,
            variantCount: sql<number>`count(*)::int`,
            totalStock: sql<number>`coalesce(sum(${storeProductVariants.stock}), 0)::int`,
          })
          .from(storeProductVariants)
          .where(inArray(storeProductVariants.productId, productIds))
          .groupBy(storeProductVariants.productId),
      ]);

      const imageMap = new Map<number, StoreProductImage[]>();
      for (const img of images) {
        const list = imageMap.get(img.productId) ?? [];
        list.push(img);
        imageMap.set(img.productId, list);
      }

      const aggMap = new Map<number, { variantCount: number; totalStock: number }>();
      for (const agg of variantAggs) {
        aggMap.set(agg.productId, { variantCount: agg.variantCount, totalStock: agg.totalStock });
      }

      const enriched = products.map((p) => ({
        ...p,
        images: imageMap.get(p.id) ?? [],
        variantCount: aggMap.get(p.id)?.variantCount ?? 0,
        totalStock: aggMap.get(p.id)?.totalStock ?? 0,
      }));

      return { products: enriched, total: countRow?.count ?? 0 };
    } catch (e) {
      console.warn("[Store] getPublishedProducts direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const offset = (page - 1) * limit;

  let productsQuery = supabaseAdmin
    .from("store_products")
    .select("*")
    .eq("is_published", true);
  if (category) productsQuery = productsQuery.eq("category", category);
  productsQuery = productsQuery.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  let countQuery = supabaseAdmin
    .from("store_products")
    .select("*", { count: "exact", head: true })
    .eq("is_published", true);
  if (category) countQuery = countQuery.eq("category", category);

  const [productsRes, countRes] = await Promise.all([productsQuery, countQuery]);
  if (productsRes.error) throw new Error(productsRes.error.message);

  const products = (productsRes.data ?? []).map(mapStoreProduct);
  const productIds = products.map((p) => p.id);

  if (productIds.length === 0) return { products: [], total: 0 };

  const [imagesRes, variantsRes] = await Promise.all([
    supabaseAdmin
      .from("store_product_images")
      .select("*")
      .in("product_id", productIds)
      .order("display_order", { ascending: true }),
    supabaseAdmin
      .from("store_product_variants")
      .select("product_id, stock")
      .in("product_id", productIds),
  ]);

  const imageMap = new Map<number, StoreProductImage[]>();
  for (const row of imagesRes.data ?? []) {
    const img = mapStoreProductImage(row);
    const list = imageMap.get(img.productId) ?? [];
    list.push(img);
    imageMap.set(img.productId, list);
  }

  const aggMap = new Map<number, { variantCount: number; totalStock: number }>();
  for (const row of variantsRes.data ?? []) {
    const pid = row.product_id;
    const existing = aggMap.get(pid) ?? { variantCount: 0, totalStock: 0 };
    existing.variantCount += 1;
    existing.totalStock += row.stock ?? 0;
    aggMap.set(pid, existing);
  }

  const enriched = products.map((p) => ({
    ...p,
    images: imageMap.get(p.id) ?? [],
    variantCount: aggMap.get(p.id)?.variantCount ?? 0,
    totalStock: aggMap.get(p.id)?.totalStock ?? 0,
  }));

  return { products: enriched, total: countRes.count ?? 0 };
}

/**
 * Get a single published product by slug, with images + variants.
 * Returns null if not found or not published.
 */
export async function getProductBySlug(
  slug: string
): Promise<(StoreProduct & { images: StoreProductImage[]; variants: StoreProductVariant[] }) | null> {
  const db = await getDb();
  if (db) {
    try {
      const [product] = await db
        .select()
        .from(storeProducts)
        .where(and(eq(storeProducts.slug, slug), eq(storeProducts.isPublished, true)))
        .limit(1);

      if (!product) return null;

      const [images, variants] = await Promise.all([
        db
          .select()
          .from(storeProductImages)
          .where(eq(storeProductImages.productId, product.id))
          .orderBy(storeProductImages.displayOrder),
        db
          .select()
          .from(storeProductVariants)
          .where(eq(storeProductVariants.productId, product.id)),
      ]);

      return { ...product, images, variants };
    } catch (e) {
      console.warn("[Store] getProductBySlug direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("store_products")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .limit(1)
    .single();

  if (error || !data) return null;
  const product = mapStoreProduct(data);

  const [imagesRes, variantsRes] = await Promise.all([
    supabaseAdmin
      .from("store_product_images")
      .select("*")
      .eq("product_id", product.id)
      .order("display_order", { ascending: true }),
    supabaseAdmin
      .from("store_product_variants")
      .select("*")
      .eq("product_id", product.id),
  ]);

  return {
    ...product,
    images: (imagesRes.data ?? []).map(mapStoreProductImage),
    variants: (variantsRes.data ?? []).map(mapStoreProductVariant),
  };
}

/**
 * Get up to 6 featured+published products with their first image.
 */
export async function getFeaturedProducts(): Promise<
  (StoreProduct & { images: StoreProductImage[] })[]
> {
  const db = await getDb();
  if (db) {
    try {
      const products = await db
        .select()
        .from(storeProducts)
        .where(and(eq(storeProducts.isPublished, true), eq(storeProducts.isFeatured, true)))
        .orderBy(desc(storeProducts.createdAt))
        .limit(6);

      if (products.length === 0) return [];

      const productIds = products.map((p) => p.id);
      const images = await db
        .select()
        .from(storeProductImages)
        .where(inArray(storeProductImages.productId, productIds))
        .orderBy(storeProductImages.displayOrder);

      const imageMap = new Map<number, StoreProductImage[]>();
      for (const img of images) {
        const list = imageMap.get(img.productId) ?? [];
        list.push(img);
        imageMap.set(img.productId, list);
      }

      return products.map((p) => ({
        ...p,
        images: (imageMap.get(p.id) ?? []).slice(0, 1),
      }));
    } catch (e) {
      console.warn("[Store] getFeaturedProducts direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("store_products")
    .select("*")
    .eq("is_published", true)
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) throw new Error(error.message);
  const products = (data ?? []).map(mapStoreProduct);

  if (products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const { data: imgData } = await supabaseAdmin
    .from("store_product_images")
    .select("*")
    .in("product_id", productIds)
    .order("display_order", { ascending: true });

  const imageMap = new Map<number, StoreProductImage[]>();
  for (const row of imgData ?? []) {
    const img = mapStoreProductImage(row);
    const list = imageMap.get(img.productId) ?? [];
    list.push(img);
    imageMap.set(img.productId, list);
  }

  return products.map((p) => ({
    ...p,
    images: (imageMap.get(p.id) ?? []).slice(0, 1),
  }));
}

/**
 * Get all products (admin) — includes unpublished.
 * Optionally filtered by search (title ILIKE) and/or category.
 * Returns products with first image, variant count, and total stock.
 */
export async function getAllProducts(
  search?: string,
  category?: string
): Promise<
  (StoreProduct & { images: StoreProductImage[]; variantCount: number; totalStock: number })[]
> {
  const db = await getDb();
  if (db) {
    try {
      const conditions: ReturnType<typeof eq>[] = [];
      if (search) conditions.push(ilike(storeProducts.title, `%${search}%`));
      if (category) conditions.push(eq(storeProducts.category, category));
      const where = conditions.length > 0 ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined;

      const products = await db
        .select()
        .from(storeProducts)
        .where(where)
        .orderBy(desc(storeProducts.createdAt));

      if (products.length === 0) return [];

      const productIds = products.map((p) => p.id);
      const [images, variantAggs] = await Promise.all([
        db
          .select()
          .from(storeProductImages)
          .where(inArray(storeProductImages.productId, productIds))
          .orderBy(storeProductImages.displayOrder),
        db
          .select({
            productId: storeProductVariants.productId,
            variantCount: sql<number>`count(*)::int`,
            totalStock: sql<number>`coalesce(sum(${storeProductVariants.stock}), 0)::int`,
          })
          .from(storeProductVariants)
          .where(inArray(storeProductVariants.productId, productIds))
          .groupBy(storeProductVariants.productId),
      ]);

      const imageMap = new Map<number, StoreProductImage[]>();
      for (const img of images) {
        const list = imageMap.get(img.productId) ?? [];
        list.push(img);
        imageMap.set(img.productId, list);
      }

      const aggMap = new Map<number, { variantCount: number; totalStock: number }>();
      for (const agg of variantAggs) {
        aggMap.set(agg.productId, { variantCount: agg.variantCount, totalStock: agg.totalStock });
      }

      return products.map((p) => ({
        ...p,
        images: (imageMap.get(p.id) ?? []).slice(0, 1),
        variantCount: aggMap.get(p.id)?.variantCount ?? 0,
        totalStock: aggMap.get(p.id)?.totalStock ?? 0,
      }));
    } catch (e) {
      console.warn("[Store] getAllProducts direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  let query = supabaseAdmin.from("store_products").select("*");
  if (search) query = query.ilike("title", `%${search}%`);
  if (category) query = query.eq("category", category);
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const products = (data ?? []).map(mapStoreProduct);

  if (products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const [imagesRes, variantsRes] = await Promise.all([
    supabaseAdmin
      .from("store_product_images")
      .select("*")
      .in("product_id", productIds)
      .order("display_order", { ascending: true }),
    supabaseAdmin
      .from("store_product_variants")
      .select("product_id, stock")
      .in("product_id", productIds),
  ]);

  const imageMap = new Map<number, StoreProductImage[]>();
  for (const row of imagesRes.data ?? []) {
    const img = mapStoreProductImage(row);
    const list = imageMap.get(img.productId) ?? [];
    list.push(img);
    imageMap.set(img.productId, list);
  }

  const aggMap = new Map<number, { variantCount: number; totalStock: number }>();
  for (const row of variantsRes.data ?? []) {
    const pid = row.product_id;
    const existing = aggMap.get(pid) ?? { variantCount: 0, totalStock: 0 };
    existing.variantCount += 1;
    existing.totalStock += row.stock ?? 0;
    aggMap.set(pid, existing);
  }

  return products.map((p) => ({
    ...p,
    images: (imageMap.get(p.id) ?? []).slice(0, 1),
    variantCount: aggMap.get(p.id)?.variantCount ?? 0,
    totalStock: aggMap.get(p.id)?.totalStock ?? 0,
  }));
}

/**
 * Get a single product by id (admin — no publish check).
 * Returns product with all images and all variants, or null.
 */
export async function getProductById(
  id: number
): Promise<(StoreProduct & { images: StoreProductImage[]; variants: StoreProductVariant[] }) | null> {
  const db = await getDb();
  if (db) {
    try {
      const [product] = await db
        .select()
        .from(storeProducts)
        .where(eq(storeProducts.id, id))
        .limit(1);

      if (!product) return null;

      const [images, variants] = await Promise.all([
        db
          .select()
          .from(storeProductImages)
          .where(eq(storeProductImages.productId, id))
          .orderBy(storeProductImages.displayOrder),
        db
          .select()
          .from(storeProductVariants)
          .where(eq(storeProductVariants.productId, id)),
      ]);

      return { ...product, images, variants };
    } catch (e) {
      console.warn("[Store] getProductById direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("store_products")
    .select("*")
    .eq("id", id)
    .limit(1)
    .single();

  if (error || !data) return null;
  const product = mapStoreProduct(data);

  const [imagesRes, variantsRes] = await Promise.all([
    supabaseAdmin
      .from("store_product_images")
      .select("*")
      .eq("product_id", id)
      .order("display_order", { ascending: true }),
    supabaseAdmin
      .from("store_product_variants")
      .select("*")
      .eq("product_id", id),
  ]);

  return {
    ...product,
    images: (imagesRes.data ?? []).map(mapStoreProductImage),
    variants: (variantsRes.data ?? []).map(mapStoreProductVariant),
  };
}

/**
 * Insert a new product.
 */
export async function insertProduct(product: InsertStoreProduct): Promise<StoreProduct> {
  const db = await getDb();
  if (db) {
    try {
      const [inserted] = await db.insert(storeProducts).values(product).returning();
      return inserted;
    } catch (e) {
      console.warn("[Store] insertProduct direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("store_products")
    .insert({
      title: product.title,
      slug: product.slug,
      description: product.description,
      category: product.category,
      subcategory: product.subcategory ?? null,
      base_price: product.basePrice,
      discount_percent: product.discountPercent ?? null,
      seo_title: product.seoTitle ?? null,
      seo_description: product.seoDescription ?? null,
      is_published: product.isPublished ?? false,
      is_featured: product.isFeatured ?? false,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapStoreProduct(data);
}

/**
 * Update editable fields on a product.
 */
export async function updateProduct(
  id: number,
  data: Partial<StoreProduct>
): Promise<StoreProduct> {
  const db = await getDb();
  if (db) {
    try {
      const [updated] = await db
        .update(storeProducts)
        .set(data)
        .where(eq(storeProducts.id, id))
        .returning();
      return updated;
    } catch (e) {
      console.warn("[Store] updateProduct direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback — convert camelCase to snake_case
  const { supabaseAdmin } = await import("./lib/supabase");
  const restData: Record<string, any> = {};
  if (data.title !== undefined) restData.title = data.title;
  if (data.slug !== undefined) restData.slug = data.slug;
  if (data.description !== undefined) restData.description = data.description;
  if (data.category !== undefined) restData.category = data.category;
  if (data.subcategory !== undefined) restData.subcategory = data.subcategory;
  if (data.basePrice !== undefined) restData.base_price = data.basePrice;
  if (data.discountPercent !== undefined) restData.discount_percent = data.discountPercent;
  if (data.seoTitle !== undefined) restData.seo_title = data.seoTitle;
  if (data.seoDescription !== undefined) restData.seo_description = data.seoDescription;
  if (data.isPublished !== undefined) restData.is_published = data.isPublished;
  if (data.isFeatured !== undefined) restData.is_featured = data.isFeatured;

  const { data: updated, error } = await supabaseAdmin
    .from("store_products")
    .update(restData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapStoreProduct(updated);
}

/**
 * Delete a product with manual cascade: variants -> images -> product.
 */
export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(storeProductVariants).where(eq(storeProductVariants.productId, id));
      await db.delete(storeProductImages).where(eq(storeProductImages.productId, id));
      await db.delete(storeProducts).where(eq(storeProducts.id, id));
      return;
    } catch (e) {
      console.warn("[Store] deleteProduct direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");

  const { error: varErr } = await supabaseAdmin
    .from("store_product_variants")
    .delete()
    .eq("product_id", id);
  if (varErr) throw new Error(varErr.message);

  const { error: imgErr } = await supabaseAdmin
    .from("store_product_images")
    .delete()
    .eq("product_id", id);
  if (imgErr) throw new Error(imgErr.message);

  const { error: prodErr } = await supabaseAdmin
    .from("store_products")
    .delete()
    .eq("id", id);
  if (prodErr) throw new Error(prodErr.message);
}

/**
 * Publish a product — sets isPublished=true.
 */
export async function publishProduct(id: number): Promise<StoreProduct> {
  const db = await getDb();
  if (db) {
    try {
      const [updated] = await db
        .update(storeProducts)
        .set({ isPublished: true })
        .where(eq(storeProducts.id, id))
        .returning();
      return updated;
    } catch (e) {
      console.warn("[Store] publishProduct direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("store_products")
    .update({ is_published: true })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapStoreProduct(data);
}

/**
 * Unpublish a product — sets isPublished=false.
 */
export async function unpublishProduct(id: number): Promise<StoreProduct> {
  const db = await getDb();
  if (db) {
    try {
      const [updated] = await db
        .update(storeProducts)
        .set({ isPublished: false })
        .where(eq(storeProducts.id, id))
        .returning();
      return updated;
    } catch (e) {
      console.warn("[Store] unpublishProduct direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("store_products")
    .update({ is_published: false })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapStoreProduct(data);
}

// ---------------------------------------------------------------------------
// Image Functions
// ---------------------------------------------------------------------------

/**
 * Add an image to a product.
 */
export async function addProductImage(image: InsertStoreProductImage): Promise<StoreProductImage> {
  const db = await getDb();
  if (db) {
    try {
      const [inserted] = await db.insert(storeProductImages).values(image).returning();
      return inserted;
    } catch (e) {
      console.warn("[Store] addProductImage direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("store_product_images")
    .insert({
      product_id: image.productId,
      image_url: image.imageUrl,
      alt_text: image.altText ?? null,
      display_order: image.displayOrder ?? 0,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapStoreProductImage(data);
}

/**
 * Remove a product image by id.
 */
export async function removeProductImage(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(storeProductImages).where(eq(storeProductImages.id, id));
      return;
    } catch (e) {
      console.warn("[Store] removeProductImage direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { error } = await supabaseAdmin
    .from("store_product_images")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * Reorder product images — sets displayOrder = index position for each imageId.
 */
export async function reorderProductImages(
  productId: number,
  imageIds: number[]
): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await Promise.all(
        imageIds.map((imageId, index) =>
          db
            .update(storeProductImages)
            .set({ displayOrder: index })
            .where(
              and(
                eq(storeProductImages.id, imageId),
                eq(storeProductImages.productId, productId)
              )
            )
        )
      );
      return;
    } catch (e) {
      console.warn("[Store] reorderProductImages direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  for (let i = 0; i < imageIds.length; i++) {
    const { error } = await supabaseAdmin
      .from("store_product_images")
      .update({ display_order: i })
      .eq("id", imageIds[i])
      .eq("product_id", productId);

    if (error) throw new Error(error.message);
  }
}

// ---------------------------------------------------------------------------
// Variant Functions
// ---------------------------------------------------------------------------

/**
 * Generate a variantKey from color and size.
 */
function generateVariantKey(color?: string | null, size?: string | null): string {
  if (color && size) return `${color}-${size}`;
  if (color) return color;
  if (size) return size;
  return "One Size";
}

/**
 * Add a variant to a product.
 * Auto-generates variantKey if not provided.
 */
export async function addProductVariant(variant: InsertStoreProductVariant): Promise<StoreProductVariant> {
  const variantKey = variant.variantKey || generateVariantKey(variant.color, variant.size);
  const values = { ...variant, variantKey };

  const db = await getDb();
  if (db) {
    try {
      const [inserted] = await db.insert(storeProductVariants).values(values).returning();
      return inserted;
    } catch (e) {
      console.warn("[Store] addProductVariant direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { data, error } = await supabaseAdmin
    .from("store_product_variants")
    .insert({
      product_id: values.productId,
      variant_key: variantKey,
      color: values.color ?? null,
      size: values.size ?? null,
      sku: values.sku ?? null,
      price_modifier: values.priceModifier ?? "0",
      stock: values.stock ?? 0,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapStoreProductVariant(data);
}

/**
 * Update a variant's stock, priceModifier, or sku.
 */
export async function updateProductVariant(
  id: number,
  data: { stock?: number; priceModifier?: string; sku?: string }
): Promise<StoreProductVariant> {
  const db = await getDb();
  if (db) {
    try {
      const [updated] = await db
        .update(storeProductVariants)
        .set(data)
        .where(eq(storeProductVariants.id, id))
        .returning();
      return updated;
    } catch (e) {
      console.warn("[Store] updateProductVariant direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback — convert camelCase to snake_case
  const { supabaseAdmin } = await import("./lib/supabase");
  const restData: Record<string, any> = {};
  if (data.stock !== undefined) restData.stock = data.stock;
  if (data.priceModifier !== undefined) restData.price_modifier = data.priceModifier;
  if (data.sku !== undefined) restData.sku = data.sku;

  const { data: updated, error } = await supabaseAdmin
    .from("store_product_variants")
    .update(restData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapStoreProductVariant(updated);
}

/**
 * Delete a variant by id.
 */
export async function deleteProductVariant(id: number): Promise<void> {
  const db = await getDb();
  if (db) {
    try {
      await db.delete(storeProductVariants).where(eq(storeProductVariants.id, id));
      return;
    } catch (e) {
      console.warn("[Store] deleteProductVariant direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const { error } = await supabaseAdmin
    .from("store_product_variants")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/**
 * Bulk-create variants for all color x size combinations.
 * Uses onConflictDoNothing for safety.
 */
export async function bulkCreateVariants(
  productId: number,
  colors: string[],
  sizes: string[],
  stock: number,
  priceModifier?: string
): Promise<StoreProductVariant[]> {
  const variants: InsertStoreProductVariant[] = colors.flatMap((color) =>
    sizes.map((size) => ({
      productId,
      variantKey: `${color}-${size}`,
      color,
      size,
      priceModifier: priceModifier ?? "0",
      stock,
    }))
  );

  if (variants.length === 0) return [];

  const db = await getDb();
  if (db) {
    try {
      const inserted = await db
        .insert(storeProductVariants)
        .values(variants)
        .onConflictDoNothing()
        .returning();
      return inserted;
    } catch (e) {
      console.warn("[Store] bulkCreateVariants direct query failed, trying REST:", (e as Error).message);
    }
  }

  // REST API fallback
  const { supabaseAdmin } = await import("./lib/supabase");
  const restVariants = variants.map((v) => ({
    product_id: v.productId,
    variant_key: v.variantKey,
    color: v.color ?? null,
    size: v.size ?? null,
    price_modifier: v.priceModifier ?? "0",
    stock: v.stock ?? 0,
  }));

  // Supabase upsert with ignoreDuplicates acts like onConflictDoNothing
  const { data, error } = await supabaseAdmin
    .from("store_product_variants")
    .upsert(restVariants, {
      onConflict: "product_id,variant_key",
      ignoreDuplicates: true,
    })
    .select("*");

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapStoreProductVariant);
}

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
