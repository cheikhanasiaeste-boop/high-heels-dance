import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  BookOpen,
  Calendar,
  Clock,
  MessageSquare,
  Settings,
  ArrowLeft,
  Users,
  Activity,
  Percent,
  Video
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminNotifications } from "@/components/AdminNotifications";
import { trpc } from "@/lib/trpc";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  { path: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/admin/courses", icon: BookOpen, label: "Courses" },
  { path: "/admin/sessions", icon: Calendar, label: "Sessions" },
  { path: "/admin/live-sessions", icon: Video, label: "Live Sessions" },
  { path: "/admin/users", icon: Users, label: "Users" },
  { path: "/admin/user-activity", icon: Activity, label: "User Activity" },
  { path: "/admin/testimonials", icon: MessageSquare, label: "Testimonials" },
  { path: "/admin/discounts", icon: Percent, label: "Discounts" },
  { path: "/admin/settings", icon: Settings, label: "Site Settings" },
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  
  // Get pending testimonials count
  const { data: pendingCount = 0 } = trpc.admin.testimonials.pendingCount.useQuery();
  
  // Get new/unviewed users count
  const { data: newUserCount = 0 } = trpc.admin.users.newUserCount.useQuery();

  return (
    <>
      <AdminNotifications />
      <div className="min-h-screen bg-background flex">
      {/* Side Menu */}
      <aside className="w-64 bg-card border-r border-border flex flex-col fixed left-0 top-0 h-screen">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
          <h1 className="text-2xl font-bold mt-4 text-[#831843]" style={{ fontFamily: 'var(--font-display)' }}>
            Admin Panel
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <li key={item.path}>
                  <Link 
                    href={item.path}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors relative",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                    {item.path === '/admin/testimonials' && pendingCount > 0 && (
                      <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                        {pendingCount}
                      </span>
                    )}
                    {item.path === '/admin/users' && newUserCount > 0 && (
                      <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                        {newUserCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">
            High Heels Dance Admin
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto ml-64">
        <div className="container max-w-7xl py-8">
          {children}
        </div>
      </main>
      </div>
    </>
  );
}
