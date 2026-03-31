import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { DollarSign, Users, BookOpen, Calendar, TrendingUp } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();

  const { data: stats, isLoading } = trpc.admin.dashboard.stats.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin', retry: 1 }
  );

  const s = {
    totalUsers: 0, totalCourses: 0, totalRevenue: 0, courseRevenue: 0,
    sessionRevenue: 0, totalBookings: 0, freeBookings: 0, paidBookings: 0,
    paidCourses: 0, freeCourses: 0, coursePurchases: 0, confirmedBookings: 0,
    newUsersToday: 0, newUsersThisWeek: 0, popularCourses: [] as any[],
    ...(stats || {}),
  };

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(n || 0);
  const pct = (a: number, b: number) => b > 0 ? ((a / b) * 100).toFixed(1) : "0";

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Platform overview</p>
        </div>

        {/* Key Metrics */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{fmt(s.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">Lifetime earnings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">
                +{s.newUsersThisWeek} this week
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Courses</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.totalCourses}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {s.paidCourses} premium, {s.freeCourses} free
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.totalBookings}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {s.paidBookings} paid, {s.freeBookings} free
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue + Conversion */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm">Course Sales</span>
                <div className="text-right">
                  <span className="font-bold">{fmt(s.courseRevenue)}</span>
                  <span className="text-xs text-muted-foreground ml-2">({pct(s.courseRevenue, s.totalRevenue)}%)</span>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary rounded-full h-2" style={{ width: `${pct(s.courseRevenue, s.totalRevenue)}%` }} />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm">Session Bookings</span>
                <div className="text-right">
                  <span className="font-bold">{fmt(s.sessionRevenue)}</span>
                  <span className="text-xs text-muted-foreground ml-2">({pct(s.sessionRevenue, s.totalRevenue)}%)</span>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-fuchsia-500 rounded-full h-2" style={{ width: `${pct(s.sessionRevenue, s.totalRevenue)}%` }} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conversion Rates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Course Purchases</span>
                  <span className="font-bold">{pct(s.coursePurchases, s.totalUsers)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-green-500 rounded-full h-2" style={{ width: `${pct(s.coursePurchases, s.totalUsers)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.coursePurchases} of {s.totalUsers} users</p>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Session Bookings</span>
                  <span className="font-bold">{pct(s.totalBookings, s.totalUsers)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-blue-500 rounded-full h-2" style={{ width: `${pct(s.totalBookings, s.totalUsers)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.totalBookings} of {s.totalUsers} users</p>
              </div>

              <div className="pt-2 border-t">
                <div className="flex justify-between">
                  <span className="text-sm">Avg Revenue / User</span>
                  <span className="font-bold">{fmt(s.totalUsers > 0 ? s.totalRevenue / s.totalUsers : 0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Popular Courses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Popular Courses</CardTitle>
          </CardHeader>
          <CardContent>
            {s.popularCourses && s.popularCourses.length > 0 ? (
              <div className="space-y-3">
                {s.popularCourses.slice(0, 5).map((course: any, i: number) => (
                  <div key={course.id || i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {i + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{course.title}</p>
                        <p className="text-xs text-muted-foreground">{course.purchaseCount || 0} sales</p>
                      </div>
                    </div>
                    <span className="font-bold text-sm">{fmt(course.revenue || 0)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No course sales yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
