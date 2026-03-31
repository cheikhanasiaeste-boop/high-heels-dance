import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Calendar, Clock, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export function SubscriptionSuccess() {
  const { data: user } = trpc.auth.me.useQuery();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Show details after a short delay for better UX
    const timer = setTimeout(() => setShowDetails(true), 500);
    return () => clearTimeout(timer);
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0d0010] via-[#110a18] to-[#0d0010]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Loading...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const membershipType = user.membershipStatus || 'free';
  const startDate = user.membershipStartDate ? new Date(user.membershipStartDate) : null;
  const endDate = user.membershipEndDate ? new Date(user.membershipEndDate) : null;

  const getMembershipDetails = () => {
    if (membershipType === 'monthly') {
      return {
        title: 'Monthly Membership',
        price: '$29.99/month',
        description: 'Full access to all courses and classes',
        color: 'bg-blue-500/10 border-blue-500/30',
        badgeColor: 'bg-blue-500/20 text-blue-300',
      };
    } else if (membershipType === 'annual') {
      return {
        title: 'Annual Membership',
        price: '$24.99/month (billed monthly)',
        description: 'Full access to all courses and classes with 12-month commitment',
        color: 'bg-purple-500/10 border-purple-500/30',
        badgeColor: 'bg-purple-500/20 text-purple-300',
      };
    }
    return {
      title: 'Free Account',
      price: 'Free',
      description: 'Access to selected free courses',
      color: 'bg-[#0d0010] border-white/10',
      badgeColor: 'bg-white/10 text-white/70',
    };
  };

  const details = getMembershipDetails();
  const daysRemaining = endDate
    ? Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d0010] via-[#110a18] to-[#0d0010] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success Header */}
        <div className={`text-center mb-8 transition-all duration-500 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-green-200 rounded-full animate-pulse"></div>
              <CheckCircle2 className="w-16 h-16 text-green-600 relative" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Welcome to Your Membership!</h1>
          <p className="text-lg text-white/70">Your subscription has been activated successfully</p>
        </div>

        {/* Membership Details Card */}
        <Card className={`mb-8 border-2 transition-all duration-700 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} ${details.color}`}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">{details.title}</CardTitle>
                <CardDescription className="text-base mt-2">{details.description}</CardDescription>
              </div>
              <Badge className={`text-lg px-4 py-2 ${details.badgeColor}`}>
                {details.price}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Start Date */}
              {startDate && (
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white/70">Membership Started</p>
                    <p className="text-lg font-semibold text-white">
                      {startDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* End Date */}
              {endDate && (
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white/70">Membership Expires</p>
                    <p className="text-lg font-semibold text-white">
                      {endDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                    {daysRemaining && daysRemaining > 0 && (
                      <p className="text-sm text-white/70 mt-1">
                        {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* What's Included */}
        <Card className={`mb-8 transition-all duration-700 delay-100 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <CardHeader>
            <CardTitle>What's Included in Your Membership</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-white/70">Unlimited access to all courses and classes</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-white/70">Book private and group sessions</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-white/70">Access to premium content and tutorials</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <span className="text-white/70">Priority support from Elizabeth</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className={`flex flex-col sm:flex-row gap-4 justify-center transition-all duration-700 delay-200 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <Link href="/my-courses" asChild>
            <Button
              size="lg"
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white"
            >
              Explore Your Courses
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Link href="/my-sessions" asChild>
            <Button
              size="lg"
              variant="outline"
            >
              Book a Session
            </Button>
          </Link>
        </div>

        {/* Help Text */}
        <div className={`text-center mt-12 transition-all duration-700 delay-300 ${showDetails ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-white/70 mb-2">Have questions about your membership?</p>
          <Button variant="link" className="text-primary hover:text-primary/80">
            Contact Support
          </Button>
        </div>
      </div>
    </div>
  );
}
