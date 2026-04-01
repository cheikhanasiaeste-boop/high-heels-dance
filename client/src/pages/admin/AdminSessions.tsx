import { useState, useMemo, useCallback } from "react";
import { RRule, Weekday } from "rrule";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Calendar, Users, MapPin, Video, ExternalLink, Edit, Trash2, Eye, EyeOff, UserPlus, UserMinus, Pencil, Globe, Loader2 } from "lucide-react";

// ── Types & defaults ──────────────────────────────────────

type EventType = "online" | "in-person";

interface RecurrenceData {
  enabled: boolean;
  frequency: "weekly" | "monthly";
  weeklyDays: number[]; // 0=Mon, 1=Tue, ..., 6=Sun (RRule weekday indices)
  monthlyMode: "sameDay" | "sameWeekday";
  endMode: "count" | "date" | "never";
  endCount: number;
  endDate: string;
}

const defaultRecurrence: RecurrenceData = {
  enabled: false,
  frequency: "weekly",
  weeklyDays: [],
  monthlyMode: "sameDay",
  endMode: "count",
  endCount: 12,
  endDate: "",
};

interface SessionFormData {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  eventType: EventType;
  location: string;
  isFree: boolean;
  price: string;
  sessionType: "private" | "group";
  capacity: number;
  allowDiscountCodes: boolean;
}

const defaultForm: SessionFormData = {
  title: "",
  description: "",
  startTime: "",
  endTime: "",
  eventType: "online",
  location: "",
  isFree: true,
  price: "",
  sessionType: "group",
  capacity: 20,
  allowDiscountCodes: false,
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RRULE_WEEKDAYS = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU];

