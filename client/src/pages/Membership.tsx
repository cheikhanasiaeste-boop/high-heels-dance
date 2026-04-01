import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, ArrowLeft, Loader2, MapPin, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { ScrollReveal } from "@/components/ScrollReveal";

export default function Membership() {
  const { data: membershipStatus, isLoading: statusLoading } = trpc.membership.getStatus.useQuery();
  const { data: pricing, isLoading: pricingLoading } = trpc.membership.getPricing.useQuery();
  const { data: inPersonPricing } = trpc.membership.getInPersonPricing.useQuery();

  const [isLoading, setIsLoading] = useState("");

  const createCheckout = trpc.membership.createSubscriptionCheckout.useMutation();
  const purchaseCredits = trpc.membership.purchaseInPersonCredits.useMutation();

  // Check for payment success in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success')) {
      window.history.replaceState({}, '', '/membership');
    } else if (params.get('credits_success')) {
      window.history.replaceState({}, '', '/membership');
    }
  }, []);

  const handleUpgrade = async (plan: "monthly" | "annual") => {
    try {
      setIsLoading(plan);
      const { url } = await createCheckout.mutateAsync({ plan });
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setIsLoading("");
    }
  };

  const handleBuyCredits = async (pack: "pack5" | "pack10") => {
    try {
      setIsLoading(pack);
      const { url } = await purchaseCredits.mutateAsync({ pack });
      if (url) window.location.href = url;
    } catch (error) {
      console.error('Credit purchase error:', error);
    } finally {
      setIsLoading("");
    }
  };

  if (statusLoading || pricingLoading) {
    return (
      <div className="min-h-screen bg-[#0d0010] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C026D3]" />
      </div>
    );
  }

  const isActiveMember = membershipStatus?.isActive;
  const inPersonCredits = membershipStatus?.inPersonCredits ?? 0;

  return (
    <div className="min-h-screen bg-[#0d0010]">
      {/* Header */}
      <div className="border-b border-white/[0.06]">
        <div className="container mx-auto px-4 py-8">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 text-white/50 hover:text-white mb-6 transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-[#E879F9]/50 mb-2" style={{ fontFamily: 'var(--font-body)' }}>Membership</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                Choose Your Plan
              </h1>
              <p className="text-white/40 mt-2">Unlock unlimited access to courses, classes, and exclusive content</p>
            </div>

            {/* Credits display */}
            {inPersonCredits > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <MapPin className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-white/70">In-Person Credits:</span>
                <span className="text-lg font-bold text-purple-400">{inPersonCredits}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        {/* Current plan banner */}
        {isActiveMember && (
          <ScrollReveal>
            <div className="mb-10 p-5 rounded-2xl bg-gradient-to-r from-fuchsia-500/10 to-purple-500/10 border border-fuchsia-500/20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/20">
                  <Crown className="h-5 w-5 text-[#E879F9]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Active {membershipStatus?.membershipStatus} membership</p>
                  <p className="text-xs text-white/40">
                    Valid until {membershipStatus?.membershipEndDate ? new Date(membershipStatus.membershipEndDate).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        )}

        {/* ── Online Membership Plans ── */}
        <ScrollReveal>
          <h2 className="text-xs uppercase tracking-[0.2em] text-[#E879F9]/50 font-semibold mb-6" style={{ fontFamily: 'var(--font-body)' }}>
            Online Membership
          </h2>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {/* Monthly Plan */}
          <ScrollReveal delay={0.05}>
            <div className="relative group rounded-2xl border border-white/[0.08] bg-[#141118] p-6 hover:border-white/[0.15] transition-all duration-300 h-full flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-[#E879F9]" />
                <h3 className="text-lg font-bold text-white">Monthly</h3>
              </div>
              <p className="text-sm text-white/40 mb-6">Full access to all online courses and classes</p>

              <div className="mb-6">
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>${pricing?.monthly.price}</span>
                <span className="text-white/40 text-sm">/month</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {['Unlimited online courses', 'All group classes', 'Premium video content', 'Cancel anytime'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-white/60">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <Button
                className="w-full glow-button bg-[#C026D3] hover:bg-[#A21CAF] text-white"
                onClick={() => handleUpgrade("monthly")}
                disabled={!!isLoading || !!isActiveMember}
              >
                {isLoading === "monthly" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe Monthly"}
              </Button>
            </div>
          </ScrollReveal>

          {/* Annual Plan */}
          <ScrollReveal delay={0.1}>
            <div className="relative group rounded-2xl border-2 border-[#C026D3]/30 bg-[#141118] p-6 hover:border-[#C026D3]/50 transition-all duration-300 h-full flex flex-col">
              <Badge className="absolute -top-3 left-6 bg-[#C026D3] text-white border-0">Best Value</Badge>

              <div className="flex items-center gap-2 mb-4">
                <Crown className="h-5 w-5 text-[#E879F9]" />
                <h3 className="text-lg font-bold text-white">Annual</h3>
              </div>
              <p className="text-sm text-white/40 mb-6">Save more with yearly commitment</p>

              <div className="mb-2">
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>${pricing?.annual.price}</span>
                <span className="text-white/40 text-sm">/month</span>
              </div>
              <p className="text-sm text-emerald-400 font-medium mb-6">Save ${pricing?.annual.savingsPerYear}/year</p>

              <ul className="space-y-3 mb-8 flex-1">
                {['Unlimited online courses', 'All group classes', 'Premium video content', 'Priority support', 'Cancel anytime'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-white/60">
                    <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <Button
                className="w-full glow-button bg-gradient-to-r from-[#C026D3] to-purple-600 hover:opacity-90 text-white"
                onClick={() => handleUpgrade("annual")}
                disabled={!!isLoading || !!isActiveMember}
              >
                {isLoading === "annual" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe Annually"}
              </Button>
            </div>
          </ScrollReveal>
        </div>

        {/* ── In-Person Credit Packs ── */}
        <ScrollReveal>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs uppercase tracking-[0.2em] text-[#E879F9]/50 font-semibold" style={{ fontFamily: 'var(--font-body)' }}>
              In-Person Sessions
            </h2>
            {inPersonCredits > 0 && (
              <span className="text-sm text-purple-400 font-medium">
                {inPersonCredits} credit{inPersonCredits !== 1 ? 's' : ''} remaining
              </span>
            )}
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {/* 5-pack */}
          <ScrollReveal delay={0.05}>
            <div className="rounded-2xl border border-white/[0.08] bg-[#141118] p-6 hover:border-white/[0.15] transition-all duration-300 h-full flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-5 w-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">5 Sessions</h3>
              </div>
              <p className="text-sm text-white/40 mb-6">Perfect for trying in-person classes</p>

              <div className="mb-2">
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>${inPersonPricing?.pack5.price}</span>
              </div>
              <p className="text-sm text-white/30 mb-6">${inPersonPricing?.pack5.pricePerSession} per session</p>

              <ul className="space-y-3 mb-8 flex-1">
                {['5 in-person session credits', 'Use at your own pace', 'All class types included', 'Never expires'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-white/60">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <Button
                variant="outline"
                className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/50"
                onClick={() => handleBuyCredits("pack5")}
                disabled={!!isLoading}
              >
                {isLoading === "pack5" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy 5 Credits"}
              </Button>
            </div>
          </ScrollReveal>

          {/* 10-pack */}
          <ScrollReveal delay={0.1}>
            <div className="relative rounded-2xl border-2 border-purple-500/25 bg-[#141118] p-6 hover:border-purple-500/40 transition-all duration-300 h-full flex flex-col">
              <Badge className="absolute -top-3 left-6 bg-purple-600 text-white border-0">Save $50</Badge>

              <div className="flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-purple-400" />
                <h3 className="text-lg font-bold text-white">10 Sessions</h3>
              </div>
              <p className="text-sm text-white/40 mb-6">Best value for regular attendees</p>

              <div className="mb-2">
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>${inPersonPricing?.pack10.price}</span>
              </div>
              <p className="text-sm text-emerald-400 font-medium mb-6">${inPersonPricing?.pack10.pricePerSession} per session</p>

              <ul className="space-y-3 mb-8 flex-1">
                {['10 in-person session credits', 'Use at your own pace', 'All class types included', 'Never expires', 'Best per-session price'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-white/60">
                    <Check className="h-4 w-4 text-purple-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <Button
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => handleBuyCredits("pack10")}
                disabled={!!isLoading}
              >
                {isLoading === "pack10" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buy 10 Credits"}
              </Button>
            </div>
          </ScrollReveal>
        </div>

        {/* Free account note */}
        {!isActiveMember && (
          <div className="text-center text-white/30 text-sm">
            You can also purchase courses individually without a membership.
          </div>
        )}
      </div>
    </div>
  );
}
