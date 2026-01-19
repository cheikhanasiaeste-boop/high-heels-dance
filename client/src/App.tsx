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
      <Route path="/session/:bookingId" component={SessionDetail} />
      <Route path="/session-view/:bookingId" component={SessionView} />
      <Route path="/my-messages" component={Conversations} />
      <Route path="/messages" component={Messages} />
      <Route path="/activity" component={Activity} />
      <Route path="/book-session" component={BookSession} />
      <Route path="/feedback" component={Feedback} />

      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/courses" component={AdminCourses} />
      <Route path="/admin/courses/:id/content" component={CourseContentManager} />
      <Route path="/admin/bookings" component={AdminBookings} />
      <Route path="/admin/availability" component={AdminAvailability} />
      <Route path="/admin/sessions" component={AdminSessions} />
      <Route path="/admin/testimonials" component={AdminTestimonials} />
      <Route path="/admin/users" component={AdminUserManagement} />
      <Route path="/admin/user-activity" component={AdminUserActivity} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { user, isAuthenticated } = useAuth();
  const [showWelcome, setShowWelcome] = useState(false);
  const markWelcomeMutation = trpc.auth.markWelcomeSeen.useMutation();

  // Check if user should see welcome modal
  useEffect(() => {
    if (isAuthenticated && user && !user.hasSeenWelcome) {
      setShowWelcome(true);
    }
  }, [isAuthenticated, user]);

  const handleCloseWelcome = () => {
    setShowWelcome(false);
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
