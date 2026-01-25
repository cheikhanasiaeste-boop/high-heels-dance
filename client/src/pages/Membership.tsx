import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Sparkles, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";


export default function Membership() {
  const [, navigate] = useLocation();
  const { data: membershipStatus, isLoading: statusLoading } = trpc.membership.getStatus.useQuery();
  const { data: pricing, isLoading: pricingLoading } = trpc.membership.getPricing.useQuery();

  const [isLoading, setIsLoading] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<any>(null);
  
  const createCheckout = trpc.membership.createSubscriptionCheckout.useMutation();

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) {
      setDiscountError("Please enter a discount code");
      return;
    }
    setAppliedDiscount({ code: discountCode });
    setDiscountError("");
  };

  const handleUpgrade = async (plan: "monthly" | "annual") => {
    try {
      setIsLoading(true);
      const { url } = await createCheckout.mutateAsync({ 
        plan,
        discountCode: appliedDiscount?.code,
      });
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
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-pink-900 py-12">
      <div className="container mx-auto px-4">
        {/* Back Button */}
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-white mb-8 hover:opacity-80 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Membership</h1>
          <p className="text-purple-100">Manage your subscription and access all courses and classes</p>
        </div>

        {/* Current Plan */}
        {isActiveMember && (
          <Card className="mb-8 bg-gradient-to-r from-purple-600 to-pink-600 border-0">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Crown className="h-5 w-5" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-purple-100">
                You have an active {currentPlan} membership until {membershipStatus?.membershipEndDate ? new Date(membershipStatus.membershipEndDate).toLocaleDateString() : 'N/A'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Discount Code Section */}
        <Card className="mb-8 bg-white">
          <CardHeader>
            <CardTitle>Have a Discount Code?</CardTitle>
            <CardDescription>Apply a discount code to get savings on your membership</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter discount code"
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value.toUpperCase());
                  setDiscountError("");
                }}
                disabled={!!appliedDiscount}
              />
              {!appliedDiscount ? (
                <Button onClick={handleApplyDiscount}>Apply</Button>
              ) : (
                <Button 
                  variant="outline"
                  onClick={() => {
                    setAppliedDiscount(null);
                    setDiscountCode("");
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
            {discountError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{discountError}</AlertDescription>
              </Alert>
            )}
            {appliedDiscount && (
              <Alert className="bg-green-50 border-green-200">
                <Check className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Discount code "{appliedDiscount.code}" applied!
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Monthly Plan */}
          <Card className="flex flex-col bg-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  Monthly Membership
                </CardTitle>
              </div>
              <CardDescription>Full access to all courses and classes for 1 month</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="mb-6">
                <p className="text-3xl font-bold text-purple-600">${pricing?.monthly.price}</p>
                <p className="text-sm text-muted-foreground">/month</p>
              </div>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  Unlimited access to all courses
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  Join all group and private classes
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  Access to premium content
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  Cancel anytime
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700"
                onClick={() => handleUpgrade("monthly")}
                disabled={isLoading || isActiveMember}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Subscribe Monthly"
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Annual Plan */}
          <Card className="flex flex-col bg-white border-2 border-purple-600 relative">
            <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-purple-600">
              Best Value
            </Badge>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5 text-purple-600" />
                  Annual Membership
                </CardTitle>
              </div>
              <CardDescription>Full access to all courses and classes for 12 months</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="mb-6">
                <p className="text-3xl font-bold text-purple-600">${pricing?.annual.price}</p>
                <p className="text-sm text-muted-foreground">/month billed monthly</p>
                <p className="text-sm text-green-600 font-semibold mt-2">Save ${pricing?.annual.savingsPerYear} per year</p>
              </div>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  Unlimited access to all courses
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  Join all group and private classes
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  Access to premium content
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  Priority support
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-600" />
                  Cancel anytime
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90"
                onClick={() => handleUpgrade("annual")}
                disabled={isLoading || isActiveMember}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Subscribe Annually"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Free Account Info */}
        {!isActiveMember && (
          <Card>
            <CardHeader>
              <CardTitle>Free Account</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Purchase courses individually or upgrade to a membership for full access to all courses and classes
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
