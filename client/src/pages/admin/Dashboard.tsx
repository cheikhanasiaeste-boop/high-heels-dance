import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { 
  DollarSign, 
  Users, 
  BookOpen, 
  Calendar,
  TrendingUp,
  TrendingDown,
  Eye,
  MousePointer,
  Clock,
  Activity
} from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { AnalyticsChart } from "@/components/AnalyticsChart";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'24h' | '7d' | '30d'>('7d');
  
  const { data: stats, isLoading: statsLoading } = trpc.admin.dashboard.stats.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin', retry: 1 }
  );

  const { data: revenue, isLoading: revenueLoading } = trpc.admin.dashboard.revenue.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin', retry: 1 }
  );
  
  // Calculate date range based on selected period
  const getDateRange = (period: '24h' | '7d' | '30d') => {
    const end = new Date();
    const start = new Date();
    
    switch (period) {
      case '24h':
        start.setHours(start.getHours() - 24);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
    }
    
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  };
  
  const dateRange = getDateRange(analyticsPeriod);
  const { data: analytics, isLoading: analyticsLoading } = trpc.admin.dashboard.analytics.useQuery(
    dateRange,
    { enabled: isAuthenticated && user?.role === 'admin', retry: 1 }
  );

  if (statsLoading || revenueLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    );
  }

  // Safe defaults for all properties the template uses
  const defaultStats = { totalUsers: 0, totalCourses: 0, totalRevenue: 0, courseRevenue: 0, sessionRevenue: 0, totalBookings: 0, freeBookings: 0, paidBookings: 0, paidCourses: 0, freeCourses: 0, newUsersToday: 0, newUsersThisWeek: 0, topCourses: [] as any[] };
  const safeStats = { ...defaultStats, ...(stats || {}) };
  const safeRevenue = { today: 0, yesterday: 0, week: 0, lastWeek: 0, month: 0, lastMonth: 0, ...(revenue || {}) };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Overview of your dance course platform performance
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(safeStats.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Lifetime earnings
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{safeStats.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Registered students
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{safeStats.totalCourses}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {safeStats.paidCourses} premium, {safeStats.freeCourses} free
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{safeStats.totalBookings}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {safeStats.confirmedBookings} confirmed
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Analytics Chart with Period Filtering */}
        <AnalyticsChart />

        {/* Revenue Breakdown */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue by Source</CardTitle>
              <CardDescription>Breakdown of income streams</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Course Sales</p>
                    <p className="text-sm text-muted-foreground">{safeStats.coursePurchases} purchases</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(safeStats.courseRevenue)}</p>
                    <p className="text-sm text-muted-foreground">
                      {((safeStats.courseRevenue / safeStats.totalRevenue) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Session Bookings</p>
                    <p className="text-sm text-muted-foreground">{safeStats.paidBookings} paid sessions</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(safeStats.sessionRevenue)}</p>
                    <p className="text-sm text-muted-foreground">
                      {((safeStats.sessionRevenue / safeStats.totalRevenue) * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Popular Courses</CardTitle>
              <CardDescription>Top selling courses</CardDescription>
            </CardHeader>
            <CardContent>
              {safeStats.popularCourses && safeStats.popularCourses.length > 0 ? (
                <div className="space-y-4">
                  {safeStats.popularCourses.slice(0, 3).map((course: any, index: number) => (
                    <div key={course.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{course.title}</p>
                          <p className="text-sm text-muted-foreground">{course.purchaseCount} sales</p>
                        </div>
                      </div>
                      <p className="font-bold">{formatCurrency(course.revenue)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No course sales yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Conversion Metrics */}
        <Card>
          <CardHeader>
            <CardTitle>Conversion Metrics</CardTitle>
            <CardDescription>Platform performance indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Course Conversion Rate</p>
                <p className="text-2xl font-bold mt-1">
                  {safeStats.totalUsers > 0 
                    ? ((safeStats.coursePurchases / safeStats.totalUsers) * 100).toFixed(1)
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Users who purchased courses
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Booking Rate</p>
                <p className="text-2xl font-bold mt-1">
                  {safeStats.totalUsers > 0 
                    ? ((safeStats.totalBookings / safeStats.totalUsers) * 100).toFixed(1)
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Users who booked sessions
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Revenue Per User</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(safeStats.totalUsers > 0 ? safeStats.totalRevenue / safeStats.totalUsers : 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Lifetime value
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Website Analytics */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Website Analytics</CardTitle>
                <CardDescription>Visitor behavior and engagement metrics</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={analyticsPeriod === '24h' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAnalyticsPeriod('24h')}
                >
                  Last 24 hours
                </Button>
                <Button
                  variant={analyticsPeriod === '7d' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAnalyticsPeriod('7d')}
                >
                  Last week
                </Button>
                <Button
                  variant={analyticsPeriod === '30d' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAnalyticsPeriod('30d')}
                >
                  Last month
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {analytics ? (
              <div className="grid gap-4 md:grid-cols-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Eye className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Page Views</p>
                    <p className="text-2xl font-bold">{analytics.pageViews.toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <MousePointer className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Visits</p>
                    <p className="text-2xl font-bold">{analytics.visits.toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Users className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Visitors</p>
                    <p className="text-2xl font-bold">{analytics.visitors.toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Avg Duration</p>
                    <p className="text-2xl font-bold">{Math.floor(analytics.avgDuration / 60)}m {analytics.avgDuration % 60}s</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Activity className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Bounce Rate</p>
                    <p className="text-2xl font-bold">{analytics.bounceRate}%</p>
                  </div>
                </div>
              </div>
            ) : analyticsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <p className="text-sm">No analytics data yet. Data will appear as visitors browse the site.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
