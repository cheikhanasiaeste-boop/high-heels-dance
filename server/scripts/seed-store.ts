import "dotenv/config";
import { getDb } from "../db";
import { storeProducts, storeProductImages, storeProductVariants } from "../../drizzle/schema";

const products = [
  {
    title: "Velvet High Heels Dance Top",
    slug: "velvet-high-heels-dance-top",
    description: "A luxurious velvet crop top designed for high heels dance. Soft, stretchy fabric that moves with you while keeping its elegant shape. Perfect for classes, performances, and nights out.",
    category: "tops",
    basePrice: "34.99",
    discountPercent: null,
    seoTitle: "Velvet Dance Top for High Heels | Elizabeth Zolotova",
    seoDescription: "Premium velvet crop top for heels dance classes and performances. Soft, stretchy, elegant.",
    isPublished: true,
    isFeatured: true,
    images: [
      { url: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&q=80", alt: "Velvet dance top front view" },
      { url: "https://images.unsplash.com/photo-1583846783214-7229a91b20ed?w=800&q=80", alt: "Velvet dance top side view" },
    ],
    variants: [
      { color: "Black", sizes: ["XS", "S", "M", "L", "XL"], stock: 15, priceModifier: "0" },
      { color: "Burgundy", sizes: ["XS", "S", "M", "L"], stock: 10, priceModifier: "0" },
    ],
  },
  {
    title: "High-Waist Dance Shorts",
    slug: "high-waist-dance-shorts",
    description: "Sleek high-waisted shorts with a flattering cut for heels dance. Four-way stretch fabric for maximum freedom of movement during floor work and choreography.",
    category: "bottoms",
    basePrice: "29.99",
    discountPercent: 15,
    seoTitle: "High-Waist Dance Shorts | Elizabeth Zolotova",
    seoDescription: "High-waisted dance shorts with 4-way stretch. Perfect for heels dance floor work.",
    isPublished: true,
    isFeatured: true,
    images: [
      { url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80", alt: "High-waist dance shorts" },
      { url: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=800&q=80", alt: "Dance shorts back view" },
    ],
    variants: [
      { color: "Black", sizes: ["XS", "S", "M", "L", "XL"], stock: 20, priceModifier: "0" },
      { color: "Pink", sizes: ["S", "M", "L"], stock: 8, priceModifier: "2.00" },
    ],
  },
  {
    title: "Strappy Practice Heels 7cm",
    slug: "strappy-practice-heels-7cm",
    description: "Professional dance heels with secure ankle strap and cushioned insole. 7cm heel height — ideal for beginners and intermediate dancers. Non-slip sole for studio floors.",
    category: "shoes",
    basePrice: "59.99",
    discountPercent: null,
    seoTitle: "Strappy Dance Heels 7cm | Elizabeth Zolotova",
    seoDescription: "Professional 7cm dance heels with ankle strap and cushioned insole. Perfect for beginners.",
    isPublished: true,
    isFeatured: true,
    images: [
      { url: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800&q=80", alt: "Strappy dance heels front" },
      { url: "https://images.unsplash.com/photo-1596703263926-eb0762ee17e4?w=800&q=80", alt: "Dance heels side view" },
    ],
    variants: [
      { color: "Black", sizes: ["36", "37", "38", "39", "40", "41"], stock: 5, priceModifier: "0" },
      { color: "Nude", sizes: ["36", "37", "38", "39", "40"], stock: 4, priceModifier: "0" },
    ],
  },
  {
    title: "Crystal Dance Earrings",
    slug: "crystal-dance-earrings",
    description: "Lightweight crystal drop earrings that catch the light beautifully during performances. Hypoallergenic posts, secure butterfly backs. Add sparkle to every turn and spin.",
    category: "accessories",
    basePrice: "18.99",
    discountPercent: null,
    seoTitle: "Crystal Dance Earrings | Elizabeth Zolotova",
    seoDescription: "Lightweight crystal earrings for dance performances. Hypoallergenic, secure backs.",
    isPublished: true,
    isFeatured: true,
    images: [
      { url: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&q=80", alt: "Crystal dance earrings" },
    ],
    variants: [
      { color: "Silver", sizes: ["One Size"], stock: 25, priceModifier: "0" },
      { color: "Gold", sizes: ["One Size"], stock: 20, priceModifier: "2.00" },
    ],
  },
  {
    title: "Mesh Bodysuit for Dance",
    slug: "mesh-bodysuit-for-dance",
    description: "A stunning mesh bodysuit with strategic lining for dance classes and performances. Breathable, figure-hugging design that looks incredible under stage lighting.",
    category: "tops",
    basePrice: "44.99",
    discountPercent: 20,
    seoTitle: "Mesh Dance Bodysuit | Elizabeth Zolotova",
    seoDescription: "Mesh bodysuit for heels dance classes and performances. Breathable, elegant, figure-hugging.",
    isPublished: true,
    isFeatured: true,
    images: [
      { url: "https://images.unsplash.com/photo-1518577915332-c2a19f149a75?w=800&q=80", alt: "Mesh bodysuit front" },
      { url: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&q=80", alt: "Mesh bodysuit styled" },
    ],
    variants: [
      { color: "Black", sizes: ["XS", "S", "M", "L"], stock: 12, priceModifier: "0" },
      { color: "Wine", sizes: ["S", "M", "L"], stock: 6, priceModifier: "0" },
    ],
  },
  {
    title: "Professional Knee Pads",
    slug: "professional-knee-pads",
    description: "Essential protection for floor work in heels dance. Slim, low-profile design that stays in place during rolls, slides, and butterflies. Comfortable gel cushioning.",
    category: "accessories",
    basePrice: "24.99",
    discountPercent: null,
    seoTitle: "Dance Knee Pads | Elizabeth Zolotova",
    seoDescription: "Professional knee pads for heels dance floor work. Slim, gel-cushioned, stays in place.",
    isPublished: true,
    isFeatured: true,
    images: [
      { url: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80", alt: "Professional dance knee pads" },
    ],
    variants: [
      { color: "Black", sizes: ["S", "M", "L"], stock: 30, priceModifier: "0" },
      { color: "Nude", sizes: ["S", "M", "L"], stock: 15, priceModifier: "0" },
    ],
  },
];

async function main() {
  console.log("=== Seeding Store Products ===\n");

  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    process.exit(1);
  }

  let created = 0;

  for (const p of products) {
    console.log(`Creating: ${p.title}`);

    // Insert product
    const [product] = await db
      .insert(storeProducts)
      .values({
        title: p.title,
        slug: p.slug,
        description: p.description,
        category: p.category,
        basePrice: p.basePrice,
        discountPercent: p.discountPercent,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
        isPublished: p.isPublished,
        isFeatured: p.isFeatured,
      })
      .onConflictDoNothing()
      .returning();

    if (!product) {
      console.log("  → Skipped (already exists)");
      continue;
    }

    // Insert images
    for (let i = 0; i < p.images.length; i++) {
      await db.insert(storeProductImages).values({
        productId: product.id,
        imageUrl: p.images[i].url,
        altText: p.images[i].alt,
        displayOrder: i,
      });
    }
    console.log(`  → ${p.images.length} images added`);

    // Insert variants
    let variantCount = 0;
    for (const v of p.variants) {
      for (const size of v.sizes) {
        const variantKey = `${v.color}-${size}`;
        await db.insert(storeProductVariants).values({
          productId: product.id,
          variantKey,
          color: v.color,
          size,
          priceModifier: v.priceModifier,
          stock: v.stock,
        });
        variantCount++;
      }
    }
    console.log(`  → ${variantCount} variants created`);
    created++;
  }

  console.log(`\n=== Done! Created ${created} products ===`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
