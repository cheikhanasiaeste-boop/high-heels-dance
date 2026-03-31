import { useState, useMemo } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Calendar, Users, MapPin, Link as LinkIcon, Edit, Trash2, Eye, EyeOff, UserPlus, UserMinus, Video, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";

type SessionStatus = "draft" | "published";
type EventType = "online" | "in-person";
type SessionType = "private" | "group";

interface SessionFormData {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  eventType: EventType;
  location: string;
  sessionLink: string;
  isFree: boolean;
  price: string;
  sessionType: SessionType;
  capacity: number;
  status: SessionStatus;
}

const defaultFormData: SessionFormData = {
  title: "",
  description: "",
  startTime: "",
  endTime: "",
  eventType: "online",
  location: "",
  sessionLink: "",
  isFree: true,
  price: "",
  sessionType: "private",
  capacity: 1,
  status: "draft",
};

interface LiveSessionFormData {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  isFree: boolean;
  price: string;
  capacity: number;
}

const defaultLiveFormData: LiveSessionFormData = {
  title: "",
  description: "",
  startTime: "",
  endTime: "",
  isFree: true,
  price: "",
  capacity: 100,
};

function formatDateTimeLocal(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "live": return "bg-green-500 text-white hover:bg-green-600";
    case "scheduled": return "bg-blue-100 text-blue-800 border-blue-300";
    case "ended": return "bg-gray-100 text-gray-600 border-gray-300";
    case "cancelled": return "bg-red-100 text-red-700 border-red-300";
    default: return "";
  }
}

