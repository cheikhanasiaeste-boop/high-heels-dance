import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CartItem {
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
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  addToCart: (
    productId: number,
    variantId: number,
    qty: number,
    enrichment?: Omit<CartItem, "productId" | "variantId" | "quantity">
  ) => void;
  removeFromCart: (productId: number, variantId: number) => void;
  updateQuantity: (productId: number, variantId: number, qty: number) => void;
  clearCart: () => void;
  isLoading: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CartContext = createContext<CartContextValue>({
  items: [],
  count: 0,
  subtotal: 0,
  addToCart: (_productId, _variantId, _qty, _enrichment?) => {
    throw new Error("useCart must be used within CartProvider");
  },
  removeFromCart: () => {
    throw new Error("useCart must be used within CartProvider");
  },
  updateQuantity: () => {
    throw new Error("useCart must be used within CartProvider");
  },
  clearCart: () => {
    throw new Error("useCart must be used within CartProvider");
  },
  isLoading: false,
});

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const LS_KEY = "hh-cart";

function readLocalCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

function writeLocalCart(items: CartItem[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // storage quota exceeded or unavailable — fail silently
  }
}

function clearLocalCart(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // fail silently
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  // ── Guest state ────────────────────────────────────────────────────────────
  const [guestItems, setGuestItems] = useState<CartItem[]>([]);

  // Hydrate guest cart from localStorage on mount
  useEffect(() => {
    setGuestItems(readLocalCart());
  }, []);

  // ── Server cart query (auth only) ──────────────────────────────────────────
  const cartQuery = trpc.store.cart.get.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 60000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addMutation = trpc.store.cart.add.useMutation({
    onSuccess: () => utils.store.cart.get.invalidate(),
    onError: (err) => toast.error(err.message ?? "Failed to add item"),
  });

  const updateMutation = trpc.store.cart.update.useMutation({
    onSuccess: () => utils.store.cart.get.invalidate(),
    onError: (err) => toast.error(err.message ?? "Failed to update cart"),
  });

  const removeMutation = trpc.store.cart.remove.useMutation({
    onSuccess: () => utils.store.cart.get.invalidate(),
    onError: (err) => toast.error(err.message ?? "Failed to remove item"),
  });

  const clearMutation = trpc.store.cart.clear.useMutation({
    onSuccess: () => utils.store.cart.get.invalidate(),
    onError: (err) => toast.error(err.message ?? "Failed to clear cart"),
  });

  const mergeMutation = trpc.store.cart.merge.useMutation({
    onSuccess: () => {
      clearLocalCart();
      setGuestItems([]);
      utils.store.cart.get.invalidate();
    },
    onError: (err) => toast.error(err.message ?? "Failed to merge cart"),
  });

  // ── Track auth transitions for merge / logout save ─────────────────────────
  const prevAuthRef = useRef<boolean | null>(null);
  const mergeFiredRef = useRef(false);

  useEffect(() => {
    const wasAuthenticated = prevAuthRef.current;

    // Login transition: wasAuthenticated was false/null → now true
    if (isAuthenticated && wasAuthenticated === false) {
      mergeFiredRef.current = false; // reset so merge can fire
    }

    // Fire merge once when we become authenticated
    if (isAuthenticated && !mergeFiredRef.current) {
      mergeFiredRef.current = true;
      const localItems = readLocalCart();
      if (localItems.length > 0) {
        mergeMutation.mutate({
          items: localItems.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        });
      }
    }

    // Logout transition: was authenticated → now not
    if (!isAuthenticated && wasAuthenticated === true) {
      const serverItems: CartItem[] = (cartQuery.data ?? []).map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        title: i.title,
        imageUrl: i.imageUrl,
        variantKey: i.variantKey,
        color: i.color,
        size: i.size,
        unitPrice: i.unitPrice,
        stock: i.stock,
      }));
      if (serverItems.length > 0) {
        writeLocalCart(serverItems);
        setGuestItems(serverItems);
      }
      mergeFiredRef.current = false;
    }

    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived items ──────────────────────────────────────────────────────────
  const items: CartItem[] = useMemo(
    () =>
      isAuthenticated
        ? (cartQuery.data ?? []).map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            title: i.title,
            imageUrl: i.imageUrl,
            variantKey: i.variantKey,
            color: i.color,
            size: i.size,
            unitPrice: i.unitPrice,
            stock: i.stock,
          }))
        : guestItems,
    [isAuthenticated, cartQuery.data, guestItems]
  );

  const count = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );
  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    [items]
  );
  const isLoading = isAuthenticated ? cartQuery.isLoading : false;

  // ── Cart actions ───────────────────────────────────────────────────────────

  const addToCart = useCallback(
    (
      productId: number,
      variantId: number,
      qty: number,
      enrichment?: Omit<CartItem, "productId" | "variantId" | "quantity">
    ): void => {
      if (isAuthenticated) {
        addMutation.mutate({ productId, variantId, quantity: qty });
      } else {
        setGuestItems((prev) => {
          const existing = prev.find(
            (i) => i.productId === productId && i.variantId === variantId
          );
          let next: CartItem[];
          if (existing) {
            next = prev.map((i) =>
              i.productId === productId && i.variantId === variantId
                ? { ...i, quantity: i.quantity + qty }
                : i
            );
          } else {
            const newItem: CartItem = enrichment
              ? { productId, variantId, quantity: qty, ...enrichment }
              : {
                  productId,
                  variantId,
                  quantity: qty,
                  title: "",
                  imageUrl: null,
                  variantKey: "",
                  color: null,
                  size: null,
                  unitPrice: 0,
                  stock: 0,
                };
            next = [...prev, newItem];
          }
          writeLocalCart(next);
          return next;
        });
      }
    },
    [isAuthenticated, addMutation]
  );

  const removeFromCart = useCallback(
    (productId: number, variantId: number): void => {
      if (isAuthenticated) {
        removeMutation.mutate({ productId, variantId });
      } else {
        setGuestItems((prev) => {
          const next = prev.filter(
            (i) => !(i.productId === productId && i.variantId === variantId)
          );
          writeLocalCart(next);
          return next;
        });
      }
    },
    [isAuthenticated, removeMutation]
  );

  const updateQuantity = useCallback(
    (productId: number, variantId: number, qty: number): void => {
      if (isAuthenticated) {
        if (qty === 0) {
          removeMutation.mutate({ productId, variantId });
        } else {
          updateMutation.mutate({ productId, variantId, quantity: qty });
        }
      } else {
        setGuestItems((prev) => {
          const next =
            qty === 0
              ? prev.filter(
                  (i) =>
                    !(i.productId === productId && i.variantId === variantId)
                )
              : prev.map((i) =>
                  i.productId === productId && i.variantId === variantId
                    ? { ...i, quantity: qty }
                    : i
                );
          writeLocalCart(next);
          return next;
        });
      }
    },
    [isAuthenticated, removeMutation, updateMutation]
  );

  const clearCart = useCallback((): void => {
    if (isAuthenticated) {
      clearMutation.mutate();
    } else {
      clearLocalCart();
      setGuestItems([]);
    }
  }, [isAuthenticated, clearMutation]);

  const contextValue = useMemo(
    () => ({
      items,
      count,
      subtotal,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      isLoading,
    }),
    [items, count, subtotal, addToCart, removeFromCart, updateQuantity, clearCart, isLoading]
  );

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
