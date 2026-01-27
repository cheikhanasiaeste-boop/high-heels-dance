import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useMemo } from "react";
import { ColumnFilterUI } from "@/components/ColumnFilterUI";
import { getColumnValues, filterRows, getActiveFilterCount, clearAllFilters, type ColumnFilter } from "@/lib/table-filters";

export default function AdminBookings() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [selectedBookings, setSelectedBookings] = useState<number[]>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFilter>({
    status: [],
    sessionType: [],
  });
  
  const { data: bookings, isLoading } = trpc.admin.bookings.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  // Get filter options and apply filters
  const filterOptions = useMemo(() => {
    if (!bookings) return { status: [], sessionType: [] };
    return {
      status: getColumnValues(bookings, 'status'),
      sessionType: getColumnValues(bookings, 'sessionType'),
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    return filterRows(bookings, columnFilters);
  }, [bookings, columnFilters]);

  const activeFilterCount = useMemo(() => getActiveFilterCount(columnFilters), [columnFilters]);

  const cancelMutation = trpc.admin.bookings.cancel.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled");
      utils.admin.bookings.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel booking");
    },
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Session Bookings</h1>
          <p className="text-muted-foreground mt-2">View and manage all session bookings</p>
        </div>

        {/* Bulk Actions */}
        {selectedBookings.length > 0 && (
          <Card className="bg-primary/5 border-primary">
            <CardContent className="flex items-center justify-between py-4">
              <p className="text-sm font-medium">{selectedBookings.length} booking(s) selected</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedBookings([])}>Clear Selection</Button>
                <Button variant="destructive" size="sm" onClick={() => {
                  if (confirm(`Cancel ${selectedBookings.length} selected booking(s)?`)) {
                    selectedBookings.forEach(id => cancelMutation.mutate({ id }));
                    setSelectedBookings([]);
                  }
                }}>Cancel Selected</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <ColumnFilterUI
          columns={[
            { name: 'status', label: 'Status', options: filterOptions.status },
            { name: 'sessionType', label: 'Type', options: filterOptions.sessionType },
          ]}
          filters={columnFilters}
          onFilterChange={setColumnFilters}
          activeFilterCount={activeFilterCount}
          onClearAll={() => setColumnFilters(clearAllFilters(columnFilters))}
        />

        {/* Select All Button */}
        {filteredBookings && filteredBookings.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (selectedBookings.length === filteredBookings.length) {
                setSelectedBookings([]);
              } else {
                setSelectedBookings(filteredBookings.map((b: any) => b.id));
              }
            }}
          >
            {selectedBookings.length === filteredBookings.length ? 'Deselect All' : 'Select All'}
          </Button>
        )}

        <div className="space-y-4">
          {filteredBookings && filteredBookings.length > 0 ? (
            filteredBookings.map((booking: any) => (
              <Card key={booking.id}>
                <CardHeader className="flex flex-row items-start gap-4">
                  <Checkbox
                    checked={selectedBookings.includes(booking.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedBookings([...selectedBookings, booking.id]);
                      } else {
                        setSelectedBookings(selectedBookings.filter(id => id !== booking.id));
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                  <CardTitle>{booking.sessionType}</CardTitle>
                  <CardDescription>
                    {new Date(booking.slot?.startTime).toLocaleString()} - 
                    {new Date(booking.slot?.endTime).toLocaleTimeString()}
                  </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm">User ID: {booking.userId}</p>
                    <p className="text-sm">Status: {booking.status}</p>
                    {booking.notes && <p className="text-sm">Notes: {booking.notes}</p>}
                    {booking.status === 'confirmed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => cancelMutation.mutate({ id: booking.id })}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">No bookings yet</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
