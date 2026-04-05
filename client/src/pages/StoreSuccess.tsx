import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number | string) {
  return `€${Number(price).toFixed(2)}`;
}

// ─── Animated Checkmark ───────────────────────────────────────────────────────

function AnimatedCheckmark() {
  return (
    <div className="flex justify-center mb-8">
      <svg
        width="80"
        height="80"
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>{`
          @keyframes drawCircle {
            from { stroke-dashoffset: 220; }
            to   { stroke-dashoffset: 0; }
          }
          @keyframes drawCheck {
            from { stroke-dashoffset: 60; opacity: 0; }
            to   { stroke-dashoffset: 0; opacity: 1; }
          }
          .circle-path {
            stroke-dasharray: 220;
            stroke-dashoffset: 220;
            animation: drawCircle 0.9s ease-out 0.1s forwards;
          }
          .check-path {
            stroke-dasharray: 60;
            stroke-dashoffset: 60;
            opacity: 0;
            animation: drawCheck 0.5s ease-out 0.9s forwards;
          }
        `}</style>
        {/* Glow background circle */}
        <circle cx="40" cy="40" r="38" fill="rgba(232,121,249,0.08)" />
        {/* Animated outer circle */}
        <circle
          className="circle-path"
          cx="40"
          cy="40"
          r="35"
          stroke="url(#checkGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        {/* Animated checkmark */}
        <path
          className="check-path"
          d="M24 40 L35 52 L56 28"
          stroke="url(#checkGradient)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <defs>
          <linearGradient id="checkGradient" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E879F9" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// ─── Status Timeline ──────────────────────────────────────────────────────────

const STATUS_STEPS = [
  { key: "paid",      label: "Paid" },
  { key: "shipped",   label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

function StatusTimeline({ status }: { status: string }) {
  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status);
  const activeIdx = currentIdx >= 0 ? currentIdx : 0;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-0">
        {STATUS_STEPS.map((step, i) => {
          const isActive  = i <= activeIdx;
          const isCurrent = i === activeIdx;
          const isLast    = i === STATUS_STEPS.length - 1;

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                    isActive
                      ? "border-[#E879F9] bg-[#E879F9]/20"
                      : "border-white/20 bg-white/5"
                  } ${isCurrent ? "shadow-[0_0_16px_rgba(232,121,249,0.5)]" : ""}`}
                >
                  {isActive ? (
                    <div
                      className={`w-3 h-3 rounded-full ${
                        isCurrent
                          ? "bg-gradient-to-br from-[#E879F9] to-[#A855F7]"
                          : "bg-[#E879F9]/60"
                      }`}
                    />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-white/20" />
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium whitespace-nowrap ${
                    isActive ? "text-[#E879F9]" : "text-white/30"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {!isLast && (
                <div
                  className={`flex-1 h-0.5 mx-1 mb-5 ${
                    i < activeIdx
                      ? "bg-gradient-to-r from-[#E879F9]/60 to-[#A855F7]/60"
                      : "bg-white/10"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-white/40 text-xs mt-4">
        We'll email you when your order ships.
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StoreSuccess() {
  const sessionId = new URLSearchParams(window.location.search).get("session_id");

  const { data: order, isLoading, error } = trpc.store.orderBySession.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId }
  );

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#18021e] via-[#1a0525] to-[#0c0118] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#E879F9] animate-spin" />
      </div>
    );
  }

  // ── Error / No session ───────────────────────────────────────────────────
  if (!sessionId || error || !order) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#18021e] via-[#1a0525] to-[#0c0118] flex items-center justify-center px-4">
        {/* Ambient glow */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#E879F9]/5 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 text-center max-w-md">
          <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl border border-[#E879F9]/10 p-8">
            <p className="text-white/60 text-lg mb-2">Order not found</p>
            <p className="text-white/40 text-sm mb-8">
              We couldn't find your order. If you were charged, please contact us.
            </p>
            <Link href="/store">
              <button className="bg-gradient-to-r from-[#E879F9] to-[#A855F7] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity">
                Go to Store
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  const hasDiscount = !!order.discountCode && Number(order.discountAmount) > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#18021e] via-[#1a0525] to-[#0c0118] py-16 px-4">
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#E879F9]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#A855F7]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto">
        {/* Animated checkmark */}
        <AnimatedCheckmark />

        {/* Main card */}
        <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl border border-[#E879F9]/10 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white/90 mb-2">
              Thank you for your order!
            </h1>
            <p className="text-white/50 text-sm">
              Order{" "}
              <span className="text-[#E879F9] font-mono font-medium">
                #{order.id}
              </span>
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10 mb-6" />

          {/* Items */}
          <div className="mb-6">
            <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-4">
              Items
            </h2>
            <div className="space-y-3">
              {order.items.map((item: {
                productTitle: string;
                variantKey: string;
                quantity: number;
                unitPrice: number | string;
              }, idx: number) => {
                const lineTotal = Number(item.unitPrice) * item.quantity;
                return (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-4 py-2 border-b border-white/5 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white/90 font-medium truncate">
                        {item.productTitle}
                      </p>
                      <p className="text-white/40 text-sm mt-0.5">
                        {item.variantKey}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-white/60 text-sm">
                        {item.quantity} × {formatPrice(item.unitPrice)}
                      </p>
                      <p className="text-white/90 font-semibold">
                        {formatPrice(lineTotal)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white/[0.03] rounded-xl p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Subtotal</span>
              <span className="text-white/70">{formatPrice(order.subtotal)}</span>
            </div>
            {hasDiscount && (
              <div className="flex justify-between text-sm">
                <span className="text-[#E879F9]/80">
                  Discount{" "}
                  <span className="font-mono text-xs bg-[#E879F9]/10 px-1.5 py-0.5 rounded">
                    {order.discountCode}
                  </span>
                </span>
                <span className="text-[#E879F9]">
                  -{formatPrice(order.discountAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Shipping</span>
              <span className="text-white/70">
                {Number(order.shippingCost) === 0
                  ? "Free"
                  : formatPrice(order.shippingCost)}
              </span>
            </div>
            <div className="border-t border-white/10 pt-2 mt-2 flex justify-between">
              <span className="text-white/90 font-bold text-base">Total</span>
              <span className="text-white font-bold text-lg">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>

          {/* Shipping address */}
          <div className="mb-6">
            <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-3">
              Shipping Address
            </h2>
            <div className="bg-white/[0.03] rounded-xl p-4 text-sm text-white/60 space-y-0.5">
              <p className="text-white/80 font-medium">{order.shippingName}</p>
              <p>{order.shippingAddress}</p>
              <p>
                {order.shippingCity}
                {order.shippingPostalCode ? `, ${order.shippingPostalCode}` : ""}
              </p>
              <p>{order.shippingCountry}</p>
            </div>
          </div>

          {/* Status timeline */}
          <div className="mb-8">
            <h2 className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-3">
              Order Status
            </h2>
            <StatusTimeline status={order.status} />
          </div>

          {/* Divider */}
          <div className="border-t border-white/10 mb-6" />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/store" className="flex-1">
              <button className="w-full bg-gradient-to-r from-[#E879F9] to-[#A855F7] text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity">
                Continue Shopping
              </button>
            </Link>
            <Link href="/" className="flex-1">
              <button className="w-full border border-[#E879F9]/30 text-white/70 font-semibold px-6 py-3 rounded-xl hover:bg-white/[0.04] hover:border-[#E879F9]/50 hover:text-white/90 transition-all">
                Back to Home
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
