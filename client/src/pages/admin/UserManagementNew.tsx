import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { AdminLayout } from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Trash2, Plus, X, AlertTriangle, Mail } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { MessageComposeModal } from "@/components/MessageComposeModal";

// User Row Component with expansion
function UserRow({
  user,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onDelete,
  onMessage,
  onAssignCourse,
  onRemoveCourse,
  allCourses,
}: any) {
  const { data: userCourses, isLoading: coursesLoading } = trpc.admin.courseAssignment.getUserCourses.useQuery(
    { userId: user.id },
    { enabled: isExpanded }
  );

  const availableCourses = useMemo(() => {
    if (!userCourses || !allCourses) return allCourses;
    const enrolledIds = new Set(userCourses.map((uc: any) => uc.course.id));
    return allCourses.filter((c: any) => !enrolledIds.has(c.id));
  }, [userCourses, allCourses]);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-accent/50">
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(user.id)}
          />
        </TableCell>
        <TableCell onClick={() => onToggleExpand(user.id)}>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
              {user.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="font-medium">{user.name}</span>
          </div>
        </TableCell>
        <TableCell onClick={() => onToggleExpand(user.id)}>{user.email}</TableCell>
        <TableCell onClick={() => onToggleExpand(user.id)}>
          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
            {user.role}
          </Badge>
        </TableCell>
        <TableCell onClick={() => onToggleExpand(user.id)}>
          <Badge variant={user.membershipStatus === 'free' ? 'outline' : user.membershipStatus === 'monthly' ? 'secondary' : 'default'}>
            {user.membershipStatus || 'free'}
          </Badge>
        </TableCell>
        <TableCell onClick={() => onToggleExpand(user.id)}>
          {user.membershipStartDate ? new Date(user.membershipStartDate).toLocaleDateString() : '-'}
        </TableCell>
        <TableCell onClick={() => onToggleExpand(user.id)}>
          {user.membershipEndDate ? new Date(user.membershipEndDate).toLocaleDateString() : '-'}
        </TableCell>
        <TableCell onClick={() => onToggleExpand(user.id)}>
          <Badge variant="outline">{user.courseCount || 0}</Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleExpand(user.id)}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMessage(user.id, user.name, user.email)}
              title="Send message"
            >
              <Mail className="w-4 h-4 text-primary" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(user.id)}
            >
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={9} className="bg-accent/20">
            <div className="p-4 space-y-4">
              <div className="font-medium">Enrolled Courses:</div>
              
              {coursesLoading && <div className="text-sm text-muted-foreground">Loading courses...</div>}
              
              {!coursesLoading && userCourses && userCourses.length === 0 && (
                <div className="text-sm text-muted-foreground">No courses assigned yet</div>
              )}
              
              {!coursesLoading && userCourses && userCourses.length > 0 && (
                <div className="space-y-2">
                  {userCourses.map((uc: any) => (
                    <div key={uc.course.id} className="flex items-center justify-between p-3 bg-background border rounded-lg">
                      <div>
                        <div className="font-medium">{uc.course.title}</div>
                        <div className="text-sm text-muted-foreground">
                          Enrolled {new Date(uc.enrolledAt).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRemoveCourse(user.id, uc.course.id, uc.course.title)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {availableCourses.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select onValueChange={(courseId) => onAssignCourse(user.id, Number(courseId))}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="+ Assign Course" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCourses.map((course: any) => (
                        <SelectItem key={course.id} value={course.id.toString()}>
                          {course.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function UserManagementNew() {
  const { user: currentUser, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  // Mark all new users as viewed when admin opens this page
  const markAllViewedMutation = trpc.admin.users.markAllUsersViewed.useMutation({
    onSuccess: () => {
      console.log('[UserManagementNew] All users marked as viewed successfully');
      // Invalidate queries to update the badge
      utils.admin.users.newUserCount.invalidate();
    },
    onError: (error) => {
      console.error('[UserManagementNew] Error marking users as viewed:', error);
    },
  });

  useEffect(() => {
    console.log('[UserManagementNew] Component mounted, calling markAllUsersViewed mutation');
    markAllViewedMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [courseFilter, setCourseFilter] = useState<number | undefined>();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBulkAssignDialog, setShowBulkAssignDialog] = useState(false);
  const [showBulkRemoveDialog, setShowBulkRemoveDialog] = useState(false);
  const [showRemoveCourseDialog, setShowRemoveCourseDialog] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: number; name: string; courseCount: number } | null>(null);
  const [courseToRemove, setCourseToRemove] = useState<{ userId: number; courseId: number; courseName: string } | null>(null);
  const [messageRecipient, setMessageRecipient] = useState<{ id: number; name: string; email: string } | null>(null);
  
  // Form states
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  const [bulkAssignCourses, setBulkAssignCourses] = useState<number[]>([]);
  const [bulkRemoveCourses, setBulkRemoveCourses] = useState<number[]>([]);

  // Queries
  const { data: usersData, isLoading } = trpc.admin.users.listPaginated.useQuery({
    page,
    limit: 20,
    search: search || undefined,
    roleFilter,
    courseFilter,
  });

  const { data: allCourses = [] } = trpc.admin.courses.list.useQuery();

  // Mutations
  const createUserMutation = trpc.admin.users.create.useMutation({
    onSuccess: () => {
      utils.admin.users.listPaginated.invalidate();
      setShowCreateDialog(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserRole("user");
      toast.success("User created successfully");
    },
    onError: (error) => {
      toast.error("Error creating user", { description: error.message });
    },
  });

  const deleteUserMutation = trpc.admin.users.delete.useMutation({
    onSuccess: (data) => {
      utils.admin.users.listPaginated.invalidate();
      setShowDeleteDialog(false);
      setUserToDelete(null);
      const message = data.hadActiveCourses
        ? "User deleted (had active courses)"
        : "User deleted successfully";
      toast.success(message);
    },
    onError: (error) => {
      toast.error("Error deleting user", { description: error.message });
    },
  });

  const assignCourseMutation = trpc.admin.courseAssignment.assign.useMutation({
    onSuccess: (_, variables) => {
      utils.admin.courseAssignment.getUserCourses.invalidate({ userId: variables.userId });
      utils.admin.users.listPaginated.invalidate();
      toast.success("Course assigned successfully");
    },
    onError: (error) => {
      toast.error("Error assigning course", { description: error.message });
    },
  });

  const removeCourseMutation = trpc.admin.courseAssignment.remove.useMutation({
    onSuccess: (_, variables) => {
      utils.admin.courseAssignment.getUserCourses.invalidate({ userId: variables.userId });
      utils.admin.users.listPaginated.invalidate();
      setShowRemoveCourseDialog(false);
      setCourseToRemove(null);
      toast.success("Course removed successfully");
    },
    onError: (error) => {
      toast.error("Error removing course", { description: error.message });
    },
  });

  const bulkAssignMutation = trpc.admin.courseAssignment.bulkAssign.useMutation({
    onSuccess: (data) => {
      utils.admin.users.listPaginated.invalidate();
      setShowBulkAssignDialog(false);
      setBulkAssignCourses([]);
      setSelectedUsers(new Set());
      toast.success(`${data.created} enrollments created${data.skipped > 0 ? ` (${data.skipped} skipped)` : ""}`);
    },
    onError: (error) => {
      toast.error("Error assigning courses", { description: error.message });
    },
  });

  const bulkRemoveMutation = trpc.admin.courseAssignment.bulkRemove.useMutation({
    onSuccess: (data) => {
      utils.admin.users.listPaginated.invalidate();
      setShowBulkRemoveDialog(false);
      setBulkRemoveCourses([]);
      setSelectedUsers(new Set());
      toast.success(`${data.removed} enrollments removed`);
    },
    onError: (error) => {
      toast.error("Error removing courses", { description: error.message });
    },
  });

  // Handlers
  const handleCreateUser = () => {
    if (!newUserName.trim() || !newUserEmail.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    createUserMutation.mutate({ name: newUserName, email: newUserEmail, role: newUserRole });
  };

  const handleDeleteUser = (userId: number, userName: string, courseCount: number) => {
    setUserToDelete({ id: userId, name: userName, courseCount });
    setShowDeleteDialog(true);
  };

  const confirmDeleteUser = () => {
    if (userToDelete) {
      deleteUserMutation.mutate({ userId: userToDelete.id });
    }
  };

  const handleMessage = (userId: number, userName: string, userEmail: string) => {
    setMessageRecipient({ id: userId, name: userName, email: userEmail });
    setShowMessageDialog(true);
  };

  const handleAssignCourse = (userId: number, courseId: number) => {
    assignCourseMutation.mutate({ userId, courseId });
  };

  const handleRemoveCourse = (userId: number, courseId: number, courseName: string) => {
    setCourseToRemove({ userId, courseId, courseName });
    setShowRemoveCourseDialog(true);
  };

  const confirmRemoveCourse = () => {
    if (courseToRemove) {
      removeCourseMutation.mutate({
        userId: courseToRemove.userId,
        courseId: courseToRemove.courseId,
      });
    }
  };

  const handleBulkAssign = () => {
    if (bulkAssignCourses.length === 0) {
      toast.error("Please select at least one course");
      return;
    }
    bulkAssignMutation.mutate({
      userIds: Array.from(selectedUsers),
      courseIds: bulkAssignCourses,
    });
  };

  const handleBulkRemove = () => {
    if (bulkRemoveCourses.length === 0) {
      toast.error("Please select at least one course");
      return;
    }
    bulkRemoveMutation.mutate({
      userIds: Array.from(selectedUsers),
      courseIds: bulkRemoveCourses,
    });
  };

  const toggleRowExpansion = (userId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedRows(newExpanded);
  };

  const toggleUserSelection = (userId: number) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const toggleAllUsers = () => {
    if (selectedUsers.size === usersData?.users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(usersData?.users.map((u: any) => u.id) || []));
    }
  };

  const selectedUsersList = useMemo(() => {
    if (!usersData) return [];
    return usersData.users.filter((u: any) => selectedUsers.has(u.id));
  }, [usersData, selectedUsers]);

  if (!isAuthenticated || currentUser?.role !== 'admin') {
    return (
      <AdminLayout>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">Access denied</p>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">User Management</h1>
            <p className="text-muted-foreground mt-2">Manage users and course assignments</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <Select value={roleFilter} onValueChange={(v: any) => setRoleFilter(v)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
              <Select value={courseFilter?.toString() || "all"} onValueChange={(v) => setCourseFilter(v === "all" ? undefined : Number(v))}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courses</SelectItem>
                  {allCourses.map((course) => (
                    <SelectItem key={course.id} value={course.id.toString()}>
                      {course.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions Bar */}
        {selectedUsers.size > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-medium">{selectedUsers.size} users selected</span>
                  <Button variant="outline" size="sm" onClick={() => setShowBulkAssignDialog(true)}>
                    Assign Courses
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowBulkRemoveDialog(true)}>
                    Remove Courses
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedUsers(new Set())}>
                  <X className="w-4 h-4 mr-1" />
                  Clear Selection
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading && <div className="text-center py-8 text-muted-foreground">Loading users...</div>}

            {!isLoading && usersData && (
              <>
                <div className="p-4 border-b text-sm text-muted-foreground">
                  Showing {usersData.users.length} of {usersData.total} users
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedUsers.size === usersData.users.length && usersData.users.length > 0}
                          onCheckedChange={toggleAllUsers}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Membership</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Courses</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersData.users.map((user: any) => (
                      <UserRow
                        key={user.id}
                        user={user}
                        isExpanded={expandedRows.has(user.id)}
                        isSelected={selectedUsers.has(user.id)}
                        onToggleExpand={toggleRowExpansion}
                        onToggleSelect={toggleUserSelection}
                        onDelete={() => handleDeleteUser(user.id, user.name, user.courseCount || 0)}
                        onMessage={handleMessage}
                        onAssignCourse={handleAssignCourse}
                        onRemoveCourse={handleRemoveCourse}
                        allCourses={allCourses}
                      />
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {usersData.pages > 1 && (
                  <div className="p-4 border-t flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page} of {usersData.pages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === usersData.pages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Create User Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new user to the system</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Enter user name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="Enter email address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newUserRole} onValueChange={(v: any) => setNewUserRole(v)}>
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete User Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this user?
              </DialogDescription>
            </DialogHeader>
            {userToDelete && (
              <div className="py-4">
                <p className="font-medium mb-2">User: {userToDelete.name}</p>
                {userToDelete.courseCount > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-destructive">Warning</p>
                      <p className="text-muted-foreground">
                        This user has {userToDelete.courseCount} active course enrollment(s).
                        All enrollments will be removed.
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-4">
                  This action cannot be undone.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteUser}
                disabled={deleteUserMutation.isPending}
              >
                {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Remove Course Dialog */}
        <Dialog open={showRemoveCourseDialog} onOpenChange={setShowRemoveCourseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Course</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove this course from the user?
              </DialogDescription>
            </DialogHeader>
            {courseToRemove && (
              <div className="py-4">
                <p className="text-sm">
                  <span className="font-medium">Course:</span> {courseToRemove.courseName}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRemoveCourseDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRemoveCourse}
                disabled={removeCourseMutation.isPending}
              >
                {removeCourseMutation.isPending ? "Removing..." : "Remove Course"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Assign Dialog */}
        <Dialog open={showBulkAssignDialog} onOpenChange={setShowBulkAssignDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign Courses to Multiple Users</DialogTitle>
              <DialogDescription>
                Select courses to assign to {selectedUsers.size} selected user(s)
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Select Courses</Label>
                <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                  {allCourses.map((course: any) => (
                    <div key={course.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={bulkAssignCourses.includes(course.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setBulkAssignCourses([...bulkAssignCourses, course.id]);
                          } else {
                            setBulkAssignCourses(bulkAssignCourses.filter(id => id !== course.id));
                          }
                        }}
                      />
                      <Label className="cursor-pointer">{course.title}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Selected Users ({selectedUsersList.length})</Label>
                <div className="border rounded-lg p-4 max-h-32 overflow-y-auto">
                  <div className="text-sm text-muted-foreground">
                    {selectedUsersList.map((u: any) => u.name).join(", ")}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkAssignDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleBulkAssign} disabled={bulkAssignMutation.isPending}>
                {bulkAssignMutation.isPending ? "Assigning..." : "Assign Courses"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Remove Dialog */}
        <Dialog open={showBulkRemoveDialog} onOpenChange={setShowBulkRemoveDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Remove Courses from Multiple Users</DialogTitle>
              <DialogDescription>
                Select courses to remove from {selectedUsers.size} selected user(s)
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Select Courses</Label>
                <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                  {allCourses.map((course: any) => (
                    <div key={course.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={bulkRemoveCourses.includes(course.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setBulkRemoveCourses([...bulkRemoveCourses, course.id]);
                          } else {
                            setBulkRemoveCourses(bulkRemoveCourses.filter(id => id !== course.id));
                          }
                        }}
                      />
                      <Label className="cursor-pointer">{course.title}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Selected Users ({selectedUsersList.length})</Label>
                <div className="border rounded-lg p-4 max-h-32 overflow-y-auto">
                  <div className="text-sm text-muted-foreground">
                    {selectedUsersList.map((u: any) => u.name).join(", ")}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkRemoveDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkRemove}
                disabled={bulkRemoveMutation.isPending}
              >
                {bulkRemoveMutation.isPending ? "Removing..." : "Remove Courses"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Message Compose Modal */}
        {messageRecipient && (
          <MessageComposeModal
            open={showMessageDialog}
            onOpenChange={setShowMessageDialog}
            recipientId={messageRecipient.id}
            recipientName={messageRecipient.name}
            recipientEmail={messageRecipient.email}
          />
        )}
      </div>
    </AdminLayout>
  );
}
