import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Calendar as CalendarIcon, Clock, Video, MapPin, Euro, ChevronLeft, ChevronRight, X, Filter } from "lucide-react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns";

type FilterPreset = {
  label: string;
  eventType: "all" | "online" | "in-person";
  sessionType: "all" | "private" | "group";
  priceFilter: "all" | "free" | "premium";
};

const FILTER_PRESETS: FilterPreset[] = [
  { label: "All Sessions", eventType: "all", sessionType: "all", priceFilter: "all" },
  { label: "Free Online", eventType: "online", sessionType: "all", priceFilter: "free" },
  { label: "Group Classes", eventType: "all", sessionType: "group", priceFilter: "all" },
  { label: "Private 1-on-1", eventType: "all", sessionType: "private", priceFilter: "all" },
  { label: "In-Person", eventType: "in-person", sessionType: "all", priceFilter: "all" },
];

export default function BookSession() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [eventFilter, setEventFilter] = useState<"all" | "online" | "in-person">("all");
  const [sessionTypeFilter, setSessionTypeFilter] = useState<"all" | "private" | "group">("all");
  const [priceFilter, setPriceFilter] = useState<"all" | "free" | "premium">("all");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [showFilters, setShowFilters] = useState(true);

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
    if (params.get('success') === 'true') {
      toast.success("Payment successful! Your session has been booked.");
      window.history.replaceState({}, '', '/book-session');
    } else if (params.get('cancelled') === 'true') {
      toast.info("Payment cancelled. You can try again anytime.");
      window.history.replaceState({}, '', '/book-session');
    }
  }, []);

  // Apply price filter to slots
  const filteredSlots = useMemo(() => {
    if (!availableSlots) return [];
    if (priceFilter === "all") return availableSlots;
    if (priceFilter === "free") return availableSlots.filter(s => s.isFree);
    if (priceFilter === "premium") return availableSlots.filter(s => !s.isFree);
    return availableSlots;
  }, [availableSlots, priceFilter]);

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

  const applyPreset = (preset: FilterPreset) => {
    setEventFilter(preset.eventType);
    setSessionTypeFilter(preset.sessionType);
    setPriceFilter(preset.priceFilter);
  };

  const clearAllFilters = () => {
    setEventFilter("all");
    setSessionTypeFilter("all");
    setPriceFilter("all");
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (eventFilter !== "all") count++;
    if (sessionTypeFilter !== "all") count++;
    if (priceFilter !== "all") count++;
    return count;
  }, [eventFilter, sessionTypeFilter, priceFilter]);

  const hasActiveFilters = activeFilterCount > 0;

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group slots by date
  const slotsByDate = useMemo(() => {
    if (!filteredSlots) return {};
    return filteredSlots.reduce((acc: any, slot: any) => {
      const date = format(new Date(slot.startTime), 'yyyy-MM-dd');
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(slot);
      return acc;
    }, {});
  }, [filteredSlots]);

  const datesWithSlots = useMemo(() => {
    return new Set(Object.keys(slotsByDate));
  }, [slotsByDate]);

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
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-lavender-50 to-purple-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-pink-100 sticky top-0 z-50">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              Book a Session
            </h1>
          </div>
          {isAuthenticated && (
            <span className="text-sm text-muted-foreground">{user?.name || user?.email}</span>
          )}
        </div>
      </header>

      <div className="container py-8 space-y-6">
        {/* Session Info */}
        <Card>
          <CardHeader>
            <CardTitle>Dance Sessions with Elizabeth</CardTitle>
            <CardDescription>
              Choose from private 1-on-1 sessions or group classes - available online via Zoom or in-person at the studio.
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
              <div className="space-y-3">
                {myBookings
                  .filter((booking: any) => booking.status !== 'cancelled')
                  .map((booking: any) => {
                    const slot = availableSlots?.find((s: any) => s.id === booking.slotId);
                    if (!slot) return null;
                    
                    return (
                      <div key={booking.id} className="flex items-center justify-between p-4 border rounded-lg bg-pink-50/30">
                        <div className="flex-1">
                          <p className="font-semibold">{slot.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(slot.startTime), 'EEEE, MMMM d, yyyy')} at {format(new Date(slot.startTime), 'h:mm a')}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
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
                            <Badge variant="outline">
                              {slot.sessionType === 'private' ? '👤 Private' : '👥 Group'}
                            </Badge>
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

        {/* Filter Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filter Sessions
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="ml-2">
                      {activeFilterCount} active
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {filteredSlots.length} session{filteredSlots.length !== 1 ? 's' : ''} available
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear all
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowFilters(!showFilters)}
                >
                  {showFilters ? 'Hide' : 'Show'} Filters
                </Button>
              </div>
            </div>
          </CardHeader>
          {showFilters && (
            <CardContent className="space-y-6">
              {/* Quick Presets */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Quick Filters</Label>
                <div className="flex flex-wrap gap-2">
                  {FILTER_PRESETS.map((preset) => {
                    const isActive = 
                      preset.eventType === eventFilter &&
                      preset.sessionType === sessionTypeFilter &&
                      preset.priceFilter === priceFilter;
                    
                    return (
                      <Button
                        key={preset.label}
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        onClick={() => applyPreset(preset)}
                        className="transition-all"
                      >
                        {preset.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Individual Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Location Type */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Location</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={eventFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEventFilter("all")}
                    >
                      All
                    </Button>
                    <Button
                      variant={eventFilter === "online" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEventFilter("online")}
                      className="flex items-center gap-1"
                    >
                      <Video className="h-3 w-3" />
                      Online
                    </Button>
                    <Button
                      variant={eventFilter === "in-person" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEventFilter("in-person")}
                      className="flex items-center gap-1"
                    >
                      <MapPin className="h-3 w-3" />
                      In-Person
                    </Button>
                  </div>
                </div>

                {/* Session Type */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Session Type</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={sessionTypeFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSessionTypeFilter("all")}
                    >
                      All
                    </Button>
                    <Button
                      variant={sessionTypeFilter === "private" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSessionTypeFilter("private")}
                    >
                      👤 Private
                    </Button>
                    <Button
                      variant={sessionTypeFilter === "group" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSessionTypeFilter("group")}
                    >
                      👥 Group
                    </Button>
                  </div>
                </div>

                {/* Price */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Price</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={priceFilter === "all" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPriceFilter("all")}
                    >
                      All
                    </Button>
                    <Button
                      variant={priceFilter === "free" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPriceFilter("free")}
                    >
                      Free
                    </Button>
                    <Button
                      variant={priceFilter === "premium" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPriceFilter("premium")}
                      className="flex items-center gap-1"
                    >
                      ✨ Premium
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* View Toggle */}
        <div className="flex justify-center gap-2">
          <Button
            variant={viewMode === "calendar" ? "default" : "outline"}
            onClick={() => setViewMode("calendar")}
            className="flex items-center gap-2"
          >
            <CalendarIcon className="h-4 w-4" />
            Calendar View
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            onClick={() => setViewMode("list")}
          >
            List View
          </Button>
        </div>

        {/* Available Sessions */}
        {slotsLoading ? (
          <Card>
            <CardContent className="py-8">
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-muted rounded animate-pulse"></div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : viewMode === "calendar" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Calendar */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" onClick={previousMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle className="text-lg">
                    {format(currentMonth, 'MMMM yyyy')}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>Select a date to view available times</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <div key={day} className="text-center text-sm font-semibold text-muted-foreground p-2">
                      {day}
                    </div>
                  ))}
                  
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
              </CardContent>
            </Card>

            {/* Selected Date Slots */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a Date'}
                </CardTitle>
                <CardDescription>
                  {selectedDateSlots.length} session{selectedDateSlots.length !== 1 ? 's' : ''} available
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedDateSlots.length > 0 ? (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {selectedDateSlots.map((slot: any) => (
                      <SlotCard key={slot.id} slot={slot} onBook={handleBookSlot} />
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {selectedDate ? 'No sessions available for this date' : 'Select a date to view available sessions'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Available Sessions</CardTitle>
              <CardDescription>
                {filteredSlots.length} session{filteredSlots.length !== 1 ? 's' : ''} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredSlots.length > 0 ? (
                <div className="space-y-4">
                  {filteredSlots.map((slot: any) => (
                    <SlotCard key={slot.id} slot={slot} onBook={handleBookSlot} showDate />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No sessions match your filters. Try adjusting your selection.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Booking Dialog */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Booking</DialogTitle>
            <DialogDescription>
              {selectedSlot && (
                <div className="space-y-2 mt-4">
                  <p className="font-semibold text-lg">{selectedSlot.title}</p>
                  <p className="text-sm">
                    {format(new Date(selectedSlot.startTime), 'EEEE, MMMM d, yyyy')} at {format(new Date(selectedSlot.startTime), 'h:mm a')}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedSlot.eventType === 'online' ? (
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
                    <Badge variant="outline">
                      {selectedSlot.sessionType === 'private' ? '👤 Private' : `👥 Group (${selectedSlot.currentBookings}/${selectedSlot.capacity})`}
                    </Badge>
                  </div>
                  {selectedSlot.location && selectedSlot.eventType === 'in-person' && (
                    <p className="text-sm">📍 {selectedSlot.location}</p>
                  )}
                  <p className="text-lg font-bold text-primary mt-2">
                    {selectedSlot.isFree ? 'Free Session' : `€${selectedSlot.price}`}
                  </p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any special requests or information..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
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
                : "Proceed to Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Slot Card Component
function SlotCard({ slot, onBook, showDate = false }: { slot: any; onBook: (slot: any) => void; showDate?: boolean }) {
  const isFullyBooked = slot.sessionType === 'group' 
    ? slot.currentBookings >= slot.capacity 
    : slot.isBooked;

  return (
    <div className="p-4 border rounded-lg hover:border-primary transition-colors bg-card">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 space-y-2">
          <h4 className="font-semibold text-lg">{slot.title}</h4>
          {slot.description && (
            <p className="text-sm text-muted-foreground">{slot.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {showDate && (
              <span className="text-sm flex items-center gap-1">
                <CalendarIcon className="h-4 w-4" />
                {format(new Date(slot.startTime), 'MMM d, yyyy')}
              </span>
            )}
            <span className="text-sm flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {format(new Date(slot.startTime), 'h:mm a')} - {format(new Date(slot.endTime), 'h:mm a')}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
            <Badge variant="outline">
              {slot.sessionType === 'private' ? '👤 Private' : '👥 Group'}
            </Badge>
            {slot.sessionType === 'group' && (
              <Badge variant="secondary">
                {slot.currentBookings}/{slot.capacity} booked
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
            <p className="text-sm text-muted-foreground">
              📍 {slot.location}
            </p>
          )}
        </div>
        <Button
          onClick={() => onBook(slot)}
          disabled={isFullyBooked}
          size="sm"
        >
          {isFullyBooked ? 'Full' : 'Book Now'}
        </Button>
      </div>
    </div>
  );
}
