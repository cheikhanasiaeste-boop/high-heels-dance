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
  Percent
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
      {/* Admin uses a light color override to stand out from the dark public site */}
      <div
        className="min-h-screen flex"
        style={{
          '--background': 'oklch(0.97 0.01 280)',
          '--foreground': 'oklch(0.20 0.02 280)',
          '--card': 'oklch(1 0 0)',
          '--card-foreground': 'oklch(0.20 0.02 280)',
          '--popover': 'oklch(1 0 0)',
          '--popover-foreground': 'oklch(0.20 0.02 280)',
          '--muted': 'oklch(0.95 0.01 280)',
          '--muted-foreground': 'oklch(0.45 0.02 280)',
          '--border': 'oklch(0.91 0.01 280)',
          '--input': 'oklch(0.91 0.01 280)',
          '--secondary': 'oklch(0.95 0.02 310)',
          '--secondary-foreground': 'oklch(0.25 0.03 310)',
          '--accent': 'oklch(0.93 0.04 320)',
          '--accent-foreground': 'oklch(0.20 0.02 280)',
          backgroundColor: 'oklch(0.97 0.01 280)',
          color: 'oklch(0.20 0.02 280)',
        } as React.CSSProperties}
      >
      {/* Side Menu */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed left-0 top-0 h-screen">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <Link href="/" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
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
                        ? "bg-[#C026D3] text-white"
                        : "text-gray-600 hover:bg-fuchsia-50 hover:text-gray-900"
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
        <div className="p-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 text-center">
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
