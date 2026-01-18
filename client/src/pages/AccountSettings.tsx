import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bell, Mail, Calendar, Award, Loader2 } from "lucide-react";

export default function AccountSettings() {
  const { user } = useAuth();

  const utils = trpc.useUtils();
  
  // Fetch current preferences
  const { data: preferences, isLoading } = trpc.auth.getNotificationPreferences.useQuery(undefined, {
    enabled: !!user,
  });
  
  // Local state for toggles
  const [localPrefs, setLocalPrefs] = useState({
    emailSessionEnrollment: true,
    emailSessionReminders: true,
    emailMessages: true,
    emailCourseCompletion: true,
  });
  
  // Update local state when data loads
  useState(() => {
    if (preferences) {
      setLocalPrefs(preferences);
    }
  });
  
  // Mutation for updating preferences
  const updatePreferences = trpc.auth.updateNotificationPreferences.useMutation({
    onSuccess: () => {
      utils.auth.getNotificationPreferences.invalidate();
      toast.success("Preferences saved", {
        description: "Your notification preferences have been updated.",
      });
    },
    onError: (error) => {
      toast.error("Error", {
        description: error.message || "Failed to update preferences",
      });
    },
  });
  
  const handleToggle = (key: keyof typeof localPrefs) => {
    const newValue = !localPrefs[key];
    setLocalPrefs(prev => ({ ...prev, [key]: newValue }));
    
    // Immediately save to backend
    updatePreferences.mutate({ [key]: newValue });
  };
  
  if (!user) {
    return (
      <div className="container max-w-4xl py-12">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Please sign in to manage your account settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container max-w-4xl py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
          Account Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage your account preferences and notification settings
        </p>
      </div>
      
      <div className="space-y-6">
        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Name</Label>
              <p className="text-lg font-medium">{user.name || "Not set"}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Email</Label>
              <p className="text-lg font-medium">{user.email || "Not set"}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Role</Label>
              <p className="text-lg font-medium capitalize">{user.role}</p>
            </div>
          </CardContent>
        </Card>
        
        {/* Email Notification Preferences */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-pink-500" />
              <CardTitle>Email Notifications</CardTitle>
            </div>
            <CardDescription>
              Choose which email notifications you'd like to receive
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-pink-500" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Session Enrollment */}
                <div className="flex items-center justify-between space-x-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className="mt-1">
                      <Calendar className="w-5 h-5 text-pink-500" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label htmlFor="session-enrollment" className="text-base font-medium cursor-pointer">
                        Session Enrollment Confirmations
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Get notified when you're enrolled in a dance session
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="session-enrollment"
                    checked={localPrefs.emailSessionEnrollment}
                    onCheckedChange={() => handleToggle("emailSessionEnrollment")}
                    disabled={updatePreferences.isPending}
                  />
                </div>
                
                {/* Session Reminders */}
                <div className="flex items-center justify-between space-x-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className="mt-1">
                      <Bell className="w-5 h-5 text-purple-500" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label htmlFor="session-reminders" className="text-base font-medium cursor-pointer">
                        Session Reminders
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Receive a reminder 1 hour before your sessions start
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="session-reminders"
                    checked={localPrefs.emailSessionReminders}
                    onCheckedChange={() => handleToggle("emailSessionReminders")}
                    disabled={updatePreferences.isPending}
                  />
                </div>
                
                {/* Message Notifications */}
                <div className="flex items-center justify-between space-x-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className="mt-1">
                      <Mail className="w-5 h-5 text-pink-500" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label htmlFor="messages" className="text-base font-medium cursor-pointer">
                        New Messages
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Get notified when you receive a new message
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="messages"
                    checked={localPrefs.emailMessages}
                    onCheckedChange={() => handleToggle("emailMessages")}
                    disabled={updatePreferences.isPending}
                  />
                </div>
                
                {/* Course Completion */}
                <div className="flex items-center justify-between space-x-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className="mt-1">
                      <Award className="w-5 h-5 text-purple-500" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label htmlFor="course-completion" className="text-base font-medium cursor-pointer">
                        Course Completion Congratulations
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Celebrate your achievements when you complete a course
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="course-completion"
                    checked={localPrefs.emailCourseCompletion}
                    onCheckedChange={() => handleToggle("emailCourseCompletion")}
                    disabled={updatePreferences.isPending}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
