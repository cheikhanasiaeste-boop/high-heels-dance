import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, ArrowLeft, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";


export default function Membership() {
  const [, navigate] = useLocation();
  const { data: membershipStatus, isLoading: statusLoading } = trpc.membership.getStatus.useQuery();
  const { data: pricing, isLoading: pricingLoading } = trpc.membership.getPricing.useQuery();

  const [isLoading, setIsLoading] = useState(false);
  const createCheckout = trpc.membership.createSubscriptionCheckout.useMutation();

  const handleUpgrade = async (plan: "monthly" | "annual") => {
    try {
      setIsLoading(true);
      const { url } = await createCheckout.mutateAsync({ plan });
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to create checkout session. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (statusLoading || pricingLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="h-96 bg-muted rounded"></div>
            <div className="h-96 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const isActiveMember = membershipStatus?.isActive;
  const currentPlan = membershipStatus?.membershipStatus;

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Back Button */}
      <Button 
        variant="ghost" 
        className="mb-4"
        onClick={() => window.history.back()}
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {/* Current Status */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Membership</h1>
        <p className="text-muted-foreground">
          Manage your subscription and access to all courses and classes
        </p>
      </div>

      {/* Current Membership Card */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Current Plan</CardTitle>
            {isActiveMember ? (
              <Badge variant="default" className="bg-green-600">
                <Crown className="size-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary">Free</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isActiveMember ? (
            <div className="space-y-2">
              <p className="text-lg font-semibold capitalize">{currentPlan} Membership</p>
              <p className="text-sm text-muted-foreground">
                Full access to all courses and classes
              </p>
              {membershipStatus?.membershipEndDate && (
                <p className="text-sm text-muted-foreground">
                  Valid until: {new Date(membershipStatus.membershipEndDate).toLocaleDateString()}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-semibold">Free Account</p>
              <p className="text-sm text-muted-foreground">
                Purchase courses individually or upgrade to a membership for full access
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pricing Plans */}
      {!isActiveMember && (
        <div>
          <h2 className="text-2xl font-bold mb-6">Upgrade Your Membership</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Monthly Plan */}
            <Card className="relative flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-5 text-purple-600" />
                  Monthly Membership
                </CardTitle>
                <CardDescription>{pricing?.monthly.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="mb-6">
                  <span className="text-4xl font-bold">${pricing?.monthly.price}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Unlimited access to all courses</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Join all group and private classes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Access to premium content</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Cancel anytime</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => handleUpgrade("monthly")}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Subscribe Monthly
                </Button>
              </CardFooter>
            </Card>

            {/* Annual Plan */}
            <Card className="relative border-purple-600 border-2 flex flex-col">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-purple-600">Best Value</Badge>
              </div>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="size-5 text-purple-600" />
                  Annual Membership
                </CardTitle>
                <CardDescription>{pricing?.annual.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="mb-6">
                  <span className="text-4xl font-bold">${pricing?.annual.price}</span>
                  <span className="text-muted-foreground">/month</span>
                  <p className="text-xs text-muted-foreground mt-1">Billed monthly for 12 months</p>
                  <p className="text-sm text-green-600 font-semibold mt-2">
                    Save ${(pricing?.annual.savingsPerYear || 0).toFixed(2)} per year
                  </p>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Unlimited access to all courses</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Join all group and private classes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Access to premium content</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Priority support</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="size-5 text-green-600 shrink-0 mt-0.5" />
                    <span>Cancel anytime</span>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  size="lg"
                  onClick={() => handleUpgrade("annual")}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Subscribe Annually
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
