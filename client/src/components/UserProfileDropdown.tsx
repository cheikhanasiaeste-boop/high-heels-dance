import { useState, useRef, useEffect } from 'react';
import { Link } from 'wouter';
import {
  User,
  MessageSquare,
  Calendar,
  BookOpen,
  Activity,
  Crown,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '@/_core/hooks/useAuth';

interface UserProfileDropdownProps {
  unreadMessagesCount?: number;
}

export function UserProfileDropdown({ unreadMessagesCount = 0 }: UserProfileDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { user, logout } = useAuth();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    // Close dropdown on ESC key
    function handleEscKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscKey);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscKey);
      };
    }
  }, [isOpen]);

  // Keyboard navigation within dropdown
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      const menuItems = dropdownRef.current?.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>(
        'a[role="menuitem"], button[role="menuitem"]'
      );
      
      if (!menuItems || menuItems.length === 0) return;

      const currentIndex = Array.from(menuItems).findIndex(
        item => item === document.activeElement
      );

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0;
        menuItems[nextIndex].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1;
        menuItems[prevIndex].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        menuItems[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        menuItems[menuItems.length - 1].focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const closeDropdown = () => {
    setIsOpen(false);
  };

  if (!user) return null;

  // Get user initials for avatar
  const initials = (user.name || 'U')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        onClick={toggleDropdown}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-fuchsia-50/80 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2 min-h-[44px]"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User profile menu"
      >
        {/* Avatar with notification badge */}
        <div className="relative">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-600 to-purple-500 flex items-center justify-center text-white font-semibold text-sm shadow-md">
            {initials}
          </div>
          {unreadMessagesCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
              {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
            </span>
          )}
        </div>
        
        {/* User Name */}
        <span className="text-sm font-medium text-stone-700 hidden sm:inline">
          {user.name}
        </span>
        
        {/* Chevron Icon */}
        <ChevronDown 
          className={`w-4 h-4 text-stone-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-fuchsia-100/30 py-2 z-50 animate-dropdown-open"
        >
          {/* User Info Header */}
          <div className="px-4 py-3 border-b border-stone-100">
            <p className="text-sm font-semibold text-stone-900">{user.name}</p>
            <p className="text-xs text-stone-500 truncate">{user.email}</p>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {/* My Studio */}
            <Link href="/dashboard">
              <a
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-fuchsia-50 hover:text-fuchsia-700 transition-colors duration-150 focus:outline-none focus:bg-fuchsia-50 focus:text-fuchsia-700 min-h-[44px] group"
              >
                <LayoutDashboard className="w-5 h-5 text-gray-400 group-hover:text-fuchsia-600 group-focus:text-fuchsia-600 transition-colors" />
                <span>My Studio</span>
              </a>
            </Link>

            {/* My Messages */}
            <Link href="/my-messages" onClick={closeDropdown}>
              <a
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-fuchsia-50 hover:text-fuchsia-700 transition-colors duration-150 focus:outline-none focus:bg-fuchsia-50 focus:text-fuchsia-700 min-h-[44px] group"
              >
                <MessageSquare className="w-5 h-5 text-gray-400 group-hover:text-fuchsia-600 group-focus:text-fuchsia-600 transition-colors" />
                <span className="flex-1">My Messages</span>
                {unreadMessagesCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                    {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                  </span>
                )}
              </a>
            </Link>

            {/* My Booked Sessions */}
            <Link href="/my-bookings" onClick={closeDropdown}>
              <a
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-fuchsia-50 hover:text-fuchsia-700 transition-colors duration-150 focus:outline-none focus:bg-fuchsia-50 focus:text-fuchsia-700 min-h-[44px] group"
              >
                <Calendar className="w-5 h-5 text-gray-400 group-hover:text-fuchsia-600 group-focus:text-fuchsia-600 transition-colors" />
                <span>My Booked Sessions</span>
              </a>
            </Link>

            {/* My Courses */}
            <Link href="/my-courses" onClick={closeDropdown}>
              <a
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-fuchsia-50 hover:text-fuchsia-700 transition-colors duration-150 focus:outline-none focus:bg-fuchsia-50 focus:text-fuchsia-700 min-h-[44px] group"
              >
                <BookOpen className="w-5 h-5 text-gray-400 group-hover:text-fuchsia-600 group-focus:text-fuchsia-600 transition-colors" />
                <span>My Courses</span>
              </a>
            </Link>

            {/* Activity History */}
            <Link href="/activity" onClick={closeDropdown}>
              <a
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-fuchsia-50 hover:text-fuchsia-700 transition-colors duration-150 focus:outline-none focus:bg-fuchsia-50 focus:text-fuchsia-700 min-h-[44px] group"
              >
                <Activity className="w-5 h-5 text-gray-400 group-hover:text-fuchsia-600 group-focus:text-fuchsia-600 transition-colors" />
                <span>Activity History</span>
              </a>
            </Link>

            {/* Membership */}
            <Link href="/membership" onClick={closeDropdown}>
              <a
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-fuchsia-50 hover:text-fuchsia-700 transition-colors duration-150 focus:outline-none focus:bg-fuchsia-50 focus:text-fuchsia-700 min-h-[44px] group"
              >
                <Crown className="w-5 h-5 text-gray-400 group-hover:text-fuchsia-600 group-focus:text-fuchsia-600 transition-colors" />
                <span>Membership</span>
              </a>
            </Link>

            {/* Help & Support */}
            <a
              href="mailto:dance.with.elizabeth.zolotova@gmail.com"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-fuchsia-50 hover:text-fuchsia-700 transition-colors duration-150 focus:outline-none focus:bg-fuchsia-50 focus:text-fuchsia-700 min-h-[44px] group"
            >
              <HelpCircle className="w-5 h-5 text-gray-400 group-hover:text-fuchsia-600 group-focus:text-fuchsia-600 transition-colors" />
              <span>Help & Support</span>
            </a>
          </div>

          {/* Divider */}
          <div className="border-t border-stone-100 my-1" />

          {/* Logout */}
          <div className="py-1">
            <button
              role="menuitem"
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors duration-150 focus:outline-none focus:bg-red-50 min-h-[44px] group"
            >
              <LogOut className="w-5 h-5 text-red-500 group-hover:text-red-600 group-focus:text-red-600 transition-colors" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