function getWeekdayIndex(date: Date): number {
  // JS getDay: 0=Sun, convert to 0=Mon
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

function getWeekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function generateRecurrenceDates(startTime: string, recurrence: RecurrenceData): Date[] {
  if (!recurrence.enabled || !startTime) return [];
  const dtstart = new Date(startTime);
  if (isNaN(dtstart.getTime())) return [];

  try {
    const ruleOpts: any = {
      dtstart,
      freq: recurrence.frequency === "weekly" ? RRule.WEEKLY : RRule.MONTHLY,
    };

    if (recurrence.frequency === "weekly") {
      const days = recurrence.weeklyDays.length > 0
        ? recurrence.weeklyDays.map(i => RRULE_WEEKDAYS[i])
        : [RRULE_WEEKDAYS[getWeekdayIndex(dtstart)]];
      ruleOpts.byweekday = days;
    } else if (recurrence.monthlyMode === "sameWeekday") {
      const weekNum = getWeekOfMonth(dtstart);
      const weekday = RRULE_WEEKDAYS[getWeekdayIndex(dtstart)];
      ruleOpts.byweekday = [weekday.nth(weekNum)];
    }
    // sameDay monthly: RRule defaults to same day-of-month, no extra config needed

    if (recurrence.endMode === "count") {
      ruleOpts.count = Math.min(recurrence.endCount, 52);
    } else if (recurrence.endMode === "date" && recurrence.endDate) {
      ruleOpts.until = new Date(recurrence.endDate);
    } else {
      // "never" — cap at 52 for safety
      ruleOpts.count = 52;
    }

    const rule = new RRule(ruleOpts);
    return rule.all();
  } catch {
    return [];
  }
}

function fmtLocal(dateString: string): string {
  const d = new Date(dateString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function statusColor(status: string): string {
  switch (status) {
    case "live": return "bg-green-500 text-white";
    case "scheduled": case "published": return "bg-blue-100 text-blue-800";
    case "ended": return "bg-gray-100 text-gray-600";
    case "cancelled": return "bg-red-100 text-red-700";
    case "draft": return "bg-stone-100 text-stone-600";
    default: return "bg-stone-100 text-stone-600";
  }
}

// ── Main component ────────────────────────────────────────

export default function AdminSessions() {
  const utils = trpc.useUtils();

  // Filters
  const [dateFilter, setDateFilter] = useState<"all" | "upcoming" | "past" | "today" | "custom">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "online" | "in-person">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [form, setForm] = useState<SessionFormData>(defaultForm);
  const [recurrence, setRecurrence] = useState<RecurrenceData>(defaultRecurrence);
  const [isCreatingZoom, setIsCreatingZoom] = useState(false);

  // Recurrence preview dates
  const recurrenceDates = useMemo(
    () => generateRecurrenceDates(form.startTime, recurrence),
    [form.startTime, recurrence]
  );

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  // Enrollment dialog
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSessionId, setEnrollSessionId] = useState<number | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);

  // Queries
  const { data: sessions, isLoading } = trpc.sessions.list.useQuery();
  const { data: liveSessions, isLoading: isLiveLoading } = trpc.liveSessions.adminList.useQuery();
  const { data: allUsers } = trpc.admin.users.list.useQuery();
  const { data: enrollDetails } = trpc.sessions.getById.useQuery(
    { id: enrollSessionId! },
    { enabled: !!enrollSessionId }
  );

  // Mutations – regular sessions
  const createMut = trpc.sessions.create.useMutation({
    onSuccess: () => { toast.success("Session created"); closeDialog(); utils.sessions.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.sessions.update.useMutation({
    onSuccess: () => { toast.success("Session updated"); closeDialog(); utils.sessions.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.sessions.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); utils.sessions.list.invalidate(); },
  });
  const statusMut = trpc.sessions.updateStatus.useMutation({
    onSuccess: () => { utils.sessions.list.invalidate(); },
  });
  const addUsersMut = trpc.sessions.addUsers.useMutation({
    onSuccess: () => { toast.success("Users added"); setSelectedUsers([]); utils.sessions.getById.invalidate(); utils.sessions.list.invalidate(); },
  });
  const removeUsersMut = trpc.sessions.removeUsers.useMutation({
    onSuccess: () => { toast.success("Users removed"); setSelectedUsers([]); utils.sessions.getById.invalidate(); utils.sessions.list.invalidate(); },
  });

  // Mutations – live sessions
  const createLiveMut = trpc.liveSessions.create.useMutation({
    onSuccess: async (data) => {
      // Auto-create Zoom for online sessions
      if (form.eventType === "online") {
        setIsCreatingZoom(true);
        try {
          await createZoomMut.mutateAsync({ sessionId: data.id });
          toast.success("Session created with Zoom meeting!");
        } catch {
          toast.success("Session created, but Zoom creation failed. You can retry from the session card.");
        }
        setIsCreatingZoom(false);
      } else {
        toast.success("In-person session created!");
      }
      closeDialog();
      utils.liveSessions.adminList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateLiveMut = trpc.liveSessions.update.useMutation({
    onSuccess: () => { toast.success("Session updated"); closeDialog(); utils.liveSessions.adminList.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteLiveMut = trpc.liveSessions.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); utils.liveSessions.adminList.invalidate(); },
  });
  const createZoomMut = trpc.liveSessions.createZoom.useMutation({
    onSuccess: () => { utils.liveSessions.adminList.invalidate(); },
  });

  // ── Dialog helpers ──
  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSession(null);
    setForm(defaultForm);
    setRecurrence(defaultRecurrence);
    setIsCreatingZoom(false);
  };

  const openCreate = () => {
    setEditingSession(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (session: any) => {
    setEditingSession(session);
    setForm({
      title: session.title,
      description: session.description || "",
      startTime: fmtLocal(session.startTime),
      endTime: fmtLocal(session.endTime),
      eventType: session._type === "live" ? "online" : (session.eventType || "online"),
      location: session.location || "",
      isFree: session.isFree,
      price: session.price || "",
      sessionType: session.sessionType || "group",
      capacity: session.capacity || 20,
      allowDiscountCodes: session.allowDiscountCodes || false,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title || !form.startTime || !form.endTime) {
      toast.error("Title, start time, and end time are required");
      return;
    }
    if (form.eventType === "in-person" && !form.location) {
      toast.error("Location is required for in-person sessions");
      return;
    }
    if (recurrence.enabled) {
      if (recurrence.frequency === "weekly" && recurrence.weeklyDays.length === 0) {
        toast.error("Select at least one day for weekly recurrence");
        return;
      }
      if (recurrence.endMode === "date" && !recurrence.endDate) {
        toast.error("Select an end date for the recurrence");
        return;
      }
      if (recurrence.endMode === "date" && new Date(recurrence.endDate) <= new Date(form.startTime)) {
        toast.error("Recurrence end date must be after start date");
        return;
      }
    }

    if (editingSession) {
      // Update existing
      if (editingSession._type === "live") {
        updateLiveMut.mutate({
          id: editingSession.id,
          title: form.title,
          description: form.description || undefined,
          startTime: form.startTime,
          endTime: form.endTime,
          isFree: form.isFree,
          price: form.isFree ? undefined : form.price || undefined,
          capacity: Number(form.capacity),
        });
      } else {
        updateMut.mutate({
          id: editingSession.id,
          title: form.title,
          description: form.description,
          startTime: new Date(form.startTime),
          endTime: new Date(form.endTime),
          eventType: form.eventType,
          location: form.eventType === "in-person" ? form.location : "",
          sessionLink: "",
          isFree: form.isFree,
          price: form.price,
          sessionType: form.sessionType,
          capacity: Number(form.capacity),
          allowDiscountCodes: form.eventType === "in-person" && !form.isFree ? form.allowDiscountCodes : false,
        });
      }
    } else if (recurrence.enabled && recurrenceDates.length > 1) {
      // Create multiple sessions from recurrence — use sessions.create (availabilitySlots) for payment support
      const startDate = new Date(form.startTime);
      const endDate = new Date(form.endTime);
      const durationMs = endDate.getTime() - startDate.getTime();

      let created = 0;
      for (const occDate of recurrenceDates) {
        const occStart = new Date(occDate);
        occStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
        const occEnd = new Date(occStart.getTime() + durationMs);

        createMut.mutate({
          title: form.title,
          description: form.description,
          startTime: occStart,
          endTime: occEnd,
          eventType: form.eventType,
          location: form.eventType === "in-person" ? form.location : "",
          isFree: form.isFree,
          price: form.isFree ? "" : form.price,
          sessionType: form.sessionType,
          capacity: Number(form.capacity),
          allowDiscountCodes: form.eventType === "in-person" && !form.isFree ? form.allowDiscountCodes : false,
        });
        created++;
      }
      toast.success(`Creating ${created} recurrent sessions...`);
    } else {
      // Create single session — use sessions.create (availabilitySlots) for payment support
      createMut.mutate({
        title: form.title,
        description: form.description,
        startTime: new Date(form.startTime),
        endTime: new Date(form.endTime),
        eventType: form.eventType,
        location: form.eventType === "in-person" ? form.location : "",
        isFree: form.isFree,
        price: form.isFree ? "" : form.price,
        sessionType: form.sessionType,
        capacity: Number(form.capacity),
        allowDiscountCodes: form.eventType === "in-person" && !form.isFree ? form.allowDiscountCodes : false,
      });
    }
  };

  const handleDelete = (session: any) => {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    if (session._type === "live") deleteLiveMut.mutate({ id: session.id });
    else deleteMut.mutate({ id: session.id });
  };

  const isPending = createMut.isPending || updateMut.isPending || createLiveMut.isPending || updateLiveMut.isPending || isCreatingZoom;

  // ── Bulk selection helpers ──
  const toggleSelect = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s: any) => `${s._type}-${s.id}`)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} session(s)? This cannot be undone.`)) return;
    setIsDeleting(true);
    for (const key of selectedIds) {
      const [type, idStr] = key.split("-");
      const id = parseInt(idStr);
      try {
        if (type === "live") await deleteLiveMut.mutateAsync({ id });
        else await deleteMut.mutateAsync({ id });
      } catch { /* continue deleting others */ }
    }
    setSelectedIds(new Set());
    setIsDeleting(false);
    utils.sessions.list.invalidate();
    utils.liveSessions.adminList.invalidate();
    toast.success(`Deleted ${selectedIds.size} session(s)`);
  };

  // ── Unified list + filters ──
  const allSessions = useMemo(() => {
    const regular = (sessions || []).map((s: any) => ({ ...s, _type: "regular" as const }));
    const live = (liveSessions || []).map((s: any) => ({
      ...s,
      _type: "live" as const,
      eventType: "online" as const,
      sessionType: "group",
      enrollmentCount: 0,
    }));
    return [...regular, ...live].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }, [sessions, liveSessions]);

  const filtered = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    return allSessions.filter((s: any) => {
      const d = new Date(s.startTime);
      // Date filter
      if (dateFilter === "today" && (d < today || d >= tomorrow)) return false;
      if (dateFilter === "upcoming" && d < now) return false;
      if (dateFilter === "past" && d >= now) return false;
      if (dateFilter === "custom") {
        if (customStart && d < new Date(customStart)) return false;
        if (customEnd) { const end = new Date(customEnd); end.setHours(23, 59, 59, 999); if (d > end) return false; }
      }
      // Type filter
      if (typeFilter === "online" && s.eventType !== "online") return false;
      if (typeFilter === "in-person" && s.eventType !== "in-person") return false;
      return true;
    });
  }, [allSessions, dateFilter, typeFilter, customStart, customEnd]);

  // ── Render ──
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Sessions</h1>
            <p className="text-muted-foreground mt-1">Create and manage all sessions</p>
          </div>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button variant="destructive" onClick={handleBulkDelete} disabled={isDeleting}>
                <Trash2 className="h-4 w-4 mr-2" />
                {isDeleting ? "Deleting..." : `Delete ${selectedIds.size}`}
              </Button>
            )}
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Session
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Select all */}
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onCheckedChange={toggleSelectAll}
                />
                <Label className="text-sm text-muted-foreground cursor-pointer" onClick={toggleSelectAll}>
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
                </Label>
              </div>
              <div className="h-5 w-px bg-border" />
              {/* Date */}
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium whitespace-nowrap">Date:</Label>
                <Select value={dateFilter} onValueChange={(v: any) => setDateFilter(v)}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="past">Past</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Type */}
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium whitespace-nowrap">Type:</Label>
                <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="in-person">In-Person</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Custom date range */}
              {dateFilter === "custom" && (
                <>
                  <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-[150px]" />
                  <span className="text-muted-foreground">to</span>
                  <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-[150px]" />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Session List */}
        {(isLoading || isLiveLoading) ? (
          <div className="flex items-center justify-center min-h-[200px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No sessions match your filters.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map((session: any) => {
              const key = `${session._type}-${session.id}`;
              return (
              <Card key={key} className={selectedIds.has(key) ? "ring-2 ring-[#C026D3]/30" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Checkbox
                        checked={selectedIds.has(key)}
                        onCheckedChange={() => toggleSelect(key)}
                        className="mt-1 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <CardTitle className="text-lg">{session.title}</CardTitle>
                        <Badge className={statusColor(session._type === "live" ? (session.status === "scheduled" ? "scheduled" : session.status) : session.status)}>
                          {session._type === "live" ? session.status : session.status}
                        </Badge>
                        <Badge variant="outline" className={session.eventType === "online" ? "border-blue-300 text-blue-700" : "border-amber-300 text-amber-700"}>
                          {session.eventType === "online" ? <><Globe className="h-3 w-3 mr-1" />Online</> : <><MapPin className="h-3 w-3 mr-1" />In-Person</>}
                        </Badge>
                        {session._type === "regular" && (
                          <Badge variant="outline">{session.sessionType === "group" ? "Group" : "Private"}</Badge>
                        )}
                      </div>
                      {session.description && <CardDescription className="line-clamp-1">{session.description}</CardDescription>}
                    </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
                      {/* Zoom buttons */}
                      {session._type === "live" && !session.zoomMeetingId && session.eventType === "online" && (
                        <Button variant="outline" size="sm" onClick={() => createZoomMut.mutate({ sessionId: session.id })} disabled={createZoomMut.isPending}>
                          <Video className="h-4 w-4 mr-1" />Zoom
                        </Button>
                      )}
                      {session._type === "live" && session.zoomMeetingId && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={`https://zoom.us/j/${session.zoomMeetingId.replace(/[^0-9]/g, "")}${session.zoomPassword ? "?pwd=" + session.zoomPassword : ""}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />Host
                          </a>
                        </Button>
                      )}
                      {session._type === "regular" && (
                        <Button variant="ghost" size="sm" onClick={() => statusMut.mutate({ id: session.id, status: session.status === "published" ? "draft" : "published" })}>
                          {session.status === "published" ? <><EyeOff className="h-4 w-4 mr-1" />Unpublish</> : <><Eye className="h-4 w-4 mr-1" />Publish</>}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openEdit(session)}>
                        <Pencil className="h-4 w-4 mr-1" />Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(session)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      {new Date(session.startTime).toLocaleString()} — {new Date(session.endTime).toLocaleTimeString()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {session._type === "live" ? `Capacity: ${session.capacity}` : `${session.enrollmentCount || 0} / ${session.capacity} enrolled`}
                    </span>
                    {session.eventType === "in-person" && session.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />{session.location}
                      </span>
                    )}
                    {session.zoomMeetingId && (
                      <a
                        href={`https://zoom.us/j/${session.zoomMeetingId.replace(/[^0-9]/g, "")}${session.zoomPassword ? "?pwd=" + session.zoomPassword : ""}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-blue-600 hover:underline"
                      >
                        <Video className="h-4 w-4" />Zoom: {session.zoomMeetingId}
                      </a>
                    )}
                    <Badge variant={session.isFree ? "secondary" : "default"}>
                      {session.isFree ? "Free" : session.price || "Paid"}
                    </Badge>
                  </div>
                  {session._type === "regular" && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { setEnrollSessionId(session.id); setEnrollOpen(true); setSelectedUsers([]); }}>
                      <Users className="h-4 w-4 mr-2" />Manage Enrollments ({session.enrollmentCount || 0})
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
            })}
          </div>
        )}

        {/* ── Create/Edit Dialog ── */}
        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSession ? "Edit Session" : "Create Session"}</DialogTitle>
              <DialogDescription>
                {editingSession ? "Update session details." : "Set up a new online or in-person session."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Online / In-Person toggle */}
              {!editingSession && (
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    onClick={() => setForm({ ...form, eventType: "online" })}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${form.eventType === "online" ? "bg-[#C026D3] text-white" : "hover:bg-muted"}`}
                  >
                    <Globe className="h-4 w-4" />Online (Zoom)
                  </button>
                  <button
                    onClick={() => setForm({ ...form, eventType: "in-person" })}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${form.eventType === "in-person" ? "bg-[#C026D3] text-white" : "hover:bg-muted"}`}
                  >
                    <MapPin className="h-4 w-4" />In-Person
                  </button>
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Beginner High Heels Workshop" />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Session details..." rows={3} />
              </div>

              {/* Start / End */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Start *</Label>
                  <Input type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>End *</Label>
                  <Input type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>

              {/* Location (in-person only) */}
              {form.eventType === "in-person" && (
                <div className="space-y-1.5">
                  <Label>Location *</Label>
                  <AddressAutocomplete
                    value={form.location}
                    onChange={(v) => setForm({ ...form, location: v })}
                    placeholder="Search for address..."
                  />
                </div>
              )}

              {/* Online info */}
              {form.eventType === "online" && !editingSession && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3">
                  <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <Video className="h-4 w-4 flex-shrink-0" />
                    A Zoom meeting will be created automatically when you save.
                  </p>
                </div>
              )}

              {/* Capacity + Session Type */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Capacity</Label>
                  <Input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.sessionType} onValueChange={(v: any) => setForm({ ...form, sessionType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="group">Group</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ── Recurrence Section ── */}
              {!editingSession && (
                <>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label className="font-medium">Recurrent Session</Label>
                      <p className="text-xs text-muted-foreground">Create multiple sessions on a schedule</p>
                    </div>
                    <Switch
                      checked={recurrence.enabled}
                      onCheckedChange={(c) => {
                        const updated = { ...recurrence, enabled: c };
                        // Auto-select the start date's weekday
                        if (c && form.startTime && updated.weeklyDays.length === 0) {
                          updated.weeklyDays = [getWeekdayIndex(new Date(form.startTime))];
                        }
                        setRecurrence(updated);
                      }}
                    />
                  </div>

                  {recurrence.enabled && (
                    <div className="space-y-4 rounded-lg border border-[#C026D3]/20 bg-[#C026D3]/[0.03] p-4">
                      {/* Frequency */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Frequency</Label>
                        <Select
                          value={recurrence.frequency}
                          onValueChange={(v: "weekly" | "monthly") => setRecurrence({ ...recurrence, frequency: v })}
                        >
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Weekly: day checkboxes */}
                      {recurrence.frequency === "weekly" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium">Repeat on</Label>
                          <div className="flex gap-1.5">
                            {WEEKDAY_LABELS.map((day, idx) => (
                              <button
                                key={day}
                                type="button"
                                onClick={() => {
                                  const days = recurrence.weeklyDays.includes(idx)
                                    ? recurrence.weeklyDays.filter(d => d !== idx)
                                    : [...recurrence.weeklyDays, idx];
                                  setRecurrence({ ...recurrence, weeklyDays: days });
                                }}
                                className={`w-10 h-10 rounded-lg text-xs font-semibold transition-colors ${
                                  recurrence.weeklyDays.includes(idx)
                                    ? "bg-[#C026D3] text-white"
                                    : "bg-muted hover:bg-muted/80"
                                }`}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Monthly: same day vs same weekday */}
                      {recurrence.frequency === "monthly" && form.startTime && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Repeat on</Label>
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="monthlyMode"
                                checked={recurrence.monthlyMode === "sameDay"}
                                onChange={() => setRecurrence({ ...recurrence, monthlyMode: "sameDay" })}
                                className="accent-[#C026D3]"
                              />
                              <span className="text-sm">
                                Same day — every {ordinal(new Date(form.startTime).getDate())}
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="monthlyMode"
                                checked={recurrence.monthlyMode === "sameWeekday"}
                                onChange={() => setRecurrence({ ...recurrence, monthlyMode: "sameWeekday" })}
                                className="accent-[#C026D3]"
                              />
                              <span className="text-sm">
                                Same weekday — every {ordinal(getWeekOfMonth(new Date(form.startTime)))} {WEEKDAY_LABELS[getWeekdayIndex(new Date(form.startTime))]}
                              </span>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* End condition */}
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Ends</Label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="endMode"
                              checked={recurrence.endMode === "count"}
                              onChange={() => setRecurrence({ ...recurrence, endMode: "count" })}
                              className="accent-[#C026D3]"
                            />
                            <span className="text-sm">After</span>
                            <Input
                              type="number"
                              min={2}
                              max={52}
                              value={recurrence.endCount}
                              onChange={(e) => setRecurrence({ ...recurrence, endCount: Math.min(52, parseInt(e.target.value) || 2) })}
                              className="w-20 h-8 text-sm"
                              disabled={recurrence.endMode !== "count"}
                            />
                            <span className="text-sm">occurrences</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="endMode"
                              checked={recurrence.endMode === "date"}
                              onChange={() => setRecurrence({ ...recurrence, endMode: "date" })}
                              className="accent-[#C026D3]"
                            />
                            <span className="text-sm">On date</span>
                            <Input
                              type="date"
                              value={recurrence.endDate}
                              onChange={(e) => setRecurrence({ ...recurrence, endDate: e.target.value })}
                              className="w-40 h-8 text-sm"
                              disabled={recurrence.endMode !== "date"}
                            />
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="endMode"
                              checked={recurrence.endMode === "never"}
                              onChange={() => setRecurrence({ ...recurrence, endMode: "never" })}
                              className="accent-[#C026D3]"
                            />
                            <span className="text-sm">Never (max 52 sessions)</span>
                          </label>
                        </div>
                      </div>

                      {/* Preview */}
                      {recurrenceDates.length > 0 && (
                        <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                          <p className="text-xs font-medium text-[#E879F9]">
                            This series will create {recurrenceDates.length} session{recurrenceDates.length !== 1 ? "s" : ""}:
                          </p>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            {recurrenceDates.slice(0, 5).map((d, i) => (
                              <p key={i}>
                                {new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                              </p>
                            ))}
                            {recurrenceDates.length > 5 && (
                              <p className="text-[#E879F9]/70">...and {recurrenceDates.length - 5} more</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Free / Paid */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="font-medium">Free session</Label>
                  <p className="text-xs text-muted-foreground">Anyone can join for free</p>
                </div>
                <Switch checked={form.isFree} onCheckedChange={(c) => setForm({ ...form, isFree: c })} />
              </div>

              {!form.isFree && (
                <div className="space-y-1.5">
                  <Label>Price</Label>
                  <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="e.g., €25" />
                </div>
              )}

              {/* Allow Discount Codes — only for paid in-person sessions */}
              {!form.isFree && form.eventType === "in-person" && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label className="font-medium">Allow Discount Codes</Label>
                    <p className="text-xs text-muted-foreground">Students can use admin-generated codes to attend for free</p>
                  </div>
                  <Switch checked={form.allowDiscountCodes} onCheckedChange={(c) => setForm({ ...form, allowDiscountCodes: c })} />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isCreatingZoom ? "Creating Zoom..." : "Saving..."}</>
                ) : (
                  editingSession ? "Save Changes" : "Create Session"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Enrollment Dialog ── */}
        <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Enrollments</DialogTitle>
              <DialogDescription>Add or remove users from this session</DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="enrolled" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="enrolled">Enrolled ({enrollDetails?.enrollments?.length || 0})</TabsTrigger>
                <TabsTrigger value="available">Available ({(allUsers?.length || 0) - (enrollDetails?.enrollments?.length || 0)})</TabsTrigger>
              </TabsList>
              <TabsContent value="enrolled" className="space-y-4">
                {!enrollDetails?.enrollments?.length ? (
                  <p className="text-center text-muted-foreground py-8">No users enrolled yet</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {enrollDetails.enrollments.map((e: any) => (
                        <div key={e.userId} className="flex items-center gap-2 p-3 border rounded-lg hover:bg-accent">
                          <Checkbox checked={selectedUsers.includes(e.userId)} onCheckedChange={() => setSelectedUsers(p => p.includes(e.userId) ? p.filter(id => id !== e.userId) : [...p, e.userId])} />
                          <div className="flex-1"><p className="font-medium">{e.user.name}</p><p className="text-sm text-muted-foreground">{e.user.email}</p></div>
                        </div>
                      ))}
                    </div>
                    <Button variant="destructive" onClick={() => { if (selectedUsers.length && enrollSessionId) removeUsersMut.mutate({ sessionId: enrollSessionId, userIds: selectedUsers }); }} disabled={!selectedUsers.length}>
                      <UserMinus className="h-4 w-4 mr-2" />Remove Selected ({selectedUsers.length})
                    </Button>
                  </>
                )}
              </TabsContent>
              <TabsContent value="available" className="space-y-4">
                {(() => {
                  const enrolledIds = new Set(enrollDetails?.enrollments?.map((e: any) => e.userId) || []);
                  const available = (allUsers || []).filter((u: any) => !enrolledIds.has(u.id));
                  return !available.length ? (
                    <p className="text-center text-muted-foreground py-8">All users enrolled</p>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {available.map((u: any) => (
                          <div key={u.id} className="flex items-center gap-2 p-3 border rounded-lg hover:bg-accent">
                            <Checkbox checked={selectedUsers.includes(u.id)} onCheckedChange={() => setSelectedUsers(p => p.includes(u.id) ? p.filter(id => id !== u.id) : [...p, u.id])} />
                            <div className="flex-1"><p className="font-medium">{u.name}</p><p className="text-sm text-muted-foreground">{u.email}</p></div>
                          </div>
                        ))}
                      </div>
                      <Button onClick={() => { if (selectedUsers.length && enrollSessionId) addUsersMut.mutate({ sessionId: enrollSessionId, userIds: selectedUsers }); }} disabled={!selectedUsers.length}>
                        <UserPlus className="h-4 w-4 mr-2" />Add Selected ({selectedUsers.length})
                      </Button>
                    </>
                  );
                })()}
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEnrollOpen(false); setSelectedUsers([]); }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
