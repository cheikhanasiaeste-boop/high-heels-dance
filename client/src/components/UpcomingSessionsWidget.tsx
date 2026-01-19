import { useState, useRef, useEffect } from 'react';
import { Calendar, Clock } from 'lucide-react';
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
  const [, setLocation] = useLocation();
  const { data: events, isLoading} = trpc.admin.availability.upcoming.useQuery({ limit: 5 });
  const { isAuthModalOpen, authContext, authContextDetails, requireAuth, closeAuthModal } = useProgressiveAuth();
  const widgetRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
  
  const handleBookClick = (eventId: number) => {
    requireAuth(
      'booking',
      'Sign in to book this session and manage your bookings',
      () => {
        setLocation(`/book-session?eventId=${eventId}`);
      }
    );
  };
  
  if (isLoading || !events || events.length === 0) {
    return null;
  }
  
  return (
    <div 
      ref={widgetRef}
      className="sticky top-24 right-6 z-50 animate-slide-in-right ml-auto w-fit"
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
          bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 
          text-white rounded-full shadow-lg 
          transition-all duration-300 ease-out
          hover:shadow-xl
          focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2
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
        <span className="px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold relative z-10">
          {events.length}
        </span>
      </button>
      
      {/* Expanded Dropdown - Appears on hover/focus */}
      <div 
        className={`
          absolute top-full right-0 mt-2
          w-80 max-h-[65vh] 
          bg-white rounded-xl shadow-2xl border border-gray-200 
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
        <div className="bg-gradient-to-r from-rose-500 via-pink-500 to-orange-400 text-white p-3">
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
                  p-3 border-b border-gray-100 
                  hover:bg-purple-50/50 transition-colors
                  animate-fade-in-stagger
                `}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Event Type Badge */}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full ${
                    event.eventType === 'online' 
                      ? 'bg-blue-100 text-blue-900' 
                      : 'bg-purple-100 text-purple-900'
                  }`}>
                    {event.eventType === 'online' ? '🌐 Online' : '📍 In-Person'}
                  </span>
                  <span className="text-xs text-gray-500 capitalize">
                    {event.sessionType}
                  </span>
                </div>
                
                {/* Title */}
                <h4 className="font-semibold text-sm text-gray-900 mb-1.5 line-clamp-2">
                  {event.title}
                </h4>
                
                {/* Date & Time */}
                <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-0.5">
                  <Calendar className="w-3 h-3 flex-shrink-0" />
                  <span>{format(startTime, 'MMM d, yyyy')}</span>
                </div>
                
                <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
                  <Clock className="w-3 h-3 flex-shrink-0" />
                  <span>{format(startTime, 'p')} • {duration} min</span>
                </div>
                
                {/* Footer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      spotsLeft <= 2 ? 'text-amber-600' : 'text-gray-700'
                    }`}>
                      {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'}
                    </span>
                    <span className="text-xs font-semibold text-gray-900">
                      {event.isFree ? 'Free' : `€${event.price}`}
                    </span>
                  </div>
                  
                  <Button
                    size="sm"
                    onClick={() => handleBookClick(event.id)}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-xs px-3 py-1"
                  >
                    Book
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200">
          <a
            href="/book-session"
            className="block text-center text-xs font-semibold text-purple-600 hover:text-purple-700 transition-colors whitespace-nowrap overflow-hidden text-ellipsis px-2"
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
