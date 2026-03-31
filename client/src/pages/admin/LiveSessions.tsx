import { useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Video, Trash2, Edit, ExternalLink } from "lucide-react";
import { Link } from "wouter";

interface LiveSessionFormData {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  isFree: boolean;
  price: string;
  capacity: number;
}

const defaultFormData: LiveSessionFormData = {
  title: "",
  description: "",
  startTime: "",
  endTime: "",
  isFree: true,
  price: "",
  capacity: 100,
};

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "live":
      return "default";
    case "scheduled":
      return "outline";
    case "ended":
      return "secondary";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "live":
      return "bg-green-500 text-white hover:bg-green-600";
    case "scheduled":
      return "bg-blue-100 text-blue-800 border-blue-300";
    case "ended":
      return "bg-gray-100 text-gray-600 border-gray-300";
    case "cancelled":
      return "bg-red-100 text-red-700 border-red-300";
    default:
      return "";
  }
}

function formatDateTimeLocal(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function AdminLiveSessions() {
  const utils = trpc.useUtils();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [formData, setFormData] = useState<LiveSessionFormData>(defaultFormData);

  const { data: sessions, isLoading } = trpc.liveSessions.adminList.useQuery();

  const createMutation = trpc.liveSessions.create.useMutation({
    onSuccess: () => {
      toast.success("Live session created");
      setIsDialogOpen(false);
      setFormData(defaultFormData);
      utils.liveSessions.adminList.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.liveSessions.update.useMutation({
    onSuccess: () => {
      toast.success("Live session updated");
      setIsDialogOpen(false);
      setEditingSession(null);
      setFormData(defaultFormData);
      utils.liveSessions.adminList.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.liveSessions.delete.useMutation({
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

  const openCreateDialog = () => {
    setEditingSession(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const openEditDialog = (session: any) => {
    setEditingSession(session);
    setFormData({
      title: session.title,
      description: session.description || "",
      startTime: formatDateTimeLocal(session.startTime),
      endTime: formatDateTimeLocal(session.endTime),
      isFree: session.isFree,
      price: session.price || "",
      capacity: session.capacity ?? 100,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.startTime || !formData.endTime) {
      toast.error("Title, start time, and end time are required");
      return;
    }

    if (editingSession) {
      updateMutation.mutate({
        id: editingSession.id,
        title: formData.title,
        description: formData.description || undefined,
        startTime: formData.startTime,
        endTime: formData.endTime,
        isFree: formData.isFree,
        price: formData.isFree ? undefined : formData.price || undefined,
        capacity: Number(formData.capacity),
      });
    } else {
      createMutation.mutate({
        title: formData.title,
        description: formData.description || undefined,
        startTime: formData.startTime,
        endTime: formData.endTime,
        isFree: formData.isFree,
        price: formData.isFree ? undefined : formData.price || undefined,
        capacity: Number(formData.capacity),
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this live session? This cannot be undone.")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleCreateZoom = (sessionId: number) => {
    createZoomMutation.mutate({ sessionId });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading live sessions...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Live Sessions</h1>
            <p className="text-muted-foreground mt-1">
              Manage Zoom live sessions, create meetings, and track recordings
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            New Session
          </Button>
        </div>

        {/* Session list */}
        {!sessions || sessions.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No live sessions yet. Create your first one!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session: any) => (
              <Card key={session.id}>
                <CardHeader>
                  <div className="flex justify-between items-start gap-4">
                    {/* Left: title + badges */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{session.title}</CardTitle>
                        <Badge className={statusBadgeClass(session.status)}>
                          {session.status}
                        </Badge>
                        <Badge variant="outline" className={session.isFree ? "border-emerald-400 text-emerald-700" : "border-amber-400 text-amber-700"}>
                          {session.isFree ? "Free" : session.price || "Paid"}
                        </Badge>
                      </div>
                      {session.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {session.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span>
                          Start: {new Date(session.startTime).toLocaleString()}
                        </span>
                        <span>
                          End: {new Date(session.endTime).toLocaleString()}
                        </span>
                        {session.capacity && (
                          <span>Capacity: {session.capacity}</span>
                        )}
                        {session.zoomMeetingId && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Video className="h-3.5 w-3.5" />
                            Zoom ID: {session.zoomMeetingId}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: action buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {!session.zoomMeetingId && (
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
                      {session.status === "ended" && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/admin/live-sessions/${session.id}/recordings`}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Recordings
                          </Link>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(session)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(session.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingSession(null);
            setFormData(defaultFormData);
          }
        }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSession ? "Edit Live Session" : "Create Live Session"}</DialogTitle>
              <DialogDescription>
                {editingSession
                  ? "Update the session details below."
                  : "Fill in the details to schedule a new live session."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="ls-title">Title *</Label>
                <Input
                  id="ls-title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., High Heels Masterclass"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="ls-description">Description</Label>
                <Textarea
                  id="ls-description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this live session..."
                  rows={3}
                />
              </div>

              {/* Start / End time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ls-startTime">Start Date &amp; Time *</Label>
                  <Input
                    id="ls-startTime"
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ls-endTime">End Date &amp; Time *</Label>
                  <Input
                    id="ls-endTime"
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  />
                </div>
              </div>

              {/* Free session toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="ls-isFree" className="font-medium">Free session</Label>
                  <p className="text-sm text-muted-foreground">Anyone can join for free</p>
                </div>
                <Switch
                  id="ls-isFree"
                  checked={formData.isFree}
                  onCheckedChange={(checked) => setFormData({ ...formData, isFree: checked })}
                />
              </div>

              {/* Price (shown only when not free) */}
              {!formData.isFree && (
                <div className="space-y-2">
                  <Label htmlFor="ls-price">Price</Label>
                  <Input
                    id="ls-price"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="e.g., $25"
                  />
                </div>
              )}

              {/* Capacity */}
              <div className="space-y-2">
                <Label htmlFor="ls-capacity">Capacity</Label>
                <Input
                  id="ls-capacity"
                  type="number"
                  min={1}
                  value={formData.capacity}
                  onChange={(e) =>
                    setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setEditingSession(null);
                  setFormData(defaultFormData);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending
                  ? editingSession ? "Saving..." : "Creating..."
                  : editingSession ? "Save Changes" : "Create Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
