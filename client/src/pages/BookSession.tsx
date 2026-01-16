import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Calendar as CalendarIcon, Clock, Video, MapPin, Euro, ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";

export default function BookSession() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [eventFilter, setEventFilter] = useState<"all" | "online" | "in-person">("all");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const { data: availableSlots, isLoading: slotsLoading } = trpc.bookings.availableSlots.useQuery({
    eventType: eventFilter,
  });
  
  const { data: myBookings } = trpc.bookings.myBookings.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const bookMutation = trpc.bookings.create.useMutation({
    onSuccess: () => {
      toast.success("Session booked successfully!");
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

  const checkoutMutation = trpc.bookings.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, '_blank');
        toast.info("Redirecting to payment...");
        setBookingDialogOpen(false);
        setSelectedSlot(null);
        setNotes("");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create checkout");
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

  // Check for payment success/cancel in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast.success("Payment successful! Your session has been booked.");
      window.history.replaceState({}, '', '/book-session');
    } else if (params.get('cancelled') === 'true') {
      toast.info("Payment cancelled. You can try again anytime.");
      window.history.replaceState({}, '', '/book-session');
    }
  }, []);

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
    
    if (selectedSlot.isFree) {
      bookMutation.mutate({
        slotId: selectedSlot.id,
        notes: notes || undefined,
      });
    } else {
      checkoutMutation.mutate({
        slotId: selectedSlot.id,
        notes: notes || undefined,
      });
    }
  };

  const handleCancelBooking = (bookingId: number) => {
    if (confirm("Are you sure you want to cancel this booking?")) {
      cancelMutation.mutate({ id: bookingId });
    }
  };

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group slots by date
  const slotsByDate = useMemo(() => {
    if (!availableSlots) return {};
    return availableSlots.reduce((acc: any, slot: any) => {
      const date = format(new Date(slot.startTime), 'yyyy-MM-dd');
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(slot);
      return acc;
    }, {});
  }, [availableSlots]);

  // Get dates with availability
  const datesWithSlots = useMemo(() => {
    return new Set(Object.keys(slotsByDate));
  }, [slotsByDate]);

  // Get slots for selected date
  const selectedDateSlots = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return slotsByDate[dateKey] || [];
  }, [selectedDate, slotsByDate]);

  const previousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleDateClick = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd');
    if (datesWithSlots.has(dateKey)) {
      setSelectedDate(date);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

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
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Session Info */}
          <Card>
            <CardHeader>
              <CardTitle>Private Dance Sessions</CardTitle>
              <CardDescription>
                Book private dance sessions with Elizabeth Zolotova - available online via Zoom or in-person at the studio.
              </CardDescription>
            </CardHeader>
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
                          <div className="flex-1">
                            <p className="font-semibold">{slot.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(slot.startTime), 'EEEE, MMMM d, yyyy')} at {format(new Date(slot.startTime), 'h:mm a')}
                            </p>
                            <div className="flex items-center gap-4 mt-2">
                              {slot.eventType === 'online' ? (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                  <Video className="h-3 w-3" />
                                  Online
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  In-Person
                                </Badge>
                              )}
                              {booking.paymentRequired && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                  <Euro className="h-3 w-3" />
                                  Paid
                                </Badge>
                              )}
                            </div>
                            {booking.zoomLink && (
                              <a 
                                href={booking.zoomLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-primary hover:underline mt-2 inline-block"
                              >
                                Join Zoom Meeting →
                              </a>
                            )}
                            {slot.location && slot.eventType === 'in-person' && (
                              <p className="text-sm text-muted-foreground mt-1">
                                📍 {slot.location}
                              </p>
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

          {/* Available Sessions with Calendar/List Toggle */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start flex-wrap gap-4">
                <div>
                  <CardTitle>Available Sessions</CardTitle>
                  <CardDescription>Select a date to view available time slots</CardDescription>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <Tabs value={eventFilter} onValueChange={(v) => setEventFilter(v as any)} className="w-auto">
                    <TabsList>
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="online">Online</TabsTrigger>
                      <TabsTrigger value="in-person">In-Person</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
                    <TabsList>
                      <TabsTrigger value="calendar">Calendar</TabsTrigger>
                      <TabsTrigger value="list">List</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {slotsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 bg-muted rounded animate-pulse"></div>
                  ))}
                </div>
              ) : viewMode === "calendar" ? (
                <div className="space-y-6">
                  {/* Calendar Header */}
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={previousMonth}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h3 className="text-lg font-semibold">
                      {format(currentMonth, 'MMMM yyyy')}
                    </h3>
                    <Button variant="outline" size="sm" onClick={nextMonth}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-2">
                    {/* Day headers */}
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                      <div key={day} className="text-center text-sm font-semibold text-muted-foreground p-2">
                        {day}
                      </div>
                    ))}
                    
                    {/* Calendar days */}
                    {calendarDays.map((day) => {
                      const dateKey = format(day, 'yyyy-MM-dd');
                      const hasSlots = datesWithSlots.has(dateKey);
                      const isSelected = selectedDate && isSameDay(day, selectedDate);
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      
                      return (
                        <button
                          key={day.toISOString()}
                          onClick={() => handleDateClick(day)}
                          disabled={!hasSlots}
                          className={`
                            aspect-square p-2 rounded-lg border transition-all
                            ${!isCurrentMonth ? 'text-muted-foreground/40' : ''}
                            ${hasSlots ? 'cursor-pointer hover:border-primary hover:bg-primary/5' : 'cursor-not-allowed opacity-50'}
                            ${isSelected ? 'border-primary bg-primary/10 font-semibold' : 'border-border'}
                          `}
                        >
                          <div className="text-sm">{format(day, 'd')}</div>
                          {hasSlots && (
                            <div className="mt-1 flex justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Date Slots */}
                  {selectedDate && selectedDateSlots.length > 0 && (
                    <div className="mt-6 space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                      </h4>
                      <div className="grid grid-cols-1 gap-3">
                        {selectedDateSlots.map((slot: any) => (
                          <div
                            key={slot.id}
                            className="p-4 border rounded-lg hover:border-primary transition-colors cursor-pointer"
                            onClick={() => handleBookSlot(slot)}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <p className="font-semibold">{slot.title}</p>
                                {slot.description && (
                                  <p className="text-sm text-muted-foreground mt-1">{slot.description}</p>
                                )}
                                <div className="flex items-center gap-4 mt-2 flex-wrap">
                                  <span className="text-sm flex items-center gap-1">
                                    <Clock className="h-4 w-4" />
                                    {format(new Date(slot.startTime), 'h:mm a')} - {format(new Date(slot.endTime), 'h:mm a')}
                                  </span>
                                  {slot.eventType === 'online' ? (
                                    <Badge variant="secondary" className="flex items-center gap-1">
                                      <Video className="h-3 w-3" />
                                      Online
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      In-Person
                                    </Badge>
                                  )}
                                  {slot.isFree ? (
                                    <Badge variant="outline">Free</Badge>
                                  ) : (
                                    <Badge variant="default" className="flex items-center gap-1">
                                      <Euro className="h-3 w-3" />
                                      €{slot.price}
                                    </Badge>
                                  )}
                                </div>
                                {slot.location && slot.eventType === 'in-person' && (
                                  <p className="text-sm text-muted-foreground mt-2">
                                    📍 {slot.location}
                                  </p>
                                )}
                              </div>
                              <Button size="sm">Book</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedDate && selectedDateSlots.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No available slots for this date.</p>
                    </div>
                  )}

                  {!selectedDate && (
                    <div className="text-center py-8 text-muted-foreground">
                      <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>Select a date with availability (marked with a dot) to view time slots.</p>
                    </div>
                  )}
                </div>
              ) : (
                // List View
                availableSlots && availableSlots.length > 0 ? (
                  <div className="space-y-6">
                    {Object.entries(slotsByDate).map(([date, slots]: [string, any]) => (
                      <div key={date}>
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4" />
                          {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          {slots.map((slot: any) => (
                            <div
                              key={slot.id}
                              className="p-4 border rounded-lg hover:border-primary transition-colors cursor-pointer"
                              onClick={() => handleBookSlot(slot)}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <p className="font-semibold">{slot.title}</p>
                                  {slot.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{slot.description}</p>
                                  )}
                                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                                    <span className="text-sm flex items-center gap-1">
                                      <Clock className="h-4 w-4" />
                                      {format(new Date(slot.startTime), 'h:mm a')} - {format(new Date(slot.endTime), 'h:mm a')}
                                    </span>
                                    {slot.eventType === 'online' ? (
                                      <Badge variant="secondary" className="flex items-center gap-1">
                                        <Video className="h-3 w-3" />
                                        Online
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        In-Person
                                      </Badge>
                                    )}
                                    {slot.isFree ? (
                                      <Badge variant="outline">Free</Badge>
                                    ) : (
                                      <Badge variant="default" className="flex items-center gap-1">
                                        <Euro className="h-3 w-3" />
                                        €{slot.price}
                                      </Badge>
                                    )}
                                  </div>
                                  {slot.location && slot.eventType === 'in-person' && (
                                    <p className="text-sm text-muted-foreground mt-2">
                                      📍 {slot.location}
                                    </p>
                                  )}
                                </div>
                                <Button size="sm">Book</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No available time slots at the moment.</p>
                    <p className="text-sm">Please check back later or try a different filter.</p>
                  </div>
                )
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
              {selectedSlot?.isFree 
                ? "You're about to book a free session (account required)"
                : `Payment of €${selectedSlot?.price} required to confirm booking`
              }
            </DialogDescription>
          </DialogHeader>
          {selectedSlot && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <p className="font-semibold">{selectedSlot.title}</p>
                <p className="text-sm">
                  {format(new Date(selectedSlot.startTime), 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedSlot.startTime), 'h:mm a')} - {format(new Date(selectedSlot.endTime), 'h:mm a')}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {selectedSlot.eventType === 'online' ? (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Video className="h-3 w-3" />
                      Online (Zoom)
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      In-Person
                    </Badge>
                  )}
                  {!selectedSlot.isFree && (
                    <Badge variant="default" className="flex items-center gap-1">
                      <Euro className="h-3 w-3" />
                      €{selectedSlot.price}
                    </Badge>
                  )}
                </div>
                {selectedSlot.location && selectedSlot.eventType === 'in-person' && (
                  <p className="text-sm text-muted-foreground">
                    📍 {selectedSlot.location}
                  </p>
                )}
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
            <Button 
              onClick={confirmBooking} 
              disabled={bookMutation.isPending || checkoutMutation.isPending}
            >
              {bookMutation.isPending || checkoutMutation.isPending 
                ? "Processing..." 
                : selectedSlot?.isFree 
                  ? "Confirm Booking" 
                  : "Proceed to Payment"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