export default function AdminSessions() {
  const utils = trpc.useUtils();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEnrollmentDialogOpen, setIsEnrollmentDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [formData, setFormData] = useState<SessionFormData>(defaultFormData);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [dateFilter, setDateFilter] = useState<'all' | 'upcoming' | 'past' | 'today' | 'custom'>('all');

  // === Live Sessions state ===
  const [isLiveDialogOpen, setIsLiveDialogOpen] = useState(false);
  const [editingLiveSession, setEditingLiveSession] = useState<any>(null);
  const [liveFormData, setLiveFormData] = useState<LiveSessionFormData>(defaultLiveFormData);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Queries
  const { data: sessions, isLoading } = trpc.sessions.list.useQuery();
  const { data: sessionDetails } = trpc.sessions.getById.useQuery(
    { id: selectedSession! },
    { enabled: !!selectedSession }
  );
  const { data: allUsers } = trpc.admin.users.list.useQuery();

  // Mutations
  const createMutation = trpc.sessions.create.useMutation({
    onSuccess: () => {
      toast.success("Session created successfully");
      setIsCreateDialogOpen(false);
      setFormData(defaultFormData);
      utils.sessions.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.sessions.update.useMutation({
    onSuccess: () => {
      toast.success("Session updated successfully");
      setIsEditDialogOpen(false);
      setSelectedSession(null);
      utils.sessions.list.invalidate();
      utils.sessions.getById.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.sessions.delete.useMutation({
    onSuccess: () => {
      toast.success("Session deleted successfully");
      utils.sessions.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateStatusMutation = trpc.sessions.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Session status updated");
      utils.sessions.list.invalidate();
      utils.sessions.getById.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const addUsersMutation = trpc.sessions.addUsers.useMutation({
    onSuccess: () => {
      toast.success("Users added to session");
      setSelectedUsers([]);
      utils.sessions.getById.invalidate();
      utils.sessions.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const removeUsersMutation = trpc.sessions.removeUsers.useMutation({
    onSuccess: () => {
      toast.success("Users removed from session");
      setSelectedUsers([]);
      utils.sessions.getById.invalidate();
      utils.sessions.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // === Live Sessions queries & mutations ===
  const { data: liveSessions, isLoading: isLiveLoading } = trpc.liveSessions.adminList.useQuery();

  const createLiveMutation = trpc.liveSessions.create.useMutation({
    onSuccess: () => {
      toast.success("Live session created");
      setIsLiveDialogOpen(false);
      setLiveFormData(defaultLiveFormData);
      utils.liveSessions.adminList.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateLiveMutation = trpc.liveSessions.update.useMutation({
    onSuccess: () => {
      toast.success("Live session updated");
      setIsLiveDialogOpen(false);
      setEditingLiveSession(null);
      setLiveFormData(defaultLiveFormData);
      utils.liveSessions.adminList.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteLiveMutation = trpc.liveSessions.delete.useMutation({
    onSuccess: () => {
      toast.success("Live session deleted");
      utils.liveSessions.adminList.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const createZoomMutation = trpc.liveSessions.createZoom.useMutation({
    onSuccess: (data) => {
      toast.success(`Zoom meeting created — Meeting ID: ${data.meetingNumber}`);
      utils.liveSessions.adminList.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // === Live Sessions handlers ===
  const openCreateLiveDialog = () => {
    setEditingLiveSession(null);
    setLiveFormData(defaultLiveFormData);
    setIsLiveDialogOpen(true);
  };

  const openEditLiveDialog = (session: any) => {
    setEditingLiveSession(session);
    setLiveFormData({
      title: session.title,
      description: session.description || "",
      startTime: formatDateTimeLocal(session.startTime),
      endTime: formatDateTimeLocal(session.endTime),
      isFree: session.isFree,
      price: session.price || "",
      capacity: session.capacity ?? 100,
    });
    setIsLiveDialogOpen(true);
  };

  const handleLiveSubmit = () => {
    if (!liveFormData.title || !liveFormData.startTime || !liveFormData.endTime) {
      toast.error("Title, start time, and end time are required");
      return;
    }
    const payload = {
      title: liveFormData.title,
      description: liveFormData.description || undefined,
      startTime: liveFormData.startTime,
      endTime: liveFormData.endTime,
      isFree: liveFormData.isFree,
      price: liveFormData.isFree ? undefined : liveFormData.price || undefined,
      capacity: Number(liveFormData.capacity),
    };
    if (editingLiveSession) {
      updateLiveMutation.mutate({ id: editingLiveSession.id, ...payload });
    } else {
      createLiveMutation.mutate(payload);
    }
  };

  const handleDeleteLive = (id: number) => {
    if (confirm("Are you sure you want to delete this live session? This cannot be undone.")) {
      deleteLiveMutation.mutate({ id });
    }
  };

  const handleCreateZoom = (sessionId: number) => {
    createZoomMutation.mutate({ sessionId });
  };

  const isLivePending = createLiveMutation.isPending || updateLiveMutation.isPending;

  const handleCreate = () => {
    const startTime = new Date(formData.startTime);
    const endTime = new Date(formData.endTime);

    createMutation.mutate({
      ...formData,
      startTime,
      endTime,
      capacity: Number(formData.capacity),
    });
  };

  const handleUpdate = () => {
    if (!selectedSession) return;

    const updates: any = {
      id: selectedSession,
      ...formData,
    };

    if (formData.startTime) {
      updates.startTime = new Date(formData.startTime);
    }
    if (formData.endTime) {
      updates.endTime = new Date(formData.endTime);
    }
    if (formData.capacity) {
      updates.capacity = Number(formData.capacity);
    }

    updateMutation.mutate(updates);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this session? This action cannot be undone.")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleToggleStatus = (id: number, currentStatus: SessionStatus) => {
    const newStatus = currentStatus === "draft" ? "published" : "draft";
    updateStatusMutation.mutate({ id, status: newStatus });
  };

  const handleEditClick = (session: any) => {
    setSelectedSession(session.id);
    // Convert UTC time to local time for datetime-local input
    const formatDateTimeLocal = (dateString: string) => {
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    setFormData({
      title: session.title,
      description: session.description || "",
      startTime: formatDateTimeLocal(session.startTime),
      endTime: formatDateTimeLocal(session.endTime),
      eventType: session.eventType,
      location: session.location || "",
      sessionLink: session.sessionLink || "",
      isFree: session.isFree,
      price: session.price || "",
      sessionType: session.sessionType,
      capacity: session.capacity,
      status: session.status,
    });
    setIsEditDialogOpen(true);
  };

  const handleEnrollmentClick = (sessionId: number) => {
    setSelectedSession(sessionId);
    setIsEnrollmentDialogOpen(true);
    setSelectedUsers([]);
  };

  const handleAddUsers = () => {
    if (selectedUsers.length === 0) {
      toast.error("Please select at least one user");
      return;
    }
    addUsersMutation.mutate({
      sessionId: selectedSession!,
      userIds: selectedUsers,
    });
  };

  const handleRemoveUsers = () => {
    if (selectedUsers.length === 0) {
      toast.error("Please select at least one user to remove");
      return;
    }
    if (confirm(`Remove ${selectedUsers.length} user(s) from this session?`)) {
      removeUsersMutation.mutate({
        sessionId: selectedSession!,
        userIds: selectedUsers,
      });
    }
  };

  const toggleUserSelection = (userId: number) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getAvailableUsers = () => {
    if (!allUsers || !sessionDetails) return [];
    const enrolledIds = sessionDetails.enrollments.map((e: any) => e.userId);
    return allUsers.filter((user: any) => !enrolledIds.includes(user.id));
  };

  // Merge regular sessions + live sessions into one unified list, sorted by date
  const allUnifiedSessions = useMemo(() => {
    const regular = (sessions || []).map((s: any) => ({ ...s, _type: 'regular' as const }));
    const live = (liveSessions || []).map((s: any) => ({
      ...s,
      _type: 'live' as const,
      eventType: 'online',
      sessionType: 'group',
      enrollmentCount: 0,
      status: s.status === 'scheduled' ? 'published' : s.status,
    }));
    return [...regular, ...live].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }, [sessions, liveSessions]);

  // Filter unified sessions by date
  const filteredSessions = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return allUnifiedSessions.filter((session: any) => {
      const sessionDate = new Date(session.startTime);

      switch (dateFilter) {
        case 'today':
          return sessionDate >= today && sessionDate < tomorrow;
        case 'upcoming':
          return sessionDate >= now;
        case 'past':
          return sessionDate < now;
        case 'custom':
          if (!customStartDate && !customEndDate) return true;
          const start = customStartDate ? new Date(customStartDate) : new Date(0);
          const end = customEndDate ? new Date(customEndDate) : new Date(9999, 11, 31);
          end.setHours(23, 59, 59, 999);
          return sessionDate >= start && sessionDate <= end;
        case 'all':
        default:
          return true;
      }
    });
  }, [allUnifiedSessions, dateFilter, customStartDate, customEndDate]);

  return (
    <AdminLayout>
      <div className="space-y-6">
      {/* Header with two create buttons */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Sessions</h1>
          <p className="text-muted-foreground mt-1">
            Manage all sessions and enrollments in one place
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openCreateLiveDialog}>
            <Video className="h-4 w-4 mr-2" />
            New Live Session
          </Button>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Session
          </Button>
        </div>
      </div>

      {/* Date Filter Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Filter by date:</Label>
              <Select value={dateFilter} onValueChange={(value: any) => setDateFilter(value)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sessions</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="past">Past</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateFilter === 'custom' && (
              <>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">From:</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-[150px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">To:</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-[150px]"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Unified Session List */}
      {(isLoading || isLiveLoading) ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground">Loading sessions...</p>
        </div>
      ) : (
      <div className="grid gap-4">
        {filteredSessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No sessions found matching the selected filter.</p>
            </CardContent>
          </Card>
        ) : (
          filteredSessions.map((session: any) => (
          <Card key={`${session._type}-${session.id}`}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <CardTitle>{session.title}</CardTitle>
                    {/* Status badge */}
                    {session._type === 'live' ? (
                      <Badge className={statusBadgeClass(session.status === 'published' ? 'scheduled' : session.status)}>
                        {session.status === 'published' ? 'scheduled' : session.status}
                      </Badge>
                    ) : (
                      <Badge variant={session.status === "published" ? "default" : "secondary"}>
                        {session.status}
                      </Badge>
                    )}
                    {/* Type badges */}
                    {session._type === 'live' ? (
                      <Badge variant="outline" className="border-green-400 text-green-700">
                        <Video className="h-3 w-3 mr-1" /> Live Zoom
                      </Badge>
                    ) : (
                      <>
                        <Badge variant="outline">
                          {session.eventType === "online" ? (
                            <><LinkIcon className="h-3 w-3 mr-1" /> Online</>
                          ) : (
                            <><MapPin className="h-3 w-3 mr-1" /> In-person</>
                          )}
                        </Badge>
                        <Badge variant="outline">
                          {session.sessionType === "group" ? "Group" : "Private"}
                        </Badge>
                      </>
                    )}
                  </div>
                  <CardDescription>
                    {session.description || "No description"}
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {/* Zoom buttons for live sessions */}
                  {session._type === 'live' && !session.zoomMeetingId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCreateZoom(session.id)}
                      disabled={createZoomMutation.isPending}
                    >
                      <Video className="h-4 w-4 mr-1" />
                      Create Zoom
                    </Button>
                  )}
                  {session._type === 'live' && session.zoomMeetingId && (
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`https://zoom.us/j/${session.zoomMeetingId.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Join as Host
                      </a>
                    </Button>
                  )}
                  {/* Publish/Unpublish for regular sessions */}
                  {session._type === 'regular' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(session.id, session.status)}
                    >
                      {session.status === "published" ? (
                        <><EyeOff className="h-4 w-4 mr-1" /> Unpublish</>
                      ) : (
                        <><Eye className="h-4 w-4 mr-1" /> Publish</>
                      )}
                    </Button>
                  )}
                  {/* Edit */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => session._type === 'live' ? openEditLiveDialog(session) : handleEditClick(session)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => session._type === 'live' ? handleDeleteLive(session.id) : handleDelete(session.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {new Date(session.startTime).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {session._type === 'live'
                      ? `Capacity: ${session.capacity}`
                      : `${session.enrollmentCount} / ${session.capacity} enrolled`}
                  </span>
                </div>
                {session.eventType === "in-person" && session.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{session.location}</span>
                  </div>
                )}
                {/* Zoom ID - clickable link */}
                {session._type === 'live' && session.zoomMeetingId && (
                  <a
                    href={`https://zoom.us/j/${session.zoomMeetingId.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                  >
                    <Video className="h-4 w-4" />
                    Zoom: {session.zoomMeetingId}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {session.isFree ? (
                  <Badge variant="secondary">Free</Badge>
                ) : (
                  <Badge variant="default">{session.price}</Badge>
                )}
              </div>
              {/* Enrollment management for regular sessions */}
              {session._type === 'regular' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEnrollmentClick(session.id)}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Manage Enrollments ({session.enrollmentCount})
                </Button>
              )}
            </CardContent>
          </Card>
        )))
        }
      </div>
      )}

      {/* Create Session Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Session</DialogTitle>
            <DialogDescription>
              Fill in the session details. Online sessions require a link before publishing.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="location">Location</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., High Heels Dance Workshop"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this session is about..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Time *</Label>
                  <Input
                    id="startTime"
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">End Time *</Label>
                  <Input
                    id="endTime"
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sessionType">Session Type *</Label>
                  <Select
                    value={formData.sessionType}
                    onValueChange={(value: SessionType) => setFormData({ ...formData, sessionType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="group">Group</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity *</Label>
                  <Input
                    id="capacity"
                    type="number"
                    min="1"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: SessionStatus) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft (not visible to users)</SelectItem>
                    <SelectItem value="published">Published (visible and bookable)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="location" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="eventType">Session Type *</Label>
                <Select
                  value={formData.eventType}
                  onValueChange={(value: EventType) => setFormData({ ...formData, eventType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="in-person">In-person</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.eventType === "online" ? (
                <div className="space-y-2">
                  <Label htmlFor="sessionLink">Zoom Meeting ID (Optional)</Label>
                  <Input
                    id="sessionLink"
                    type="text"
                    value={formData.sessionLink}
                    onChange={(e) => setFormData({ ...formData, sessionLink: e.target.value })}
                    placeholder="123-456-7890 or 1234567890"
                  />
                  <p className="text-sm text-muted-foreground">
                    Enter the numeric Zoom meeting ID (not the URL). Users will join via embedded Zoom SDK.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="location">Address *</Label>
                  <AddressAutocomplete
                    id="location"
                    value={formData.location}
                    onChange={(value) => setFormData({ ...formData, location: value })}
                    placeholder="Search for address..."
                  />
                  <p className="text-sm text-muted-foreground">
                    Required before publishing. Start typing to search.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="pricing" className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isFree"
                  checked={formData.isFree}
                  onCheckedChange={(checked) => setFormData({ ...formData, isFree: checked as boolean })}
                />
                <Label htmlFor="isFree">This session is free</Label>
              </div>

              {!formData.isFree && (
                <div className="space-y-2">
                  <Label htmlFor="price">Price</Label>
                  <Input
                    id="price"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="e.g., $50"
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog - Similar structure to Create */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
            <DialogDescription>
              Update session details. Changes are saved immediately.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="location">Location</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title *</Label>
                <Input
                  id="edit-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-startTime">Start Time *</Label>
                  <Input
                    id="edit-startTime"
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-endTime">End Time *</Label>
                  <Input
                    id="edit-endTime"
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-sessionType">Session Type *</Label>
                  <Select
                    value={formData.sessionType}
                    onValueChange={(value: SessionType) => setFormData({ ...formData, sessionType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="group">Group</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-capacity">Capacity *</Label>
                  <Input
                    id="edit-capacity"
                    type="number"
                    min="1"
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="location" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-eventType">Session Type *</Label>
                <Select
                  value={formData.eventType}
                  onValueChange={(value: EventType) => setFormData({ ...formData, eventType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="in-person">In-person</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.eventType === "online" ? (
                <div className="space-y-2">
                  <Label htmlFor="edit-sessionLink">Zoom Meeting ID</Label>
                  <Input
                    id="edit-sessionLink"
                    type="text"
                    value={formData.sessionLink}
                    onChange={(e) => setFormData({ ...formData, sessionLink: e.target.value })}
                    placeholder="123-456-7890 or 1234567890"
                  />
                  <p className="text-sm text-muted-foreground">
                    Numeric Zoom meeting ID. Users will join via embedded Zoom SDK.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="edit-location">Address *</Label>
                  <AddressAutocomplete
                    id="edit-location"
                    value={formData.location}
                    onChange={(value) => setFormData({ ...formData, location: value })}
                    placeholder="Search for address..."
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="pricing" className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-isFree"
                  checked={formData.isFree}
                  onCheckedChange={(checked) => setFormData({ ...formData, isFree: checked as boolean })}
                />
                <Label htmlFor="edit-isFree">This session is free</Label>
              </div>

              {!formData.isFree && (
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Price</Label>
                  <Input
                    id="edit-price"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enrollment Management Dialog */}
      <Dialog open={isEnrollmentDialogOpen} onOpenChange={setIsEnrollmentDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Enrollments</DialogTitle>
            <DialogDescription>
              Add or remove users from this session
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="enrolled" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="enrolled">
                Enrolled Users ({sessionDetails?.enrollments.length || 0})
              </TabsTrigger>
              <TabsTrigger value="available">
                Available Users ({getAvailableUsers().length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="enrolled" className="space-y-4">
              {sessionDetails?.enrollments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No users enrolled yet
                </p>
              ) : (
                <>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {sessionDetails?.enrollments.map((enrollment: any) => (
                      <div
                        key={enrollment.userId}
                        className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedUsers.includes(enrollment.userId)}
                          onCheckedChange={() => toggleUserSelection(enrollment.userId)}
                        />
                        <div className="flex-1">
                          <p className="font-medium">{enrollment.user.name}</p>
                          <p className="text-sm text-muted-foreground">{enrollment.user.email}</p>
                        </div>
                        <Badge variant="outline">
                          {new Date(enrollment.bookedAt).toLocaleDateString()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={handleRemoveUsers}
                      disabled={selectedUsers.length === 0 || removeUsersMutation.isPending}
                    >
                      <UserMinus className="h-4 w-4 mr-2" />
                      Remove Selected ({selectedUsers.length})
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="available" className="space-y-4">
              {getAvailableUsers().length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  All users are already enrolled
                </p>
              ) : (
                <>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {getAvailableUsers().map((user: any) => (
                      <div
                        key={user.id}
                        className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedUsers.includes(user.id)}
                          onCheckedChange={() => toggleUserSelection(user.id)}
                        />
                        <div className="flex-1">
                          <p className="font-medium">{user.name}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleAddUsers}
                      disabled={selectedUsers.length === 0 || addUsersMutation.isPending}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Selected ({selectedUsers.length})
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsEnrollmentDialogOpen(false);
              setSelectedUsers([]);
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Live Session Create / Edit Dialog */}
      <Dialog open={isLiveDialogOpen} onOpenChange={(open) => {
        setIsLiveDialogOpen(open);
        if (!open) {
          setEditingLiveSession(null);
          setLiveFormData(defaultLiveFormData);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLiveSession ? "Edit Live Session" : "Create Live Session"}</DialogTitle>
            <DialogDescription>
              {editingLiveSession
                ? "Update the session details below."
                : "Fill in the details to schedule a new live Zoom session."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ls-title">Title *</Label>
              <Input
                id="ls-title"
                value={liveFormData.title}
                onChange={(e) => setLiveFormData({ ...liveFormData, title: e.target.value })}
                placeholder="e.g., High Heels Masterclass"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ls-description">Description</Label>
              <Textarea
                id="ls-description"
                value={liveFormData.description}
                onChange={(e) => setLiveFormData({ ...liveFormData, description: e.target.value })}
                placeholder="Describe this live session..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ls-startTime">Start Date & Time *</Label>
                <Input
                  id="ls-startTime"
                  type="datetime-local"
                  value={liveFormData.startTime}
                  onChange={(e) => setLiveFormData({ ...liveFormData, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ls-endTime">End Date & Time *</Label>
                <Input
                  id="ls-endTime"
                  type="datetime-local"
                  value={liveFormData.endTime}
                  onChange={(e) => setLiveFormData({ ...liveFormData, endTime: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="ls-isFree" className="font-medium">Free session</Label>
                <p className="text-sm text-muted-foreground">Anyone can join for free</p>
              </div>
              <Switch
                id="ls-isFree"
                checked={liveFormData.isFree}
                onCheckedChange={(checked) => setLiveFormData({ ...liveFormData, isFree: checked })}
              />
            </div>

            {!liveFormData.isFree && (
              <div className="space-y-2">
                <Label htmlFor="ls-price">Price</Label>
                <Input
                  id="ls-price"
                  value={liveFormData.price}
                  onChange={(e) => setLiveFormData({ ...liveFormData, price: e.target.value })}
                  placeholder="e.g., €25"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ls-capacity">Capacity</Label>
              <Input
                id="ls-capacity"
                type="number"
                min={1}
                value={liveFormData.capacity}
                onChange={(e) =>
                  setLiveFormData({ ...liveFormData, capacity: parseInt(e.target.value) || 1 })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsLiveDialogOpen(false);
                setEditingLiveSession(null);
                setLiveFormData(defaultLiveFormData);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleLiveSubmit} disabled={isLivePending}>
              {isLivePending
                ? editingLiveSession ? "Saving..." : "Creating..."
                : editingLiveSession ? "Save Changes" : "Create Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </AdminLayout>
  );
}
