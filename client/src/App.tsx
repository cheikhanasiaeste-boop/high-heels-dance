import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { WelcomeModal } from "./components/WelcomeModal";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";
import { useState, useEffect } from "react";
import Home from "./pages/Home";
import Courses from "./pages/Courses";
import CourseDetail from "./pages/CourseDetail";
import CourseLearn from "./pages/CourseLearn";
import MyCourses from "./pages/MyCourses";
import Admin from "./pages/Admin";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminCourses from "./pages/admin/Courses";
import AdminBookings from "./pages/admin/Bookings";
import AdminAvailability from "./pages/admin/Availability";
import AdminTestimonials from "./pages/admin/Testimonials";
import AdminSettings from "./pages/admin/Settings";
import AdminUsers from "./pages/admin/Users";
import AdminUserManagement from "./pages/admin/UserManagementNew";
import AdminUserActivity from "./pages/admin/UserActivity";
import AdminSessions from "./pages/admin/AdminSessions";
import AdminDiscounts from "./pages/admin/Discounts";
// LiveSessions is now integrated into AdminSessions as a tab
import CourseContentManager from "./pages/admin/CourseContentManager";
import BookSession from "./pages/BookSession";
import Feedback from './pages/Feedback';
import SessionView from './pages/SessionView';
import SessionDetail from './pages/SessionDetail';
import Messages from "./pages/Messages";
import Activity from "./pages/Activity";
import MyBookings from "./pages/MyBookings";
import MyMessages from "./pages/MyMessages";
import Conversations from "./pages/Conversations";
import Membership from "./pages/Membership";
import { SubscriptionSuccess } from "./pages/SubscriptionSuccess";
import AuthCallback from "./pages/AuthCallback";
import LiveSession from "./pages/LiveSession";
import { AdminGuard } from "./components/AdminGuard";


function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/courses" component={Courses} />
      <Route path="/course/:id" component={CourseDetail} />
      <Route path="/courses/:id" component={CourseDetail} />
      <Route path="/course/:id/learn" component={CourseLearn} />
      <Route path="/courses/:id/learn" component={CourseLearn} />
      <Route path="/my-courses" component={MyCourses} />
      <Route path="/my-bookings" component={MyBookings} />
      <Route path="/membership" component={Membership} />
      <Route path="/subscription-success" component={SubscriptionSuccess} />
      <Route path="/session/:bookingId" component={SessionDetail} />
      <Route path="/session-view/:bookingId" component={SessionView} />
      <Route path="/my-messages" component={Conversations} />
      <Route path="/messages" component={Messages} />
      <Route path="/activity" component={Activity} />
      <Route path="/book-session" component={BookSession} />
      <Route path="/feedback" component={Feedback} />
      <Route path="/live-session/:id" component={LiveSession} />

      <Route path="/admin">{() => <AdminGuard><AdminDashboard /></AdminGuard>}</Route>
      <Route path="/admin/courses">{() => <AdminGuard><AdminCourses /></AdminGuard>}</Route>
      <Route path="/admin/courses/:id/content">{() => <AdminGuard><CourseContentManager /></AdminGuard>}</Route>
      <Route path="/admin/bookings">{() => <AdminGuard><AdminBookings /></AdminGuard>}</Route>
      <Route path="/admin/availability">{() => <AdminGuard><AdminAvailability /></AdminGuard>}</Route>
      <Route path="/admin/sessions">{() => <AdminGuard><AdminSessions /></AdminGuard>}</Route>
      <Route path="/admin/live-sessions">{() => <AdminGuard><AdminSessions /></AdminGuard>}</Route>
      <Route path="/admin/testimonials">{() => <AdminGuard><AdminTestimonials /></AdminGuard>}</Route>
      <Route path="/admin/users">{() => <AdminGuard><AdminUserManagement /></AdminGuard>}</Route>
      <Route path="/admin/user-activity">{() => <AdminGuard><AdminUserActivity /></AdminGuard>}</Route>
      <Route path="/admin/discounts">{() => <AdminGuard><AdminDiscounts /></AdminGuard>}</Route>
      <Route path="/admin/settings">{() => <AdminGuard><AdminSettings /></AdminGuard>}</Route>
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { user, isAuthenticated } = useAuth();
  const [showWelcome, setShowWelcome] = useState(false);
  const markWelcomeMutation = trpc.auth.markWelcomeSeen.useMutation();

  // Show welcome modal only once per user — guard with localStorage + DB flag
  useEffect(() => {
    if (isAuthenticated && user && !user.hasSeenWelcome) {
      const dismissed = localStorage.getItem(`welcome_seen_${user.id}`);
      if (!dismissed) {
        setShowWelcome(true);
      }
    }
  }, [isAuthenticated, user]);

  const handleCloseWelcome = () => {
    setShowWelcome(false);
    if (user) localStorage.setItem(`welcome_seen_${user.id}`, "1");
    markWelcomeMutation.mutate();
  };

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
          <WelcomeModal
            isOpen={showWelcome}
            onClose={handleCloseWelcome}
            userName={user?.name || undefined}
          />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
