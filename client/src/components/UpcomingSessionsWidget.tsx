import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, Clock, Video } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useProgressiveAuth } from '@/hooks/useProgressiveAuth';
import { ProgressiveAuthModal } from '@/components/ProgressiveAuthModal';
import { useLocation } from 'wouter';
import { format } from '@/lib/dateUtils';
import { Button } from '@/components/ui/button';

export function UpcomingSessionsWidget() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [widgetTop, setWidgetTop] = useState(96); // Default top position (24 * 4px)
  const [, setLocation] = useLocation();
  const { data: regularEvents, isLoading: isLoadingRegular } = trpc.admin.availability.upcoming.useQuery({ limit: 5 });
  const { data: liveEvents, isLoading: isLoadingLive } = trpc.liveSessions.upcoming.useQuery({ limit: 5 });
  const { isAuthModalOpen, authContext, authContextDetails, requireAuth, closeAuthModal } = useProgressiveAuth();
  const widgetRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isLoading = isLoadingRegular || isLoadingLive;

  // Merge regular and live sessions, sorted by start time
  const events = useMemo(() => {
    const regular = (regularEvents || []).map((e: any) => ({
      ...e,
      _type: 'regular' as const,
    }));
    const live = (liveEvents || []).map((e: any) => ({
      ...e,
      _type: 'live' as const,
      // Normalize fields to match regular events shape
      eventType: 'online',
      sessionType: 'group',
      currentBookings: 0,
    }));
    return [...regular, ...live]
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 5);
  }, [regularEvents, liveEvents]);
  
  // Constrain widget top position: never overlap the sticky header
  useEffect(() => {
    const handleScroll = () => {
      const header = document.querySelector('header');
      if (!header) return;

      const headerRect = header.getBoundingClientRect();
      const minTop = headerRect.bottom + 12; // Always below the header + spacing

      setWidgetTop(minTop);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check initial state

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  // Expand/collapse based on hover or focus state
  useEffect(() => {
    if (isHovered || isFocused) {
      // Clear any pending collapse
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsExpanded(true);
    } else {
      // Delay collapse slightly for smoother UX
      hoverTimeoutRef.current = setTimeout(() => {
        setIsExpanded(false);
      }, 150);
    }
    
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isHovered, isFocused]);
  
  const handleBookClick = (event: any) => {
    if (event._type === 'live') {
      // Live sessions: navigate directly (access control is on the page)
      setLocation(`/live-session/${event.id}`);
      return;
    }
    requireAuth(
      'booking',
      'Sign in to book this session and manage your bookings',
      () => {
        setLocation(`/book-session?eventId=${event.id}`);
      }
    );
  };
  
  if (isLoading || !events || events.length === 0) {
    return null;
  }
  
  return (
    <div 
      ref={widgetRef}
      className="hidden sm:block fixed right-3 sm:right-6 z-40 animate-slide-in-right transition-all duration-200"
      style={{ top: `${widgetTop}px` }}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
    >
      {/* Trigger Button - Always visible, animates when not expanded */}
      <button
        className={`
          group relative flex items-center gap-2 px-4 py-3
          bg-gradient-to-r from-fuchsia-600 via-purple-600 to-fuchsia-600
          text-white rounded-full shadow-lg shadow-fuchsia-500/20
          transition-all duration-300 ease-out
          hover:shadow-xl hover:shadow-fuchsia-500/30
          focus:outline-none focus:ring-2 focus:ring-fuchsia-500 focus:ring-offset-2 focus:ring-offset-[#0d0010]
          overflow-hidden
          ${!isExpanded ? 'animate-confident-lift' : ''}
        `}
        aria-label="View upcoming events"
        aria-expanded={isExpanded}
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        <div className="absolute inset-0 animate-shimmer" />
        <Calendar className="w-5 h-5 relative z-10" />
        <span className="font-semibold relative z-10">Upcoming Events</span>
        <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold relative z-10">
          {events.length}
        </span>
      </button>
      
      {/* Expanded Dropdown - Appears on hover/focus */}
      <div 
        className={`
          absolute top-full right-0 mt-2
          w-72 sm:w-80 max-w-[calc(100vw-2rem)] max-h-[65vh]
          bg-[#141118] rounded-xl shadow-2xl shadow-fuchsia-500/10 border border-white/10
          overflow-hidden
          transition-all duration-300 ease-out
          origin-top-right
          ${isExpanded 
            ? 'opacity-100 scale-100 translate-y-0' 
            : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
          }
        `}
        role="region"
        aria-label="Upcoming events list"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-fuchsia-600 via-purple-600 to-fuchsia-600 text-white p-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            <h3 className="font-semibold text-base">Upcoming Events</h3>
          </div>
        </div>
        
        {/* Sessions List */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(65vh - 120px)' }}>
          {events.map((event: any, index: number) => {
            const spotsLeft = event.capacity - event.currentBookings;
            const startTime = new Date(event.startTime);
            const endTime = new Date(event.endTime);
            const duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
            
            return (
              <div
                key={event.id}
                className={`
                  p-3 border-b border-white/[0.06]
                  hover:bg-white/[0.04] transition-colors
                  animate-fade-in-stagger
                `}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Event Type Badge */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  {event._type === 'live' ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-green-500/15 text-green-400">
                      <Video className="w-3 h-3" /> Live Zoom
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full ${
                      event.eventType === 'online'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-purple-500/15 text-purple-400'
                    }`}>
                      {event.eventType === 'online' ? '🌐 Online' : '📍 In-Person'}
                    </span>
                  )}
                  <span className="text-xs text-white/40 capitalize">
                    {event._type === 'live' ? 'group' : event.sessionType}
                  </span>
                </div>
                
                {/* Title */}
                <h4 className="font-semibold text-sm text-white mb-1.5 line-clamp-2">
                  {event.title}
                </h4>
                
                {/* Date & Time */}
                <div className="flex items-center gap-1.5 text-xs text-white/50 mb-0.5">
                  <Calendar className="w-3 h-3 flex-shrink-0" />
                  <span>{format(startTime, 'MMM d, yyyy')}</span>
                </div>
                
                <div className="flex items-center gap-1.5 text-xs text-white/50 mb-2">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span>{format(startTime, 'p')} • {duration} min</span>
                </div>
                
                {/* Footer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {event._type !== 'live' && (
                      <span className={`text-xs font-medium ${
                        spotsLeft <= 2 ? 'text-amber-400' : 'text-white/60'
                      }`}>
                        {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-white">
                      {event.isFree ? 'Free' : `€${event.price}`}
                    </span>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => handleBookClick(event)}
                    className="bg-[#C026D3] hover:bg-[#A21CAF] text-xs px-3 py-1"
                  >
                    {event._type === 'live' ? 'View' : 'Book'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Footer */}
        <div className="p-3 bg-white/[0.03] border-t border-white/[0.06]">
          <a
            href="/book-session"
            className="block text-center text-xs font-semibold text-[#E879F9] hover:text-fuchsia-300 transition-colors whitespace-nowrap overflow-hidden text-ellipsis px-2"
          >
            View All Available Sessions ✦
          </a>
        </div>
      </div>

      {/* Progressive Authentication Modal */}
      <ProgressiveAuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        context={authContext || 'booking'}
        contextDetails={authContextDetails}
      />
    </div>
  );
}
