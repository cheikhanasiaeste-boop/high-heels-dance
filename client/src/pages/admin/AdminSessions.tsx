import { useState } from "react";
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
import { Plus, Calendar, Users, MapPin, Link as LinkIcon, Edit, Trash2, Eye, EyeOff, UserPlus, UserMinus } from "lucide-react";

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

export default function AdminSessions() {
  const utils = trpc.useUtils();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isEnrollmentDialogOpen, setIsEnrollmentDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [formData, setFormData] = useState<SessionFormData>(defaultFormData);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);

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
    setFormData({
      title: session.title,
      description: session.description || "",
      startTime: new Date(session.startTime).toISOString().slice(0, 16),
      endTime: new Date(session.endTime).toISOString().slice(0, 16),
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

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading sessions...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Sessions</h1>
          <p className="text-muted-foreground mt-1">
            Manage sessions and enrollments in one place
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Session
        </Button>
      </div>

      <div className="grid gap-4">
        {sessions?.map((session: any) => (
          <Card key={session.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <CardTitle>{session.title}</CardTitle>
                    <Badge variant={session.status === "published" ? "default" : "secondary"}>
                      {session.status}
                    </Badge>
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
                  </div>
                  <CardDescription>
                    {session.description || "No description"}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditClick(session)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(session.id)}
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
                    {session.enrollmentCount} / {session.capacity} enrolled
                  </span>
                </div>
                {session.eventType === "in-person" && session.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{session.location}</span>
                  </div>
                )}
                {session.isFree ? (
                  <Badge variant="secondary">Free</Badge>
                ) : (
                  <Badge variant="default">{session.price}</Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEnrollmentClick(session.id)}
              >
                <Users className="h-4 w-4 mr-2" />
                Manage Enrollments ({session.enrollmentCount})
              </Button>
            </CardContent>
          </Card>
        ))}

        {sessions?.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No sessions yet. Create your first session to get started.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

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
                  <Label htmlFor="sessionLink">Session Link *</Label>
                  <Input
                    id="sessionLink"
                    type="url"
                    value={formData.sessionLink}
                    onChange={(e) => setFormData({ ...formData, sessionLink: e.target.value })}
                    placeholder="https://zoom.us/j/..."
                  />
                  <p className="text-sm text-muted-foreground">
                    Required before publishing. Only visible to enrolled users.
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
                  <Label htmlFor="edit-sessionLink">Session Link *</Label>
                  <Input
                    id="edit-sessionLink"
                    type="url"
                    value={formData.sessionLink}
                    onChange={(e) => setFormData({ ...formData, sessionLink: e.target.value })}
                  />
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
      </div>
    </AdminLayout>
  );
}
