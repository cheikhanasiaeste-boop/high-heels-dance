import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserProfileDropdown } from '@/components/UserProfileDropdown';
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import { trpc } from '@/lib/trpc';

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const { data: unreadCount } = trpc.messages.unreadCount.useQuery(undefined, { enabled: isAuthenticated });

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Close menu on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
      return () => window.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen]);

  const closeMenu = () => setIsOpen(false);

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Toggle mobile menu"
        aria-expanded={isOpen}
      >
        <Menu className="w-6 h-6 text-gray-700" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 lg:hidden animate-fade-in"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Slide-out Menu */}
      <div
        className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Mobile navigation menu"
      >
        {/* Menu Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-primary">Menu</h2>
          <button
            onClick={closeMenu}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close mobile menu"
          >
            <X className="w-6 h-6 text-gray-700" />
          </button>
        </div>

        {/* Menu Content */}
        <div className="flex flex-col p-4 space-y-3">
          {/* User Info Section */}
          {isAuthenticated && user && (
            <div className="pb-3 border-b">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold shadow-md">
                  {(user.name || 'U')
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{user.name}</p>
                  <p className="text-sm text-gray-500 truncate">{user.email}</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <Link href="/book-session" onClick={closeMenu}>
            <Button variant="default" className="w-full justify-start" size="lg">
              Book a Session
            </Button>
          </Link>

          <a href="https://elizabethzolotova.manus.space/my-courses" onClick={closeMenu}>
            <Button
              variant="outline"
              className="w-full justify-start shadow-lg border-2 border-primary hover:bg-primary hover:text-primary-foreground"
              size="lg"
            >
              My Courses
            </Button>
          </a>

          {isAuthenticated ? (
            <>
              {/* User Menu Items */}
              <div className="pt-3 border-t space-y-2">
                <Link href="/my-bookings" onClick={closeMenu}>
                  <Button variant="ghost" className="w-full justify-start" size="lg">
                    My Booked Sessions
                  </Button>
                </Link>

                <Link href="/messages" onClick={closeMenu}>
                  <Button variant="ghost" className="w-full justify-start relative" size="lg">
                    My Messages
                    {unreadCount && unreadCount > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </Link>

                <Link href="/activity" onClick={closeMenu}>
                  <Button variant="ghost" className="w-full justify-start" size="lg">
                    Activity History
                  </Button>
                </Link>

                {user?.role === 'admin' && (
                  <Link href="/admin" onClick={closeMenu}>
                    <Button variant="outline" className="w-full justify-start" size="lg">
                      Admin Dashboard
                    </Button>
                  </Link>
                )}
              </div>

              {/* Logout */}
              <div className="pt-3 border-t">
                <Link href="/" onClick={closeMenu}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                    size="lg"
                  >
                    Logout
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <a href={getLoginUrl()} onClick={closeMenu}>
              <Button variant="default" className="w-full justify-start" size="lg">
                Sign In
              </Button>
            </a>
          )}
        </div>
      </div>
    </>
  );
}
