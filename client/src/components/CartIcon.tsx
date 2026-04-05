import { useEffect, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

export function CartIcon({ onClick }: { onClick: () => void }) {
  const { count } = useCart();
  const prevCountRef = useRef(count);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (count !== prevCountRef.current) {
      prevCountRef.current = count;
      if (count > 0) {
        setPulse(true);
        const timer = setTimeout(() => setPulse(false), 600);
        return () => clearTimeout(timer);
      }
    }
  }, [count]);

  return (
    <button
      onClick={onClick}
      aria-label={`Shopping cart${count > 0 ? `, ${count} items` : ""}`}
      className="relative text-white/70 hover:text-white transition-colors cursor-pointer p-1"
    >
      <ShoppingBag size={22} />

      {count > 0 && (
        <span
          className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-gradient-to-r from-[#E879F9] to-[#A855F7] text-white text-[10px] font-bold leading-none px-1 shadow-[0_0_8px_rgba(232,121,249,0.6)] ${
            pulse ? "animate-bounce" : ""
          }`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
