import { useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Lock,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatPrice(n: number) {
  return `€${n.toFixed(2)}`;
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, count, subtotal, removeFromCart, updateQuantity, isLoading } =
    useCart();
  const { isAuthenticated } = useAuth();

  // Discount code state
  const [discountInput, setDiscountInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<{
    type: string;
    value: number;
  } | null>(null);
  const [codeToValidate, setCodeToValidate] = useState<string | null>(null);

  const validateQuery = trpc.store.validateDiscount.useQuery(
    { code: codeToValidate! },
    {
      enabled: !!codeToValidate,
      retry: false,
    }
  );

  const handleApplyCode = () => {
    const trimmed = discountInput.trim().toUpperCase();
    if (!trimmed) return;
    setCodeToValidate(trimmed);
    // watch the query result in the render
  };

  // Apply result when validation succeeds
  if (
    codeToValidate &&
    validateQuery.data &&
    !validateQuery.isFetching &&
    appliedCode !== codeToValidate
  ) {
    if (validateQuery.data.valid) {
      setAppliedCode(codeToValidate);
      setAppliedDiscount({
        type: validateQuery.data.discountType as string,
        value: validateQuery.data.discountValue as number,
      });
      setDiscountInput("");
      setCodeToValidate(null);
    }
  }

  const removeAppliedCode = () => {
    setAppliedCode(null);
    setAppliedDiscount(null);
    setCodeToValidate(null);
  };

  // Compute discount amount
  const discountAmount = (() => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.type === "percent") {
      return (subtotal * appliedDiscount.value) / 100;
    }
    return Math.min(appliedDiscount.value, subtotal);
  })();

  const discountedSubtotal = subtotal - discountAmount;
  const shipping = discountedSubtotal >= 50 ? 0 : 5;
  const total = discountedSubtotal + shipping;

  // Checkout mutation
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const checkoutMutation = trpc.store.checkout.useMutation({
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Checkout failed — no redirect URL returned.");
        setCheckoutLoading(false);
      }
    },
    onError: (err) => {
      toast.error(err.message ?? "Checkout failed.");
      setCheckoutLoading(false);
    },
  });

  const handleCheckout = () => {
    if (!isAuthenticated) {
      toast("Sign in to complete your purchase.", {
        description: "Create a free account or log in to checkout.",
      });
      return;
    }
    setCheckoutLoading(true);
    checkoutMutation.mutate({
      discountCode: appliedCode ?? undefined,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="cart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            key="cart-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-black/90 backdrop-blur-xl border-l border-[#E879F9]/10 z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E879F9]/10">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#E879F9]" />
                <h2
                  className="text-lg font-bold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Your Cart
                </h2>
                <span className="text-white/40 text-sm">({count} items)</span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close cart"
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            {items.length === 0 ? (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
                <ShoppingBag className="w-16 h-16 text-white/10" />
                <p className="text-white/50 text-lg font-medium">
                  Your cart is empty
                </p>
                <Link href="/store" onClick={onClose}>
                  <Button className="bg-gradient-to-r from-[#E879F9] to-[#A855F7] text-white border-0 hover:opacity-90">
                    Browse Store
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                {/* Item list */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {isLoading && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-[#E879F9] animate-spin" />
                    </div>
                  )}
                  {items.map((item) => {
                    const variantLabel = [item.color, item.size]
                      .filter(Boolean)
                      .join(" — ");
                    return (
                      <div
                        key={`${item.productId}-${item.variantId}`}
                        className="flex items-start gap-3 bg-white/[0.04] rounded-xl p-3 border border-[#E879F9]/10"
                      >
                        {/* Image */}
                        <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-fuchsia-900/40 to-purple-900/40 flex items-center justify-center">
                              <ShoppingBag className="w-4 h-4 text-white/20" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-white/90 text-sm font-medium leading-tight truncate">
                            {item.title}
                          </p>
                          {variantLabel && (
                            <p className="text-white/40 text-xs mt-0.5">
                              {variantLabel}
                            </p>
                          )}
                          <p className="text-[#E879F9] text-sm font-semibold mt-1">
                            {formatPrice(item.unitPrice)}
                          </p>
                          {item.stock <= 3 && item.stock > 0 && (
                            <p className="text-amber-400 text-xs mt-0.5">
                              Only {item.stock} left
                            </p>
                          )}

                          {/* Quantity controls */}
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => {
                                if (item.quantity <= 1) {
                                  removeFromCart(item.productId, item.variantId);
                                } else {
                                  updateQuantity(
                                    item.productId,
                                    item.variantId,
                                    item.quantity - 1
                                  );
                                }
                              }}
                              className="w-6 h-6 rounded-full border border-white/10 bg-white/[0.06] flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-all"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-white text-sm w-5 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.variantId,
                                  item.quantity + 1
                                )
                              }
                              disabled={item.quantity >= item.stock}
                              className="w-6 h-6 rounded-full border border-white/10 bg-white/[0.06] flex items-center justify-center text-white/60 hover:text-white hover:border-white/30 transition-all disabled:opacity-30"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() =>
                            removeFromCart(item.productId, item.variantId)
                          }
                          aria-label="Remove item"
                          className="p-1 text-white/30 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="border-t border-[#E879F9]/10 px-5 py-4 space-y-4">
                  {/* Discount code */}
                  <div>
                    {appliedCode && appliedDiscount ? (
                      <div className="flex items-center justify-between bg-[#E879F9]/10 border border-[#E879F9]/20 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-[#E879F9]" />
                          <span className="text-white/80 text-sm font-medium">
                            {appliedCode}
                          </span>
                          <span className="text-[#E879F9] text-sm">
                            (
                            {appliedDiscount.type === "percent"
                              ? `-${appliedDiscount.value}%`
                              : `-${formatPrice(appliedDiscount.value)}`}
                            )
                          </span>
                        </div>
                        <button
                          onClick={removeAppliedCode}
                          className="text-white/40 hover:text-white transition-colors"
                          aria-label="Remove discount code"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={discountInput}
                          onChange={(e) =>
                            setDiscountInput(e.target.value.toUpperCase())
                          }
                          onKeyDown={(e) => e.key === "Enter" && handleApplyCode()}
                          placeholder="Discount code"
                          className="flex-1 bg-white/[0.06] border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#E879F9]/40 transition-colors"
                        />
                        <Button
                          onClick={handleApplyCode}
                          disabled={
                            !discountInput.trim() || validateQuery.isFetching
                          }
                          size="sm"
                          className="bg-white/[0.08] hover:bg-white/[0.12] text-white border border-white/10 rounded-xl"
                        >
                          {validateQuery.isFetching ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Apply"
                          )}
                        </Button>
                      </div>
                    )}
                    {/* Error */}
                    {codeToValidate &&
                      validateQuery.data &&
                      !validateQuery.data.valid &&
                      !validateQuery.isFetching && (
                        <p className="text-red-400 text-xs mt-1.5 px-1">
                          {validateQuery.data.reason ?? "Invalid code"}
                        </p>
                      )}
                  </div>

                  {/* Price breakdown */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-white/60 text-sm">
                      <span>Subtotal</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-[#E879F9] text-sm">
                        <span>Discount ({appliedCode})</span>
                        <span>-{formatPrice(discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-white/60 text-sm">
                      <span>Shipping</span>
                      <span>
                        {shipping === 0 ? (
                          <span className="text-green-400">Free</span>
                        ) : (
                          formatPrice(shipping)
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-white font-bold text-base pt-1.5 border-t border-white/10">
                      <span>Total</span>
                      <span>{formatPrice(total)}</span>
                    </div>
                  </div>

                  {/* Checkout button */}
                  <Button
                    onClick={handleCheckout}
                    disabled={checkoutLoading}
                    className="w-full bg-gradient-to-r from-[#E879F9] to-[#A855F7] text-white border-0 hover:opacity-90 transition-all shadow-[0_0_20px_rgba(232,121,249,0.25)] disabled:opacity-60"
                  >
                    {checkoutLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing…
                      </>
                    ) : !isAuthenticated ? (
                      "Sign In to Checkout"
                    ) : (
                      "Checkout"
                    )}
                  </Button>

                  {/* Secure note */}
                  <p className="flex items-center justify-center gap-1.5 text-white/25 text-xs">
                    <Lock className="w-3 h-3" />
                    Secure checkout powered by Stripe
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
