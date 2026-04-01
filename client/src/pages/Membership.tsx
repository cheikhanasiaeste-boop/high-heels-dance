import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, ArrowLeft, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ScrollReveal } from "@/components/ScrollReveal";

export default function Membership() {
  const { data: membershipStatus, isLoading: statusLoading } = trpc.membership.getStatus.useQuery();
  const { data: pricing, isLoading: pricingLoading } = trpc.membership.getPricing.useQuery();

  const [isLoading, setIsLoading] = useState("");

  const createCheckout = trpc.membership.createSubscriptionCheckout.useMutation();

  // Check for payment success in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success')) {
      toast.success("Membership activated! Welcome aboard.");
      window.history.replaceState({}, '', '/membership');
    } else if (params.get('canceled')) {
      toast.info("Checkout cancelled.");
      window.history.replaceState({}, '', '/membership');
    }
  }, []);

  const handleUpgrade = async (plan: "monthly" | "annual") => {
    try {
      setIsLoading(plan);
      const { url } = await createCheckout.mutateAsync({ plan });
      if (url) window.location.href = url;
    } catch (error: any) {
      toast.error(error.message || "Failed to create checkout session");
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

          <p className="text-[11px] uppercase tracking-[0.25em] text-[#E879F9]/50 mb-2" style={{ fontFamily: 'var(--font-body)' }}>Membership</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Choose Your Plan
          </h1>
          <p className="text-white/40 mt-2 max-w-lg">
            Get unlimited access to all online courses, sessions, and exclusive content. Discount codes for in-person sessions can be applied at booking.
          </p>
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

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-16">
          {/* Monthly Plan */}
          <ScrollReveal delay={0.05}>
            <div className="relative group rounded-2xl border border-white/[0.08] bg-[#141118] p-6 hover:border-white/[0.15] transition-all duration-300 h-full flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-[#E879F9]" />
                <h3 className="text-lg font-bold text-white">Monthly</h3>
              </div>
              <p className="text-sm text-white/40 mb-6">Full access to all online courses and sessions</p>

              <div className="mb-6">
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>€{pricing?.monthly.price}</span>
                <span className="text-white/40 text-sm">/month</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {['Unlimited online courses', 'All online group sessions', 'Premium video content', 'Cancel anytime'].map((item) => (
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
                <span className="text-4xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>€{pricing?.annual.price}</span>
                <span className="text-white/40 text-sm">/month</span>
              </div>
              <p className="text-sm text-emerald-400 font-medium mb-6">Save €{pricing?.annual.savingsPerYear}/year</p>

              <ul className="space-y-3 mb-8 flex-1">
                {['Unlimited online courses', 'All online group sessions', 'Premium video content', 'Priority support', 'Cancel anytime'].map((item) => (
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

        {/* Info note */}
        <div className="text-center space-y-2 max-w-lg mx-auto">
          <p className="text-white/30 text-sm">
            You can also purchase individual courses and sessions without a membership.
          </p>
          <p className="text-white/30 text-sm">
            Have an in-person discount code? Apply it when booking the session.
          </p>
        </div>
      </div>
    </div>
  );
}
