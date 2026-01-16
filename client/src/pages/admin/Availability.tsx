import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { Plus, X, Calendar as CalendarIcon, Filter } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminAvailability() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);
  const [dateFilter, setDateFilter] = useState({ startDate: '', endDate: '' });
  const [newSlot, setNewSlot] = useState({ 
    date: '', 
    startTime: '', 
    endTime: '', 
    eventType: 'online' as 'online' | 'in-person',
    location: '',
    isFree: true,
    price: '',
    title: 'One-on-One Dance Session',
    description: '',
    sessionType: 'private' as 'private' | 'group',
    capacity: 1
  });

  const { data: slots, isLoading } = trpc.admin.availability.search.useQuery(
    { 
      startDate: dateFilter.startDate || undefined, 
      endDate: dateFilter.endDate || undefined 
    },
    { enabled: isAuthenticated && user?.role === 'admin' }
  );

  const createMutation = trpc.admin.availability.create.useMutation({
    onSuccess: () => {
      toast.success("Time slot created!");
      utils.admin.availability.search.invalidate();
      utils.admin.availability.list.invalidate();
      setDialogOpen(false);
      setNewSlot({
        date: '', startTime: '', endTime: '', eventType: 'online', location: '',
        isFree: true, price: '', title: 'One-on-One Dance Session', description: '',
        sessionType: 'private', capacity: 1
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create slot");
    },
  });

  const deleteMutation = trpc.admin.availability.delete.useMutation({
    onSuccess: () => {
      toast.success("Slot deleted");
      utils.admin.availability.search.invalidate();
      utils.admin.availability.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete slot");
    },
  });

  const bulkDeleteMutation = trpc.admin.availability.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} slot(s) deleted`);
      utils.admin.availability.search.invalidate();
      utils.admin.availability.list.invalidate();
      setSelectedSlots([]);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete slots");
    },
  });

  const handleCreateSlot = () => {
    if (!newSlot.date || !newSlot.startTime || !newSlot.endTime) {
      toast.error("Please fill in all required fields");
      return;
    }

    const startTime = new Date(`${newSlot.date}T${newSlot.startTime}`).toISOString();
    const endTime = new Date(`${newSlot.date}T${newSlot.endTime}`).toISOString();

    createMutation.mutate({
      startTime,
      endTime,
      eventType: newSlot.eventType,
      location: newSlot.location || undefined,
      isFree: newSlot.isFree,
      price: newSlot.isFree ? undefined : newSlot.price,
      title: newSlot.title,
      description: newSlot.description || undefined,
      sessionType: newSlot.sessionType,
      capacity: newSlot.capacity,
    });
  };

  const handleBulkDelete = () => {
    if (selectedSlots.length === 0) return;
    if (confirm(`Delete ${selectedSlots.length} selected slot(s)?`)) {
      bulkDeleteMutation.mutate({ ids: selectedSlots });
    }
  };

  const setQuickFilter = (type: 'today' | 'week' | 'month') => {
    const today = new Date();
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    
    let end = new Date(today);
    if (type === 'today') {
      end.setHours(23, 59, 59, 999);
    } else if (type === 'week') {
      end.setDate(end.getDate() + 7);
    } else if (type === 'month') {
      end.setDate(end.getDate() + 30);
    }
    
    setDateFilter({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    });
  };

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Available Sessions</h1>
            <p className="text-muted-foreground mt-2">Manage your available time slots for bookings</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Time Slot
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Time Slot</DialogTitle>
                <DialogDescription>Add a new available session time</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={newSlot.date}
                      onChange={(e) => setNewSlot({ ...newSlot, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={newSlot.startTime}
                      onChange={(e) => setNewSlot({ ...newSlot, startTime: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endTime">End Time</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={newSlot.endTime}
                      onChange={(e) => setNewSlot({ ...newSlot, endTime: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={newSlot.title}
                    onChange={(e) => setNewSlot({ ...newSlot, title: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newSlot.description}
                    onChange={(e) => setNewSlot({ ...newSlot, description: e.target.value })}
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isFree"
                    checked={newSlot.isFree}
                    onCheckedChange={(checked) => setNewSlot({ ...newSlot, isFree: checked })}
                  />
                  <Label htmlFor="isFree">Free Session</Label>
                </div>
                {!newSlot.isFree && (
                  <div>
                    <Label htmlFor="price">Price (€)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={newSlot.price}
                      onChange={(e) => setNewSlot({ ...newSlot, price: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateSlot}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filter by Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <Label htmlFor="filter-start-date">Start Date</Label>
                <Input
                  id="filter-start-date"
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="filter-end-date">End Date</Label>
                <Input
                  id="filter-end-date"
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) => setDateFilter({ ...dateFilter, endDate: e.target.value })}
                />
              </div>
              <Button variant="outline" onClick={() => setQuickFilter('today')}>Today</Button>
              <Button variant="outline" onClick={() => setQuickFilter('week')}>This Week</Button>
              <Button variant="outline" onClick={() => setQuickFilter('month')}>This Month</Button>
              <Button variant="outline" onClick={() => setDateFilter({ startDate: '', endDate: '' })}>
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedSlots.length > 0 && (
          <Card className="bg-primary/5 border-primary">
            <CardContent className="flex items-center justify-between py-4">
              <p className="text-sm font-medium">{selectedSlots.length} slot(s) selected</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedSlots([])}>
                  Clear Selection
                </Button>
                <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                  Delete Selected
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Slots List */}
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Showing {slots?.length || 0} session(s)
          </p>
          {slots && slots.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedSlots.length === slots.length) {
                  setSelectedSlots([]);
                } else {
                  setSelectedSlots(slots.map((s: any) => s.id));
                }
              }}
              className="mb-4"
            >
              {selectedSlots.length === slots.length ? 'Deselect All' : 'Select All'}
            </Button>
          )}
          <div className="space-y-2">
            {slots && slots.length > 0 ? (
              slots.map((slot: any) => (
                <Card key={slot.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={selectedSlots.includes(slot.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSlots([...selectedSlots, slot.id]);
                          } else {
                            setSelectedSlots(selectedSlots.filter(id => id !== slot.id));
                          }
                        }}
                      />
                      <div>
                        <p className="font-medium">{slot.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(slot.startTime).toLocaleString()} - {new Date(slot.endTime).toLocaleTimeString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {slot.eventType === 'online' ? '💻 Online' : '📍 In-person'} • 
                          {slot.sessionType === 'private' ? '👤 Private' : '👥 Group'} • 
                          {slot.isFree ? '🆓 Free' : `💰 €${slot.price}`} • 
                          {slot.isBooked ? '🔒 Booked' : '✅ Available'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ id: slot.id })}
                    >
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground">
                    {dateFilter.startDate || dateFilter.endDate 
                      ? 'No sessions found for the selected date range'
                      : 'No available sessions yet. Create your first time slot!'}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
