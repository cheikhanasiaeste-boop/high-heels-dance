import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Clock, Video, MapPin, Euro, Sparkles, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useProgressiveAuth } from "@/hooks/useProgressiveAuth";
import { ProgressiveAuthModal } from "@/components/ProgressiveAuthModal";
import { format, parseISO, isSameDay, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth } from "date-fns";

export default function BookSession() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { isAuthModalOpen, authContext, authContextDetails, requireAuth, closeAuthModal } = useProgressiveAuth();
  
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [eventFilter, setEventFilter] = useState<"all" | "online" | "in-person">("all");
  const [sessionTypeFilter, setSessionTypeFilter] = useState<"all" | "private" | "group">("all");
  const [priceFilter, setPriceFilter] = useState<"all" | "free" | "premium">("all");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const { data: availableSlots, isLoading: slotsLoading } = trpc.bookings.availableSlots.useQuery({
    eventType: eventFilter,
    sessionType: sessionTypeFilter,
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
    const success = params.get('success');
    const canceled = params.get('canceled');

    if (success) {
      toast.success("Payment successful! Your session is confirmed.");
      window.history.replaceState({}, '', '/book-session');
    } else if (canceled) {
      toast.error("Payment canceled. Please try again if you'd like to book this session.");
      window.history.replaceState({}, '', '/book-session');
    }
  }, []);

  // Get dates with available sessions and their counts
  const datesWithSessions = useMemo(() => {
    if (!availableSlots) return new Map<string, number>();
    
    const dateCounts = new Map<string, number>();
    availableSlots.forEach(slot => {
      const matchesPrice = priceFilter === "all" || 
        (priceFilter === "free" && (!slot.price || Number(slot.price) === 0)) ||
        (priceFilter === "premium" && slot.price && Number(slot.price) > 0);
      
      if (matchesPrice) {
        const dateKey = format(startOfDay(new Date(slot.startTime)), 'yyyy-MM-dd');
        dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
      }
    });
    
    return dateCounts;
  }, [availableSlots, priceFilter]);

  // Filter and group slots by price and selected date
  const filteredSlots = useMemo(() => {
    if (!availableSlots) return [];
    
    return availableSlots.filter((slot) => {
      const matchesPrice = priceFilter === "all" || 
        (priceFilter === "free" && (!slot.price || Number(slot.price) === 0)) ||
        (priceFilter === "premium" && slot.price && Number(slot.price) > 0);
      
      const matchesDate = !selectedDate || isSameDay(new Date(slot.startTime), selectedDate);
      
      return matchesPrice && matchesDate;
    });
  }, [availableSlots, priceFilter, selectedDate]);

  // Group slots by date
  const groupedSlots = useMemo(() => {
    const groups = new Map<string, typeof filteredSlots>();
    
    filteredSlots.forEach(slot => {
      const date = startOfDay(new Date(slot.startTime));
      const dateKey = format(date, 'yyyy-MM-dd');
      
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(slot);
    });
    
    // Sort slots within each group by time
    groups.forEach(slots => {
      slots.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    });
    
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredSlots]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start, end });
    
    // Pad start to align with week
    const startDay = start.getDay();
    const padding = Array(startDay).fill(null);
    
    return [...padding, ...days];
  }, [calendarMonth]);

  const handleBookClick = (slot: any) => {
    setSelectedSlot(slot);
    setBookingDialogOpen(true);
  };

  const handleBookingConfirm = async () => {
    if (!selectedSlot) return;

    await requireAuth("booking");

    const isPaid = selectedSlot.price && Number(selectedSlot.price) > 0;

    if (isPaid) {
      checkoutMutation.mutate({
        slotId: selectedSlot.id,
        notes: notes.trim() || undefined,
      });
    } else {
      bookMutation.mutate({
        slotId: selectedSlot.id,
        notes: notes.trim() || undefined,
      });
    }
  };

  const handleCancelBooking = (bookingId: number) => {
    if (confirm("Are you sure you want to cancel this booking?")) {
      cancelMutation.mutate({ id: bookingId });
    }
  };

  const getSessionTypeLabel = (sessionType: string) => {
    return sessionType === "private" ? "👤 Private" : "👥 Group";
  };

  const getEventTypeLabel = (eventType: string) => {
    return eventType === "online" ? "🌐 Online" : "📍 In-Person";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = startOfDay(new Date());
    const tomorrow = startOfDay(new Date(today.getTime() + 86400000));
    
    if (isSameDay(date, today)) return "Today";
    if (isSameDay(date, tomorrow)) return "Tomorrow";
    
    return format(date, "EEEE, MMMM d");
  };

  const handleDateClick = (date: Date) => {
    const dateKey = format(startOfDay(date), 'yyyy-MM-dd');
    if (datesWithSessions.has(dateKey)) {
      setSelectedDate(isSameDay(selectedDate || new Date(), date) ? null : date);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          
          <div className="space-y-2">
            <h1 className="text-4xl font-light tracking-tight text-gray-900">
              Book Your Dance Session
            </h1>
            <p className="text-gray-600">
              Private 1-on-1 or group classes • Online & in-person
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Filter Bar */}
        <div className="mb-8">
          <div className="bg-white/90 backdrop-blur-md rounded-full shadow-sm hover:shadow-md transition-shadow px-6 py-4 border border-gray-200">
            <div className="flex items-center justify-between gap-6">
              {/* Session Count */}
              <div className="text-sm font-medium text-gray-700">
                🎯 {filteredSlots.length} sessions
                {selectedDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDate(null)}
                    className="ml-2 h-6 px-2 text-xs"
                  >
                    Clear date
                  </Button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3 flex-1 justify-center">
                {/* Location */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={eventFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEventFilter("all")}
                    className="rounded-full transition-all"
                  >
                    All
                  </Button>
                  <Button
                    variant={eventFilter === "online" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEventFilter("online")}
                    className="rounded-full transition-all"
                  >
                    🌐 Online
                  </Button>
                  <Button
                    variant={eventFilter === "in-person" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEventFilter("in-person")}
                    className="rounded-full transition-all"
                  >
                    📍 In-Person
                  </Button>
                </div>

                <div className="h-6 w-px bg-gray-300" />

                {/* Session Type */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={sessionTypeFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSessionTypeFilter("all")}
                    className="rounded-full transition-all"
                  >
                    All
                  </Button>
                  <Button
                    variant={sessionTypeFilter === "private" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSessionTypeFilter("private")}
                    className="rounded-full transition-all"
                  >
                    👤 Private
                  </Button>
                  <Button
                    variant={sessionTypeFilter === "group" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSessionTypeFilter("group")}
                    className="rounded-full transition-all"
                  >
                    👥 Group
                  </Button>
                </div>

                <div className="h-6 w-px bg-gray-300" />

                {/* Price */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant={priceFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPriceFilter("all")}
                    className="rounded-full transition-all"
                  >
                    All
                  </Button>
                  <Button
                    variant={priceFilter === "free" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPriceFilter("free")}
                    className="rounded-full transition-all"
                  >
                    Free
                  </Button>
                  <Button
                    variant={priceFilter === "premium" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPriceFilter("premium")}
                    className="rounded-full transition-all"
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Premium
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content: Calendar + Sessions */}
        <div className="flex gap-8 items-start">
          {/* Compact Calendar Sidebar */}
          <div className="w-80 flex-shrink-0 sticky top-[200px]">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                {/* Month Navigation */}
                <div className="flex items-center justify-between mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="font-semibold text-sm">
                    {format(calendarMonth, "MMMM yyyy")}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                    <div key={i} className="text-center text-xs font-medium text-gray-500 py-1">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, i) => {
                    if (!day) {
                      return <div key={`empty-${i}`} className="aspect-square" />;
                    }

                    const dateKey = format(startOfDay(day), 'yyyy-MM-dd');
                    const sessionCount = datesWithSessions.get(dateKey) || 0;
                    const hasSession = sessionCount > 0;
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, new Date());
                    const isCurrentMonth = isSameMonth(day, calendarMonth);

                    return (
                      <button
                        key={dateKey}
                        onClick={() => handleDateClick(day)}
                        disabled={!hasSession}
                        className={`
                          aspect-square rounded-lg text-xs font-medium transition-all relative flex flex-col items-center justify-center gap-0.5
                          ${!isCurrentMonth ? 'text-gray-300' : ''}
                          ${hasSession ? 'cursor-pointer hover:bg-primary/10' : 'cursor-not-allowed opacity-40'}
                          ${isSelected ? 'bg-primary text-white hover:bg-primary' : ''}
                          ${isToday && !isSelected ? 'ring-2 ring-primary ring-inset' : ''}
                          ${!isSelected && hasSession && isCurrentMonth ? 'text-gray-900' : ''}
                        `}
                      >
                        <span>{format(day, 'd')}</span>
                        {hasSession && (
                          <span className={`text-[9px] font-semibold ${
                            isSelected ? 'text-white/90' : 'text-primary'
                          }`}>
                            {sessionCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Timeline View */}
          <div className="flex-1 min-w-0">
            {slotsLoading ? (
              <div className="text-center py-12 text-gray-500">Loading sessions...</div>
            ) : groupedSlots.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="text-6xl">📅</div>
                <h3 className="text-xl font-medium text-gray-900">No sessions available</h3>
                <p className="text-gray-600">
                  {selectedDate 
                    ? "No sessions on this date. Try selecting another date or clearing the filter."
                    : "Try adjusting your filters above"}
                </p>
              </div>
            ) : (
              <div className="space-y-12">
                {groupedSlots.map(([dateKey, slots]) => (
                  <div key={dateKey} className="space-y-6">
                    {/* Date Header */}
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                      <h2 className="text-xl font-semibold text-gray-900">
                        {formatDate(String(slots[0].startTime))}
                      </h2>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                    </div>

                    {/* Sessions for this date */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {slots.map((slot) => {
                        const isBooked = myBookings?.some(b => b.slotId === slot.id && b.status === "confirmed");
                        
                        return (
                          <Card 
                            key={slot.id} 
                            className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-gray-200"
                          >
                            <CardContent className="p-6 space-y-4">
                              {/* Time */}
                              <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                                <Clock className="h-5 w-5 text-primary" />
                                {format(new Date(slot.startTime), "h:mm a")}
                              </div>

                              {/* Title */}
                              <h3 className="font-medium text-gray-900 line-clamp-2">
                                {slot.title}
                              </h3>

                              {/* Metadata */}
                              <div className="flex gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {getEventTypeLabel(slot.eventType)}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {getSessionTypeLabel(slot.sessionType)}
                                </Badge>
                                {slot.price && Number(slot.price) > 0 ? (
                                  <Badge variant="secondary" className="text-xs">
                                    €{slot.price}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs text-green-700 bg-green-50">
                                    Free
                                  </Badge>
                                )}
                              </div>

                              {/* CTA */}
                              {isBooked ? (
                                <Button 
                                  variant="outline" 
                                  className="w-full"
                                  disabled
                                >
                                  Already Booked
                                </Button>
                              ) : (
                                <Button 
                                  onClick={() => handleBookClick(slot)}
                                  className="w-full group-hover:shadow-md transition-shadow"
                                >
                                  Book Now →
                                </Button>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Booking Dialog */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Booking</DialogTitle>
            <DialogDescription className="space-y-2 mt-4">
              {selectedSlot && (
                <>
                  <div className="font-medium text-gray-900">{selectedSlot.title}</div>
                  <div className="text-sm text-gray-600">
                    {format(new Date(selectedSlot.startTime), "EEEE, MMMM d 'at' h:mm a")}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary">{getEventTypeLabel(selectedSlot.eventType)}</Badge>
                    <Badge variant="secondary">{getSessionTypeLabel(selectedSlot.sessionType)}</Badge>
                    {selectedSlot.price && Number(selectedSlot.price) > 0 ? (
                      <Badge variant="secondary">€{selectedSlot.price}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-green-700 bg-green-50">Free</Badge>
                    )}
                  </div>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any special requests or information..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Membership CTA - Show only for paid sessions when user is authenticated */}
            {selectedSlot && selectedSlot.price && Number(selectedSlot.price) > 0 && isAuthenticated && (
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-3 text-center">
                  Or get unlimited access to all sessions with membership
                </p>
                <a href="/membership">
                  <Button variant="outline" className="w-full" size="sm">
                    <Crown className="h-4 w-4 mr-2" />
                    View Membership Plans
                  </Button>
                </a>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleBookingConfirm}
              disabled={bookMutation.isPending || checkoutMutation.isPending}
            >
              {bookMutation.isPending || checkoutMutation.isPending ? "Processing..." : "Confirm Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progressive Auth Modal */}
      <ProgressiveAuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        context={authContext || "booking"}
        contextDetails={authContextDetails}
      />
    </div>
  );
}
