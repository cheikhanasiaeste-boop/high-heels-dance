import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ShoppingCart, Calendar, GraduationCap, Clock } from "lucide-react";

export default function AdminUserActivity() {
  const { user, isAuthenticated } = useAuth();
  
  const { data: purchases = [] } = trpc.admin.purchases.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  const { data: bookings = [] } = trpc.admin.bookings.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  // Combine and sort all activities by date
  const activities = [
    ...purchases.map(p => ({
      type: 'purchase' as const,
      id: `purchase-${p.id}`,
      userId: p.userId,
      userName: p.userName || 'Unknown User',
      userEmail: p.userEmail || '',
      title: p.courseName || 'Course',
      amount: p.amount,
      date: p.createdAt,
    })),
    ...bookings.map(b => ({
      type: 'booking' as const,
      id: `booking-${b.id}`,
      userId: b.userId,
      userName: b.userName || 'Unknown User',
      userEmail: b.userEmail || '',
      title: `${b.sessionType} - ${b.slotStartTime ? new Date(b.slotStartTime).toLocaleDateString() : 'TBD'}`,
      status: b.status,
      date: b.createdAt,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Access denied. Admin privileges required.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User Activity Timeline</h1>
          <p className="text-muted-foreground mt-2">Recent user purchases, bookings, and course completions</p>
        </div>

        {/* Activity Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Purchases</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{purchases.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{bookings.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Activities</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activities.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Timeline */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Chronological timeline of all user actions</CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No activity yet</p>
            ) : (
              <div className="space-y-4">
                {activities.map((activity) => (
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
                            Purchase
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
                      {activity.type === 'purchase' && 'amount' in activity && (
                        <p className="text-sm font-medium text-green-600 mt-1">
                          ${Number(activity.amount).toFixed(2)}
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
