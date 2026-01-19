import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Shield, User, Search } from "lucide-react";

export function UserManagement() {
  const utils = trpc.useUtils();
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: users, isLoading } = trpc.admin.users.list.useQuery();
  
  const markUserViewedMutation = trpc.admin.users.markUserViewed.useMutation({
    onSuccess: () => {
      // Invalidate the new user count to update the notification badge
      utils.admin.users.newUserCount.invalidate();
    },
  });
  
  // Mark all new users as viewed when the admin opens this page
  useEffect(() => {
    if (users) {
      users.forEach(user => {
        if (!user.lastViewedByAdmin) {
          markUserViewedMutation.mutate({ userId: user.id });
        }
      });
    }
  }, [users]);

  const updateRoleMutation = trpc.admin.users.updateRole.useMutation({
    onSuccess: () => {
      toast.success("User role updated successfully!");
      utils.admin.users.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update user role");
    },
  });

  const handleRoleToggle = (userId: number, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const action = newRole === 'admin' ? 'promote to admin' : 'remove admin access';
    
    if (confirm(`Are you sure you want to ${action} for this user?`)) {
      updateRoleMutation.mutate({ userId, role: newRole });
    }
  };

  const filteredUsers = users?.filter(user =>
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>Manage user accounts and admin access</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* User List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded animate-pulse"></div>
            ))}
          </div>
        ) : filteredUsers && filteredUsers.length > 0 ? (
          <div className="space-y-3">
            {filteredUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 flex items-center justify-center text-white font-semibold">
                    {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{user.name || 'Unknown'}</p>
                      {user.role === 'admin' && (
                        <Badge variant="default" className="bg-gradient-to-r from-pink-500 to-purple-500">
                          <Shield className="h-3 w-3 mr-1" />
                          Admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Joined {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant={user.role === 'admin' ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => handleRoleToggle(user.id, user.role)}
                  disabled={updateRoleMutation.isPending}
                  className={user.role === 'admin' ? '' : 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600'}
                >
                  {user.role === 'admin' ? (
                    <>
                      <User className="h-4 w-4 mr-2" />
                      Remove Admin
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      Make Admin
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm ? 'No users found matching your search' : 'No users yet'}
          </div>
        )}

        {/* Stats */}
        {users && users.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Total Users: {users.length}</span>
              <span>Admins: {users.filter(u => u.role === 'admin').length}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
