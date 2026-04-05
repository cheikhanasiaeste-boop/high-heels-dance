import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Minus, Plus, ShoppingCart, Check, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useCart } from "@/contexts/CartContext";
import { CartDrawer } from "@/components/CartDrawer";

const LIMIT = 12;

const CATEGORIES = [
  { label: "All", value: undefined },
  { label: "Tops", value: "tops" },
  { label: "Bottoms", value: "bottoms" },
  { label: "Accessories", value: "accessories" },
  { label: "Shoes", value: "shoes" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

// basePrice comes from the server as a numeric string (e.g. "29.99")
function formatPrice(price: number | string) {
  return `€${Number(price).toFixed(2)}`;
}

function discountedPrice(basePrice: number | string, discountPercent: number) {
  return Number(basePrice) * (1 - discountPercent / 100);
}

// ─── Product Card ────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: {
    id: number;
    title: string;
    slug: string;
    category: string;
    basePrice: number | string;
    discountPercent: number | null;
    images: { id: number; imageUrl: string; altText: string | null; displayOrder: number }[];
  };
  onClick: () => void;
}

function ProductCard({ product, onClick }: ProductCardProps) {
  const firstImage = product.images?.[0];
  const hasDiscount = (product.discountPercent ?? 0) > 0;
  const finalPrice = discountedPrice(product.basePrice, product.discountPercent ?? 0);

  return (
    <div
      onClick={onClick}
      className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-3 border border-[#E879F9]/10 hover:border-[#E879F9]/25 hover:shadow-[0_0_30px_rgba(232,121,249,0.08)] transition-all duration-500 group cursor-pointer flex flex-col"
    >
      {/* Image */}
      <div className="relative w-full h-64 rounded-xl overflow-hidden mb-3">
        {firstImage ? (
          <img
            src={firstImage.imageUrl}
            alt={firstImage.altText ?? product.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-fuchsia-900/40 to-purple-900/40 flex items-center justify-center">
            <ShoppingCart className="h-12 w-12 text-white/20" />
          </div>
        )}
        {hasDiscount && (
          <div className="absolute top-2 right-2 bg-gradient-to-r from-red-500 to-fuchsia-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md">
            -{product.discountPercent ?? 0}%
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 px-1 pb-1 gap-1">
        <p className="text-xs text-white/30 uppercase tracking-wider">
          {product.category}
        </p>

        <h2
          className="text-lg font-semibold text-white group-hover:text-[#E879F9] transition-colors duration-200 line-clamp-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {product.title}
        </h2>

        {/* Price */}
        <div className="flex items-baseline gap-2 mt-auto pt-1">
          {hasDiscount ? (
            <>
              <span className="text-white/40 line-through text-sm">
                {formatPrice(product.basePrice)}
              </span>
              <span className="text-[#E879F9] font-bold text-lg">
                {formatPrice(finalPrice)}
              </span>
            </>
          ) : (
            <span className="text-white font-bold text-lg">
              {formatPrice(product.basePrice)}
            </span>
          )}
        </div>

        <div className="h-px bg-gradient-to-r from-[#E879F9]/30 via-[#C026D3]/20 to-transparent mt-2" />
      </div>
    </div>
  );
}

// ─── Product Detail Modal ─────────────────────────────────────────────────────

interface ProductModalProps {
  slug: string | null;
  onClose: () => void;
  onOpenCart: () => void;
}

function ProductModal({ slug, onClose, onOpenCart }: ProductModalProps) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [addState, setAddState] = useState<"idle" | "loading" | "success">("idle");

  const { data: product, isLoading } = trpc.store.getBySlug.useQuery(
    { slug: slug! },
    { enabled: !!slug }
  );

  // Reset UI state whenever the active slug changes
  useEffect(() => {
    setSelectedImageIndex(0);
    setSelectedColor(null);
    setSelectedSize(null);
    setQuantity(1);
  }, [slug]);

  // Unique colors from variants
  const colors = product
    ? Array.from(
        new Set(
          (product.variants ?? [])
            .map((v: { color: string | null }) => v.color)
            .filter(Boolean) as string[]
        )
      )
    : [];

  // Sizes available for selected color
  const sizesForColor = product
    ? (product.variants ?? [])
        .filter(
          (v: { color: string | null; size: string | null }) =>
            !selectedColor || v.color === selectedColor
        )
        .map((v: { size: string | null }) => v.size)
        .filter((s: string | null): s is string => !!s)
    : [];
  const uniqueSizes = Array.from(new Set(sizesForColor));

  // Matched variant
  const matchedVariant = product
    ? (product.variants ?? []).find(
        (v: { color: string | null; size: string | null }) =>
          (!selectedColor || v.color === selectedColor) &&
          (!selectedSize || v.size === selectedSize)
      )
    : null;

  const stock: number = matchedVariant ? (matchedVariant.stock ?? 0) : 0;
  const isOutOfStock = matchedVariant ? stock === 0 : false;

  const { addToCart } = useCart();

  const handleAddToCart = () => {
    if (!product || !matchedVariant) return;
    setAddState("loading");
    addToCart(product.id, matchedVariant.id, quantity, {
      title: product.title,
      imageUrl: product.images?.[0]?.imageUrl ?? null,
      variantKey: [matchedVariant.color, matchedVariant.size].filter(Boolean).join(" — "),
      color: matchedVariant.color ?? null,
      size: matchedVariant.size ?? null,
      unitPrice: Number(
        (product.discountPercent ?? 0) > 0
          ? discountedPrice(product.basePrice, product.discountPercent ?? 0)
          : product.basePrice
      ),
      stock: matchedVariant.stock ?? 0,
    });
    toast.success("Added to cart!", {
      action: {
        label: "View Cart",
        onClick: () => { onOpenCart(); },
      },
    });
    setAddState("success");
    setTimeout(() => setAddState("idle"), 2000);
  };

  const hasDiscount = product && (product.discountPercent ?? 0) > 0;
  const finalPrice = product
    ? discountedPrice(product.basePrice, product.discountPercent ?? 0)
    : 0;

  return (
    <Dialog open={!!slug} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl bg-gradient-to-b from-[#1a0525] to-[#200a35] border-[#E879F9]/20 text-white p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        {isLoading || !product ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#E879F9] mx-auto mb-3" />
              <p className="text-white/40 text-sm">Loading product…</p>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-0">
            {/* Left – Image Gallery */}
            <div className="p-4 flex flex-col gap-3">
              {/* Main image */}
              <div className="w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-fuchsia-900/40 to-purple-900/40">
                {product.images?.[selectedImageIndex] ? (
                  <img
                    src={product.images[selectedImageIndex].imageUrl}
                    alt={
                      product.images[selectedImageIndex].altText ?? product.title
                    }
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ShoppingCart className="h-16 w-16 text-white/20" />
                  </div>
                )}
              </div>

              {/* Thumbnails */}
              {product.images && product.images.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {product.images.map(
                    (
                      img: { id: number; imageUrl: string; altText: string | null },
                      idx: number
                    ) => (
                      <button
                        key={img.id}
                        onClick={() => setSelectedImageIndex(idx)}
                        className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                          idx === selectedImageIndex
                            ? "border-[#E879F9] shadow-[0_0_10px_rgba(232,121,249,0.4)]"
                            : "border-white/10 hover:border-white/30"
                        }`}
                      >
                        <img
                          src={img.imageUrl}
                          alt={img.altText ?? product.title}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Right – Product Info */}
            <div className="p-6 flex flex-col gap-4 border-l border-[#E879F9]/10">
              {/* Category */}
              <p className="text-xs text-white/30 uppercase tracking-wider">
                {product.category}
                {product.subcategory ? ` / ${product.subcategory}` : ""}
              </p>

              {/* Title */}
              <h2
                className="text-2xl font-bold text-white leading-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {product.title}
              </h2>

              {/* Price */}
              <div className="flex items-baseline gap-3">
                {hasDiscount ? (
                  <>
                    <span className="text-white/40 line-through text-base">
                      {formatPrice(product.basePrice)}
                    </span>
                    <span className="text-[#E879F9] font-bold text-2xl">
                      {formatPrice(finalPrice)}
                    </span>
                    <span className="bg-gradient-to-r from-red-500 to-fuchsia-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      -{product.discountPercent}%
                    </span>
                  </>
                ) : (
                  <span className="text-white font-bold text-2xl">
                    {formatPrice(product.basePrice)}
                  </span>
                )}
              </div>

              {/* Description */}
              {product.description && (
                <p className="text-white/60 text-sm leading-relaxed">
                  {product.description}
                </p>
              )}

              <div className="h-px bg-gradient-to-r from-[#E879F9]/20 via-[#C026D3]/10 to-transparent" />

              {/* Color Selector */}
              {colors.length > 0 && (
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-2">
                    Color
                    {selectedColor && (
                      <span className="ml-2 text-white/70 normal-case tracking-normal">
                        {selectedColor}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          setSelectedColor(
                            selectedColor === color ? null : color
                          );
                          setSelectedSize(null);
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                          selectedColor === color
                            ? "bg-[#C026D3] border-[#C026D3] text-white shadow-[0_0_12px_rgba(192,38,211,0.4)]"
                            : "bg-white/[0.06] border-white/10 text-white/60 hover:text-white hover:border-white/30"
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size Selector */}
              {uniqueSizes.length > 0 && (
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-2">
                    Size
                    {selectedSize && (
                      <span className="ml-2 text-white/70 normal-case tracking-normal">
                        {selectedSize}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {uniqueSizes.map((size) => (
                      <button
                        key={size}
                        onClick={() =>
                          setSelectedSize(selectedSize === size ? null : size)
                        }
                        className={`w-10 h-10 rounded-lg text-sm font-medium border transition-all duration-200 ${
                          selectedSize === size
                            ? "bg-[#C026D3] border-[#C026D3] text-white shadow-[0_0_12px_rgba(192,38,211,0.4)]"
                            : "bg-white/[0.06] border-white/10 text-white/60 hover:text-white hover:border-white/30"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock Indicator */}
              {matchedVariant && (
                <div className="flex items-center gap-2">
                  {isOutOfStock ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                      <span className="text-red-400 text-sm">Out of Stock</span>
                    </>
                  ) : stock < 5 ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                      <span className="text-amber-300 text-sm">
                        Only {stock} left
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="h-2 w-2 rounded-full bg-green-400 inline-block" />
                      <span className="text-green-300 text-sm">In Stock</span>
                    </>
                  )}
                </div>
              )}

              {/* Quantity Selector */}
              {matchedVariant && !isOutOfStock && (
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-wider mb-2">
                    Quantity
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.06] flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-all disabled:opacity-30"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-white font-semibold w-6 text-center">
                      {quantity}
                    </span>
                    <button
                      onClick={() =>
                        setQuantity((q) => Math.min(stock, q + 1))
                      }
                      disabled={quantity >= stock}
                      className="h-8 w-8 rounded-full border border-white/10 bg-white/[0.06] flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-all disabled:opacity-30"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Add to Cart */}
              <Button
                onClick={handleAddToCart}
                disabled={
                  !matchedVariant ||
                  (!!matchedVariant && isOutOfStock) ||
                  addState === "loading" ||
                  addState === "success"
                }
                className="w-full mt-auto bg-gradient-to-r from-[#E879F9] to-[#A855F7] hover:opacity-90 text-white border-0 shadow-[0_0_20px_rgba(232,121,249,0.3)] hover:shadow-[0_0_30px_rgba(232,121,249,0.5)] transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {addState === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding…
                  </>
                ) : addState === "success" ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Added!
                  </>
                ) : matchedVariant && isOutOfStock ? (
                  "Out of Stock"
                ) : !matchedVariant ? (
                  "Select Options"
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Add to Cart
                  </>
                )}
              </Button>

              {/* View Cart shortcut after success */}
              {addState === "success" && (
                <button
                  onClick={onOpenCart}
                  className="text-sm text-[#E879F9] hover:text-white transition-colors text-center w-full mt-1"
                >
                  View Cart →
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Store Page ───────────────────────────────────────────────────────────────

export default function Store() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<CategoryValue>(undefined);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const { data, isLoading } = trpc.store.list.useQuery({
    category,
    page,
    limit: LIMIT,
  });

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E879F9] mx-auto mb-4" />
          <p className="text-white/50">Loading products…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a0525] via-[#200a35] to-[#150020] relative overflow-hidden">
      {/* Ambient glow orbs */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-fuchsia-500 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute bottom-40 right-10 w-[400px] h-[400px] bg-purple-400 rounded-full blur-[150px] opacity-[0.08]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600 rounded-full blur-[200px] opacity-[0.05]" />
      </div>

      {/* Header */}
      <div className="border-b border-[#E879F9]/10 bg-white/[0.03] backdrop-blur-sm relative z-10">
        <div className="container py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
          </div>
          <h1
            className="text-4xl font-bold mb-2 text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Shop
          </h1>
          <p className="text-white/50">
            Dance apparel, accessories, and everything you need on the floor
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8 relative z-10">
        {/* Category Filter */}
        <div className="flex justify-start mb-8">
          <div className="inline-flex items-center gap-1 bg-white/[0.06] p-1 rounded-full border border-white/[0.08]">
            {CATEGORIES.map((cat) => (
              <button
                key={String(cat.value)}
                onClick={() => {
                  setCategory(cat.value);
                  setPage(1);
                }}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  category === cat.value
                    ? "bg-[#C026D3] text-white shadow-sm"
                    : "text-white/50 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {products.length === 0 ? (
          <div className="text-center py-24">
            <ShoppingCart className="h-14 w-14 text-white/20 mx-auto mb-4" />
            <p className="text-white/40 text-lg">No products yet.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => setSelectedSlug(product.slug)}
                />
              ))}
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-center gap-4 mt-12">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="border-[#E879F9]/20 text-white/70 hover:border-[#E879F9]/50 hover:text-white disabled:opacity-30"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>

                <span className="text-white/40 text-sm">
                  Page {page} of {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="border-[#E879F9]/20 text-white/70 hover:border-[#E879F9]/50 hover:text-white disabled:opacity-30"
                >
                  Next
                  <ArrowLeft className="h-4 w-4 ml-1 rotate-180" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Product Detail Modal */}
      <ProductModal
        slug={selectedSlug}
        onClose={() => setSelectedSlug(null)}
        onOpenCart={() => setCartOpen(true)}
      />

      {/* Cart Drawer */}
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
