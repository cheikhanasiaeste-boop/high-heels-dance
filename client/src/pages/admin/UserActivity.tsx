import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ShoppingCart, Calendar, GraduationCap, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

type TimePeriod = 'today' | 'week' | 'month' | 'all';

export default function AdminUserActivity() {
  const { user, isAuthenticated } = useAuth();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['bookings-paid', 'bookings-free', 'courses-paid', 'courses-free']));
  
  const { data: purchases = [] } = trpc.admin.purchases.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  const { data: bookings = [] } = trpc.admin.bookings.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  // Filter activities by time period
  const filteredActivities = useMemo(() => {
    const now = new Date();
    let dateRange: { start: Date; end: Date } | null = null;

    switch (timePeriod) {
      case 'today':
        dateRange = { start: startOfDay(now), end: endOfDay(now) };
        break;
      case 'week':
        dateRange = { start: startOfWeek(now), end: endOfWeek(now) };
        break;
      case 'month':
        dateRange = { start: startOfMonth(now), end: endOfMonth(now) };
        break;
      case 'all':
        dateRange = null;
        break;
    }

    const filterByDate = (date: string) => {
      if (!dateRange) return true;
      const activityDate = new Date(date);
      return isWithinInterval(activityDate, dateRange);
    };

    const filteredPurchases = purchases.filter(p => filterByDate(p.createdAt.toString()));
    const filteredBookings = bookings.filter(b => filterByDate(b.createdAt.toString()));

    return { purchases: filteredPurchases, bookings: filteredBookings };
  }, [purchases, bookings, timePeriod]);

  // Group activities hierarchically: Type → Payment Status → Date sorted
  const groupedActivities = useMemo(() => {
    const groups = {
      bookings: {
        paid: [] as any[],
        free: [] as any[],
      },
      courses: {
        paid: [] as any[],
        free: [] as any[],
      },
    };

    // Process bookings
    filteredActivities.bookings.forEach(b => {
      const activity = {
        type: 'booking' as const,
        id: `booking-${b.id}`,
        userId: b.userId,
        userName: b.userName || 'Unknown User',
        userEmail: b.userEmail || '',
        title: `${b.sessionType} - ${b.slotStartTime ? new Date(b.slotStartTime).toLocaleDateString() : 'TBD'}`,
        status: b.status,
        date: b.createdAt,
        amount: 0, // Bookings don't have amount in current schema
        isPaid: false, // Determine from slot data if needed
      };

      if (activity.isPaid) {
        groups.bookings.paid.push(activity);
      } else {
        groups.bookings.free.push(activity);
      }
    });

    // Process purchases (courses)
    filteredActivities.purchases.forEach(p => {
      const activity = {
        type: 'purchase' as const,
        id: `purchase-${p.id}`,
        userId: p.userId,
        userName: p.userName || 'Unknown User',
        userEmail: p.userEmail || '',
        title: p.courseName || 'Course',
        amount: p.amount,
        date: p.createdAt,
        isPaid: true, // All course purchases are paid
      };

      groups.courses.paid.push(activity);
    });

    // Sort each group by date (newest first)
    const sortByDate = (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime();
    groups.bookings.paid.sort(sortByDate);
    groups.bookings.free.sort(sortByDate);
    groups.courses.paid.sort(sortByDate);
    groups.courses.free.sort(sortByDate);

    return groups;
  }, [filteredActivities]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const totalActivities = 
    groupedActivities.bookings.paid.length +
    groupedActivities.bookings.free.length +
    groupedActivities.courses.paid.length +
    groupedActivities.courses.free.length;

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
        </div>
      </AdminLayout>
    );
  }

  const renderActivityItem = (activity: any) => (
    <div
      key={activity.id}
      className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
    >
      <div className="mt-1">
        {activity.type === 'purchase' ? (
          <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
        ) : (
          <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
        )}
      </div>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{activity.userName}</p>
          {activity.type === 'purchase' && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Course
            </Badge>
          )}
          {activity.type === 'booking' && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Booking
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{activity.userEmail}</p>
        <p className="text-sm mt-1">{activity.title}</p>
        {activity.isPaid && (
          <p className="text-sm font-medium text-green-600 mt-1">
            €{Number(activity.amount).toFixed(2)}
          </p>
        )}
        {activity.type === 'booking' && 'status' in activity && (
          <Badge variant="secondary" className="mt-1">
            {activity.status}
          </Badge>
        )}
      </div>

      <div className="text-right">
        <p className="text-sm text-muted-foreground">
          {new Date(activity.date).toLocaleDateString()}
        </p>
        <p className="text-xs text-muted-foreground">
          {new Date(activity.date).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );

  const renderSection = (sectionId: string, title: string, activities: any[], icon: React.ReactNode) => {
    if (activities.length === 0) return null;
    
    const isExpanded = expandedSections.has(sectionId);

    return (
      <div key={sectionId} className="border rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection(sectionId)}
          className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            {icon}
            <span className="font-medium">{title}</span>
            <Badge variant="secondary">{activities.length}</Badge>
          </div>
        </button>
        {isExpanded && (
          <div className="p-4 space-y-3">
            {activities.map(renderActivityItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User Activity Timeline</h1>
          <p className="text-muted-foreground mt-2">Recent user purchases, bookings, and course completions</p>
        </div>

        {/* Time Period Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Time Period</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={timePeriod === 'today' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('today')}
              >
                Today
              </Button>
              <Button
                variant={timePeriod === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('week')}
              >
                This Week
              </Button>
              <Button
                variant={timePeriod === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('month')}
              >
                This Month
              </Button>
              <Button
                variant={timePeriod === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimePeriod('all')}
              >
                All Time
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Activity Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredActivities.purchases.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{filteredActivities.bookings.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Activities</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalActivities}</div>
            </CardContent>
          </Card>
        </div>

        {/* Grouped Activity Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Activity by Type & Payment Status</CardTitle>
            <CardDescription>Organized by activity type, payment status, and date</CardDescription>
          </CardHeader>
          <CardContent>
            {totalActivities === 0 ? (
              <p className="text-center text-muted-foreground py-8">No activity for this period</p>
            ) : (
              <div className="space-y-4">
                {/* Bookings Section */}
                {(groupedActivities.bookings.paid.length > 0 || groupedActivities.bookings.free.length > 0) && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-blue-600" />
                      Session Bookings
                    </h3>
                    {renderSection(
                      'bookings-paid',
                      'Paid Sessions',
                      groupedActivities.bookings.paid,
                      <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                        <ShoppingCart className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                    )}
                    {renderSection(
                      'bookings-free',
                      'Free Sessions',
                      groupedActivities.bookings.free,
                      <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-900/20 flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                      </div>
                    )}
                  </div>
                )}

                {/* Courses Section */}
                {groupedActivities.courses.paid.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-purple-600" />
                      Course Purchases
                    </h3>
                    {renderSection(
                      'courses-paid',
                      'Paid Courses',
                      groupedActivities.courses.paid,
                      <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                        <GraduationCap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
