import { useState } from 'react';
import { Calendar, Clock, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useProgressiveAuth } from '@/hooks/useProgressiveAuth';
import { useLocation } from 'wouter';
import { format } from '@/lib/dateUtils';
import { Button } from '@/components/ui/button';

export function UpcomingSessionsWidget() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [, setLocation] = useLocation();
  const { data: events, isLoading } = trpc.admin.availability.upcoming.useQuery({ limit: 5 });
  const { requireAuth } = useProgressiveAuth();
  
  const handleBookClick = (eventId: number) => {
    requireAuth(
      'booking',
      'Sign in to book this session and manage your bookings',
      () => {
        setLocation(`/book-session/${eventId}`);
        setIsExpanded(false);
      }
    );
  };
  
  if (isLoading || !events || events.length === 0) {
    return null;
  }
  
  return (
    <div className="fixed top-24 right-6 z-40 animate-slide-in-right">
      {/* Trigger Button */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="group relative flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 animate-gentle-pulse overflow-hidden"
          aria-label="View upcoming sessions"
        >
          <div className="absolute inset-0 animate-shimmer" />
          <Calendar className="w-5 h-5" />
          <span className="font-semibold">Upcoming Sessions</span>
          <span className="px-2 py-0.5 bg-white/30 rounded-full text-xs font-bold animate-badge-bounce">
            {events.length}
          </span>
        </button>
      )}
      
      {/* Expanded Widget */}
      {isExpanded && (
        <div className="w-96 max-h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              <h3 className="font-bold text-lg">Upcoming Sessions</h3>
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Sessions List */}
          <div className="overflow-y-auto max-h-[500px]">
            {events.map((event: any) => {
              const spotsLeft = event.capacity - event.currentBookings;
              const startTime = new Date(event.startTime);
              const endTime = new Date(event.endTime);
              const duration = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
              
              return (
                <div
                  key={event.id}
                  className="p-4 border-b border-gray-100 hover:bg-purple-50/50 transition-colors group"
                >
                  {/* Event Type Badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
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
                  <h4 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                    {event.title}
                  </h4>
                  
                  {/* Date & Time */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{format(startTime, 'MMM d, yyyy')}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                    <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{format(startTime, 'p')} • {duration} min</span>
                  </div>
                  
                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-medium ${
                        spotsLeft <= 2 ? 'text-amber-600' : 'text-gray-700'
                      }`}>
                        {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {event.isFree ? 'Free' : `€${event.price}`}
                      </span>
                    </div>
                    
                    <Button
                      size="sm"
                      onClick={() => handleBookClick(event.id)}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    >
                      Book
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Footer */}
          <div className="p-4 bg-gray-50 border-t border-gray-200">
            <a
              href="/book-session"
              className="block text-center text-sm font-semibold text-purple-600 hover:text-purple-700 transition-colors"
            >
              View All Available Sessions →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
