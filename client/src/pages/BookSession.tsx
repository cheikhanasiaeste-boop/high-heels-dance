import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Calendar as CalendarIcon, Clock, Video } from "lucide-react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function BookSession() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: availableSlots, isLoading: slotsLoading } = trpc.bookings.availableSlots.useQuery();
  const { data: myBookings } = trpc.bookings.myBookings.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const bookMutation = trpc.bookings.create.useMutation({
    onSuccess: () => {
      toast.success("Session booked successfully! Check your email for the Zoom link.");
      utils.bookings.availableSlots.invalidate();
      utils.bookings.myBookings.invalidate();
      setBookingDialogOpen(false);
      setSelectedSlot(null);
      setNotes("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to book session");
    },
  });

  const cancelMutation = trpc.bookings.cancel.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled successfully");
      utils.bookings.availableSlots.invalidate();
      utils.bookings.myBookings.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel booking");
    },
  });

  const handleBookSlot = (slot: any) => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    setSelectedSlot(slot);
    setBookingDialogOpen(true);
  };

  const confirmBooking = () => {
    if (!selectedSlot) return;
    bookMutation.mutate({
      slotId: selectedSlot.id,
      notes: notes || undefined,
    });
  };

  const handleCancelBooking = (bookingId: number) => {
    if (confirm("Are you sure you want to cancel this booking?")) {
      cancelMutation.mutate({ id: bookingId });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Group slots by date
  const slotsByDate = availableSlots?.reduce((acc: any, slot: any) => {
    const date = format(new Date(slot.startTime), 'yyyy-MM-dd');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(slot);
    return acc;
  }, {});

  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="container py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Book a Session</h1>
          </div>
          {isAuthenticated && (
            <span className="text-sm text-muted-foreground">{user?.name || user?.email}</span>
          )}
        </div>
      </header>

      <div className="container py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Session Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                One-on-One Dance Session
              </CardTitle>
              <CardDescription>
                Book a private 60-minute Zoom session with Elizabeth Zolotova to improve your high heels dance technique, 
                learn new choreography, or get personalized feedback on your performance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>60 minutes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <span>Online via Zoom</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* My Bookings */}
          {isAuthenticated && myBookings && myBookings.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>My Upcoming Sessions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {myBookings
                    .filter((booking: any) => booking.status !== 'cancelled')
                    .map((booking: any) => {
                      const slot = availableSlots?.find((s: any) => s.id === booking.slotId);
                      if (!slot) return null;
                      
                      return (
                        <div key={booking.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <p className="font-semibold">
                              {format(new Date(slot.startTime), 'EEEE, MMMM d, yyyy')}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(slot.startTime), 'h:mm a')} - {format(new Date(slot.endTime), 'h:mm a')}
                            </p>
                            {booking.zoomLink && (
                              <a 
                                href={booking.zoomLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline mt-1 inline-block"
                              >
                                Join Zoom Meeting →
                              </a>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelBooking(booking.id)}
                            disabled={cancelMutation.isPending}
                          >
                            Cancel
                          </Button>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Available Time Slots */}
          <Card>
            <CardHeader>
              <CardTitle>Available Time Slots</CardTitle>
              <CardDescription>Select a time that works best for you</CardDescription>
            </CardHeader>
            <CardContent>
              {slotsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-muted rounded animate-pulse"></div>
                  ))}
                </div>
              ) : availableSlots && availableSlots.length > 0 ? (
                <div className="space-y-6">
                  {Object.entries(slotsByDate || {}).map(([date, slots]: [string, any]) => (
                    <div key={date}>
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {slots.map((slot: any) => (
                          <Button
                            key={slot.id}
                            variant="outline"
                            className="h-auto py-3 flex flex-col items-start"
                            onClick={() => handleBookSlot(slot)}
                          >
                            <span className="font-semibold">
                              {format(new Date(slot.startTime), 'h:mm a')}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(slot.endTime), 'h:mm a')}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No available time slots at the moment.</p>
                  <p className="text-sm">Please check back later.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Booking Confirmation Dialog */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Booking</DialogTitle>
            <DialogDescription>
              You're about to book a one-on-one dance session
            </DialogDescription>
          </DialogHeader>
          {selectedSlot && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="font-semibold">
                  {format(new Date(selectedSlot.startTime), 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedSlot.startTime), 'h:mm a')} - {format(new Date(selectedSlot.endTime), 'h:mm a')}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any specific topics or questions you'd like to cover?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmBooking} disabled={bookMutation.isPending}>
              {bookMutation.isPending ? "Booking..." : "Confirm Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
