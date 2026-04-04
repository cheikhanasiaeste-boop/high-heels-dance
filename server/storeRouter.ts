import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as storeDb from "./storeDb";

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
      .mutation(({ input }) => storeDb.updateProduct(input)),

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
      .mutation(({ input }) => storeDb.addProductVariant(input)),

    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          stock: z.number().min(0).optional(),
          priceModifier: z.string().optional(),
          sku: z.string().max(50).optional(),
        })
      )
      .mutation(({ input }) => storeDb.updateProductVariant(input)),

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
      .mutation(({ input }) => storeDb.bulkCreateVariants(input)),
  }),
});
