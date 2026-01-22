import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Plus, Pencil, Trash2, AlertCircle, Calendar, X } from "lucide-react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";
import { useState } from "react";
import { toast } from "sonner";
import { ContentEditor } from "@/components/ContentEditor";
import { UserManagement } from "@/components/UserManagement";


export default function Admin() {
  const { user, isAuthenticated, loading } = useAuth();
  const utils = trpc.useUtils();
  
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' });
  const [newSlot, setNewSlot] = useState({ 
    date: '', 
    startTime: '', 
    endTime: '', 
    eventType: 'online' as 'online' | 'in-person',
    location: '',
    meetLink: '',
    isFree: true,
    price: '',
    title: 'One-on-One Dance Session',
    description: '',
    sessionType: 'private' as 'private' | 'group',
    capacity: 1
  });

  const { data: courses, isLoading: coursesLoading } = trpc.admin.courses.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );
  
  const { data: bannerData } = trpc.admin.banner.get.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );
  
  const { data: availabilitySlots } = trpc.admin.availability.search.useQuery(
    { 
      startDate: dateFilter.startDate || undefined, 
      endDate: dateFilter.endDate || undefined 
    },
    { enabled: isAuthenticated && user?.role === 'admin' }
  );
  
  const { data: allBookings } = trpc.admin.bookings.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );
  
  const { data: testimonials } = trpc.admin.testimonials.list.useQuery(
    undefined,
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  const createCourseMutation = trpc.admin.courses.create.useMutation({
    onSuccess: () => {
      toast.success("Course created successfully!");
      utils.admin.courses.list.invalidate();
      utils.courses.list.invalidate();
      setCourseDialogOpen(false);
      setEditingCourse(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create course");
    },
  });

  const updateCourseMutation = trpc.admin.courses.update.useMutation({
    onSuccess: () => {
      toast.success("Course updated successfully!");
      utils.admin.courses.list.invalidate();
      utils.courses.list.invalidate();
      setCourseDialogOpen(false);
      setEditingCourse(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update course");
    },
  });

  const deleteCourseMutation = trpc.admin.courses.delete.useMutation({
    onSuccess: () => {
      toast.success("Course deleted successfully!");
      utils.admin.courses.list.invalidate();
      utils.courses.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete course");
    },
  });

  const updateBannerMutation = trpc.admin.banner.update.useMutation({
    onSuccess: () => {
      toast.success("Banner updated successfully!");
      utils.admin.banner.get.invalidate();
      utils.banner.get.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update banner");
    },
  });
  
  const { data: heroVideoUrl } = trpc.admin.settings.get.useQuery(
    { key: "heroVideoUrl" },
    { enabled: isAuthenticated && user?.role === 'admin' }
  );
  
  const uploadVideoMutation = trpc.testimonials.uploadVideo.useMutation();
  
  const updateSettingMutation = trpc.admin.settings.update.useMutation({
    onSuccess: () => {
      utils.admin.settings.get.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update setting");
    },
  });
  
  const createSlotMutation = trpc.admin.availability.create.useMutation({
    onSuccess: () => {
      toast.success("Time slot added successfully!");
      utils.admin.availability.search.invalidate();
      utils.bookings.availableSlots.invalidate();
      setAvailabilityDialogOpen(false);
      setNewSlot({ 
        date: '', 
        startTime: '', 
        endTime: '', 
        eventType: 'online',
        location: '',
        meetLink: '',
        isFree: true,
        price: '',
        title: 'One-on-One Dance Session',
        description: '',
        sessionType: 'private',
        capacity: 1
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add time slot");
    },
  });
  
  const deleteSlotMutation = trpc.admin.availability.delete.useMutation({
    onSuccess: () => {
      toast.success("Time slot deleted successfully!");
      utils.admin.availability.search.invalidate();
      utils.bookings.availableSlots.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete time slot");
    },
  });
  
  const bulkDeleteSlotsMutation = trpc.admin.availability.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count} session(s) deleted successfully!`);
      setSelectedSlots([]);
      utils.admin.availability.search.invalidate();
      utils.bookings.availableSlots.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete sessions");
    },
  });
  
  const cancelBookingMutation = trpc.admin.bookings.cancel.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled successfully!");
      utils.admin.bookings.list.invalidate();
      utils.admin.availability.search.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel booking");
    },
  });
  
  const approveTestimonialMutation = trpc.admin.testimonials.approve.useMutation({
    onSuccess: () => {
      toast.success("Testimonial approved!");
      utils.admin.testimonials.list.invalidate();
      utils.testimonials.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to approve testimonial");
    },
  });
  
  const rejectTestimonialMutation = trpc.admin.testimonials.reject.useMutation({
    onSuccess: () => {
      toast.success("Testimonial rejected");
      utils.admin.testimonials.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to reject testimonial");
    },
  });
  
  const toggleFeaturedMutation = trpc.admin.testimonials.toggleFeatured.useMutation({
    onSuccess: () => {
      toast.success("Featured status updated!");
      utils.admin.testimonials.list.invalidate();
      utils.testimonials.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update featured status");
    },
  });
  
  const deleteTestimonialMutation = trpc.admin.testimonials.delete.useMutation({
    onSuccess: () => {
      toast.success("Testimonial deleted");
      utils.admin.testimonials.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to cancel booking");
    },
  });
  
  const uploadMutation = trpc.upload.useMutation({
    onSuccess: (data) => {
      setEditingCourse((prev: any) => ({
        ...prev,
        imageUrl: data.url,
        imageKey: data.key,
      }));
      toast.success("Image uploaded successfully!");
      setUploading(false);
    },
    onError: (error) => {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
      setUploading(false);
    },
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You need admin privileges to access this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full">Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      
      // Convert to base64
      const binary = Array.from(buffer).map(b => String.fromCharCode(b)).join('');
      const base64Data = btoa(binary);
      
      const randomSuffix = Math.random().toString(36).substring(7);
      const fileKey = `courses/${Date.now()}-${randomSuffix}-${file.name}`;
      
      uploadMutation.mutate({
        key: fileKey,
        data: base64Data,
        contentType: file.type,
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to process image");
      setUploading(false);
    }
  };

  const handleSaveCourse = () => {
    if (!editingCourse) return;

    const courseData = {
      title: editingCourse.title,
      description: editingCourse.description,
      price: editingCourse.price || "0",
      originalPrice: editingCourse.originalPrice || undefined,
      imageUrl: editingCourse.imageUrl || undefined,
      imageKey: editingCourse.imageKey || undefined,
      isFree: editingCourse.isFree || false,
      isPublished: editingCourse.isPublished !== false,
    };

    if (editingCourse.id) {
      updateCourseMutation.mutate({ id: editingCourse.id, ...courseData });
    } else {
      createCourseMutation.mutate(courseData);
    }
  };

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
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>
          <span className="text-sm text-muted-foreground">{user?.name || user?.email}</span>
        </div>
      </header>

      <div className="container py-8 space-y-8">
        {/* Session Bookings Management */}
        <Card>
          <CardHeader>
            <CardTitle>Session Bookings</CardTitle>
            <CardDescription>View and manage all session bookings</CardDescription>
          </CardHeader>
          <CardContent>
            {allBookings && allBookings.length > 0 ? (
              <div className="space-y-4">
                {allBookings.map((booking) => {
                  const slot = availabilitySlots?.find(s => s.id === booking.slotId);
                  return (
                    <div key={booking.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <p className="font-semibold">
                          {slot ? new Date(slot.startTime).toLocaleDateString() : 'N/A'} - 
                          {slot ? new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                        </p>
                        <p className="text-sm text-muted-foreground">User ID: {booking.userId}</p>
                        <p className="text-sm text-muted-foreground">Status: {booking.status}</p>
                        {booking.notes && <p className="text-sm mt-1">Notes: {booking.notes}</p>}
                      </div>
                      {booking.status !== 'cancelled' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm("Cancel this booking?")) {
                              cancelBookingMutation.mutate({ id: booking.id });
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>No bookings yet.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Availability Management */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center mb-4">
              <div>
                <CardTitle>Availability Slots</CardTitle>
                <CardDescription>Manage your available time slots for bookings</CardDescription>
              </div>
              <Dialog open={availabilityDialogOpen} onOpenChange={setAvailabilityDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Time Slot
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Availability Slot</DialogTitle>
                    <DialogDescription>Create a new time slot for session bookings</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                      <Label htmlFor="slot-title">Session Title</Label>
                      <Input
                        id="slot-title"
                        value={newSlot.title}
                        onChange={(e) => setNewSlot({ ...newSlot, title: e.target.value })}
                        placeholder="One-on-One Dance Session"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slot-description">Description (Optional)</Label>
                      <Textarea
                        id="slot-description"
                        value={newSlot.description}
                        onChange={(e) => setNewSlot({ ...newSlot, description: e.target.value })}
                        placeholder="Session details..."
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slot-date">Date</Label>
                      <Input
                        id="slot-date"
                        type="date"
                        value={newSlot.date}
                        onChange={(e) => setNewSlot({ ...newSlot, date: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="slot-start">Start Time</Label>
                        <Input
                          id="slot-start"
                          type="time"
                          value={newSlot.startTime}
                          onChange={(e) => setNewSlot({ ...newSlot, startTime: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="slot-end">End Time</Label>
                        <Input
                          id="slot-end"
                          type="time"
                          value={newSlot.endTime}
                          onChange={(e) => setNewSlot({ ...newSlot, endTime: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slot-type">Event Type</Label>
                      <select
                        id="slot-type"
                        className="w-full p-2 border rounded-md"
                        value={newSlot.eventType}
                        onChange={(e) => setNewSlot({ ...newSlot, eventType: e.target.value as 'online' | 'in-person' })}
                      >
                        <option value="online">Online (Zoom)</option>
                        <option value="in-person">In-Person</option>
                      </select>
                    </div>
                    {newSlot.eventType === 'in-person' && (
                      <div className="space-y-2">
                        <Label htmlFor="slot-location">Location</Label>
                        <Input
                          id="slot-location"
                          value={newSlot.location}
                          onChange={(e) => setNewSlot({ ...newSlot, location: e.target.value })}
                          placeholder="Studio address..."
                        />
                      </div>
                    )}
                    {newSlot.eventType === 'online' && (
                      <div className="space-y-2">
                        <Label htmlFor="slot-meetlink">Zoom Meeting Link</Label>
                        <Input
                          id="slot-meetlink"
                          value={newSlot.meetLink}
                          onChange={(e) => setNewSlot({ ...newSlot, meetLink: e.target.value })}
                          placeholder="https://zoom.us/j/..."
                        />
                        <p className="text-xs text-gray-500">Enter the Zoom meeting link for this session</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="slot-session-type">Session Type</Label>
                      <select
                        id="slot-session-type"
                        className="w-full p-2 border rounded-md"
                        value={newSlot.sessionType}
                        onChange={(e) => {
                          const sessionType = e.target.value as 'private' | 'group';
                          setNewSlot({ 
                            ...newSlot, 
                            sessionType,
                            capacity: sessionType === 'private' ? 1 : 5
                          });
                        }}
                      >
                        <option value="private">Private (1-on-1)</option>
                        <option value="group">Group Session</option>
                      </select>
                    </div>
                    {newSlot.sessionType === 'group' && (
                      <div className="space-y-2">
                        <Label htmlFor="slot-capacity">Capacity (Max Participants)</Label>
                        <Input
                          id="slot-capacity"
                          type="number"
                          min="2"
                          value={newSlot.capacity}
                          onChange={(e) => setNewSlot({ ...newSlot, capacity: parseInt(e.target.value) || 2 })}
                          placeholder="5"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="slot-pricing">Pricing</Label>
                      <select
                        id="slot-pricing"
                        className="w-full p-2 border rounded-md"
                        value={newSlot.isFree ? 'free' : 'paid'}
                        onChange={(e) => setNewSlot({ ...newSlot, isFree: e.target.value === 'free' })}
                      >
                        <option value="free">Free (Account Required)</option>
                        <option value="paid">Paid (Payment Required)</option>
                      </select>
                    </div>
                    {!newSlot.isFree && (
                      <div className="space-y-2">
                        <Label htmlFor="slot-price">Price (EUR)</Label>
                        <Input
                          id="slot-price"
                          type="number"
                          step="0.01"
                          value={newSlot.price}
                          onChange={(e) => setNewSlot({ ...newSlot, price: e.target.value })}
                          placeholder="50.00"
                        />
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAvailabilityDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        if (!newSlot.date || !newSlot.startTime || !newSlot.endTime || !newSlot.title) {
                          toast.error("Please fill in all required fields");
                          return;
                        }
                        if (newSlot.eventType === 'in-person' && !newSlot.location) {
                          toast.error("Please provide a location for in-person sessions");
                          return;
                        }
                        if (!newSlot.isFree && !newSlot.price) {
                          toast.error("Please set a price for paid sessions");
                          return;
                        }
                        const startTime = new Date(`${newSlot.date}T${newSlot.startTime}`);
                        const endTime = new Date(`${newSlot.date}T${newSlot.endTime}`);
                        createSlotMutation.mutate({
                          startTime: startTime.toISOString(),
                          endTime: endTime.toISOString(),
                          eventType: newSlot.eventType,
                          location: newSlot.eventType === 'in-person' ? newSlot.location : undefined,
                          isFree: newSlot.isFree,
                          price: !newSlot.isFree ? newSlot.price : undefined,
                          title: newSlot.title,
                          description: newSlot.description || undefined,
                          sessionType: newSlot.sessionType,
                          capacity: newSlot.capacity,
                        });
                      }}
                      disabled={createSlotMutation.isPending}
                    >
                      {createSlotMutation.isPending ? "Adding..." : "Add Slot"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {/* Date Filter and Bulk Actions */}
            <div className="space-y-4 mb-6 p-4 bg-muted/50 rounded-lg">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="filter-start-date">Start Date</Label>
                  <Input
                    id="filter-start-date"
                    type="date"
                    value={dateFilter.startDate}
                    onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="filter-end-date">End Date</Label>
                  <Input
                    id="filter-end-date"
                    type="date"
                    value={dateFilter.endDate}
                    onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setDateFilter({ startDate: today, endDate: today });
                    }}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const today = new Date();
                      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
                      setDateFilter({ 
                        startDate: today.toISOString().split('T')[0], 
                        endDate: weekFromNow.toISOString().split('T')[0] 
                      });
                    }}
                  >
                    This Week
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const today = new Date();
                      const monthFromNow = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
                      setDateFilter({ 
                        startDate: today.toISOString().split('T')[0], 
                        endDate: monthFromNow.toISOString().split('T')[0] 
                      });
                    }}
                  >
                    This Month
                  </Button>
                  {(dateFilter.startDate || dateFilter.endDate) && (
                    <Button
                      variant="ghost"
                      onClick={() => setDateFilter({ startDate: '', endDate: '' })}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>
              
              {selectedSlots.length > 0 && (
                <div className="flex items-center gap-4 p-3 bg-background border rounded-lg">
                  <span className="text-sm font-medium">
                    {selectedSlots.length} session(s) selected
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete ${selectedSlots.length} selected session(s)?`)) {
                        bulkDeleteSlotsMutation.mutate({ ids: selectedSlots });
                      }
                    }}
                    disabled={bulkDeleteSlotsMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSlots([])}
                  >
                    Clear Selection
                  </Button>
                </div>
              )}
            </div>
            
            {availabilitySlots && availabilitySlots.length > 0 ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    Showing <span className="font-semibold text-foreground">{availabilitySlots.length}</span> session(s)
                    {dateFilter.startDate || dateFilter.endDate ? ' in selected date range' : ''}
                  </p>
                  {availabilitySlots.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const allIds = availabilitySlots.map(slot => slot.id);
                        setSelectedSlots(allIds);
                      }}
                    >
                      Select All
                    </Button>
                  )}
                </div>
                <div className="space-y-4">
                {availabilitySlots.map((slot) => (
                  <div key={slot.id} className="flex items-start gap-4 p-4 border rounded-lg">
                    <Checkbox
                      checked={selectedSlots.includes(slot.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSlots([...selectedSlots, slot.id]);
                        } else {
                          setSelectedSlots(selectedSlots.filter(id => id !== slot.id));
                        }
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="font-semibold">{slot.title}</p>
                      <p className="text-sm">
                        {new Date(slot.startTime).toLocaleDateString()} - 
                        {new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to 
                        {new Date(slot.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs px-2 py-1 bg-muted rounded">
                          {slot.eventType === 'online' ? '💻 Online' : '📍 In-Person'}
                        </span>
                        <span className="text-xs px-2 py-1 bg-muted rounded">
                          {slot.sessionType === 'private' ? '👤 Private' : '👥 Group'}
                        </span>
                        {slot.sessionType === 'group' && (
                          <span className="text-xs px-2 py-1 bg-muted rounded">
                            {slot.currentBookings}/{slot.capacity} booked
                          </span>
                        )}
                        <span className="text-xs px-2 py-1 bg-muted rounded">
                          {slot.isFree ? '🆓 Free' : `💰 €${slot.price}`}
                        </span>
                        <span className="text-xs px-2 py-1 bg-muted rounded">
                          {slot.sessionType === 'group' 
                            ? (slot.currentBookings >= slot.capacity ? '🔒 Full' : '✅ Available')
                            : (slot.isBooked ? '🔒 Booked' : '✅ Available')
                          }
                        </span>
                      </div>
                      {slot.location && (
                        <p className="text-xs text-muted-foreground mt-1">📍 {slot.location}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!slot.isBooked && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm("Delete this time slot?")) {
                              deleteSlotMutation.mutate({ id: slot.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              </>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {dateFilter.startDate || dateFilter.endDate 
                    ? "No sessions found for the selected date range. Try adjusting your filters."
                    : 'No availability slots yet. Click "Add Time Slot" to create your first slot.'}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Testimonial Management */}
        <Card>
          <CardHeader>
            <CardTitle>Testimonials</CardTitle>
            <CardDescription>Review and manage user feedback</CardDescription>
          </CardHeader>
          <CardContent>
            {testimonials && testimonials.length > 0 ? (
              <div className="space-y-4">
                {testimonials.map((testimonial) => (
                  <div key={testimonial.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{testimonial.userName}</p>
                          <div className="flex">
                            {Array.from({ length: testimonial.rating }).map((_, i) => (
                              <span key={i} className="text-yellow-400">★</span>
                            ))}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {testimonial.type === 'session' ? 'Session' : 'Course'} Feedback
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          testimonial.status === 'approved' ? 'bg-green-100 text-green-700' :
                          testimonial.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {testimonial.status}
                        </span>
                        {testimonial.isFeatured && (
                          <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                            Featured
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm">{testimonial.review}</p>
                    <div className="flex gap-2 flex-wrap">
                      {testimonial.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => approveTestimonialMutation.mutate({ id: testimonial.id })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => rejectTestimonialMutation.mutate({ id: testimonial.id })}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {testimonial.status === 'approved' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleFeaturedMutation.mutate({ 
                            id: testimonial.id, 
                            isFeatured: !testimonial.isFeatured 
                          })}
                        >
                          {testimonial.isFeatured ? 'Unfeature' : 'Feature'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm("Delete this testimonial?")) {
                            deleteTestimonialMutation.mutate({ id: testimonial.id });
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>No testimonials yet.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Hero Video Background */}
        <Card>
          <CardHeader>
            <CardTitle>Hero Background Video</CardTitle>
            <CardDescription>Upload a dance video to display in the hero section background</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hero-video">Background Video</Label>
              <Input
                id="hero-video"
                type="file"
                accept="video/mp4,video/webm"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  // Check file size (max 50MB)
                  if (file.size > 50 * 1024 * 1024) {
                    toast.error("Video file must be less than 50MB");
                    return;
                  }
                  
                  try {
                    toast.info("Uploading video...");
                    
                    // Convert file to base64
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                      const base64 = e.target?.result as string;
                      const data = base64.split(',')[1]; // Remove data:video/mp4;base64, prefix
                      
                      try {
                        const result = await uploadVideoMutation.mutateAsync({
                          filename: file.name,
                          contentType: file.type,
                          data,
                        });
                        
                        // Save video URL to settings
                        await updateSettingMutation.mutateAsync({
                          key: "heroVideoUrl",
                          value: result.url,
                        });
                        
                        toast.success("Hero video updated successfully!");
                      } catch (error) {
                        toast.error("Failed to upload video");
                      }
                    };
                    reader.readAsDataURL(file);
                  } catch (error) {
                    toast.error("Failed to process video");
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                Recommended: MP4 format, 1920x1080 resolution, max 50MB
              </p>
            </div>
            
            {heroVideoUrl && (
              <div className="space-y-2">
                <Label>Current Video Preview</Label>
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  <video
                    src={heroVideoUrl}
                    className="w-full h-full object-cover"
                    controls
                  />
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    updateSettingMutation.mutate({
                      key: "heroVideoUrl",
                      value: "",
                    });
                    toast.success("Hero video removed");
                  }}
                >
                  Remove Video
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Content Editor */}
        <ContentEditor />

        {/* User Management */}
        <UserManagement />

        {/* Banner Management */}
        <Card>
          <CardHeader>
            <CardTitle>Discount Banner</CardTitle>
            <CardDescription>Control the promotional banner shown on the homepage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="banner-toggle">Show Banner</Label>
              <Switch
                id="banner-toggle"
                checked={bannerData?.enabled || false}
                onCheckedChange={(checked) => {
                  updateBannerMutation.mutate({
                    enabled: checked,
                    text: bannerData?.text || "",
                  });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-text">Banner Text</Label>
              <Textarea
                id="banner-text"
                placeholder="Enter promotional message..."
                value={bannerData?.text || ""}
                onChange={(e) => {
                  // Update locally, save on blur
                }}
                onBlur={(e) => {
                  updateBannerMutation.mutate({
                    enabled: bannerData?.enabled || false,
                    text: e.target.value,
                  });
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Course Management */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Course Management</CardTitle>
                <CardDescription>Add, edit, or remove dance courses</CardDescription>
              </div>
              <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setEditingCourse({})}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Course
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingCourse?.id ? 'Edit Course' : 'Add New Course'}</DialogTitle>
                    <DialogDescription>
                      Fill in the course details below
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Course Title *</Label>
                      <Input
                        id="title"
                        value={editingCourse?.title || ""}
                        onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                        placeholder="e.g., CHOREO 'Mon Demon' 😈"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description *</Label>
                      <Textarea
                        id="description"
                        value={editingCourse?.description || ""}
                        onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                        placeholder="Describe the course content..."
                        rows={4}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="price">Price (€) *</Label>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          value={editingCourse?.price || ""}
                          onChange={(e) => setEditingCourse({ ...editingCourse, price: e.target.value })}
                          placeholder="29.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="originalPrice">Original Price (€)</Label>
                        <Input
                          id="originalPrice"
                          type="number"
                          step="0.01"
                          value={editingCourse?.originalPrice || ""}
                          onChange={(e) => setEditingCourse({ ...editingCourse, originalPrice: e.target.value })}
                          placeholder="79.00"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="image">Course Image</Label>
                      <Input
                        id="image"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        disabled={uploading}
                      />
                      {editingCourse?.imageUrl && (
                        <img src={editingCourse.imageUrl} alt="Preview" className="mt-2 h-32 object-cover rounded" />
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isFree"
                        checked={editingCourse?.isFree || false}
                        onCheckedChange={(checked) => setEditingCourse({ ...editingCourse, isFree: checked })}
                      />
                      <Label htmlFor="isFree">Free Course</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="isPublished"
                        checked={editingCourse?.isPublished !== false}
                        onCheckedChange={(checked) => setEditingCourse({ ...editingCourse, isPublished: checked })}
                      />
                      <Label htmlFor="isPublished">Published</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCourseDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSaveCourse}
                      disabled={!editingCourse?.title || !editingCourse?.description || createCourseMutation.isPending || updateCourseMutation.isPending}
                    >
                      {createCourseMutation.isPending || updateCourseMutation.isPending ? "Saving..." : "Save Course"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {coursesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted rounded animate-pulse"></div>
                ))}
              </div>
            ) : courses && courses.length > 0 ? (
              <div className="space-y-4">
                {courses.map((course) => (
                  <div key={course.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-pink-100 to-purple-100 rounded flex items-center justify-center overflow-hidden">
                        {course.imageUrl ? (
                          <img src={course.imageUrl} alt={course.title} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl">💃</span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold">{course.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {course.isFree ? 'Free' : `€${course.price}`}
                          {!course.isPublished && <span className="ml-2 text-orange-600">(Unpublished)</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingCourse(course);
                          setCourseDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this course?")) {
                            deleteCourseMutation.mutate({ id: course.id });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No courses yet. Click "Add Course" to create your first course.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
