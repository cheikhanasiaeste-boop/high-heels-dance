import { trpc } from '@/lib/trpc';
import { EventCard } from './EventCard';
import { useProgressiveAuth } from '@/hooks/useProgressiveAuth';
import { useLocation } from 'wouter';

export function UpcomingEventsSection() {
  const [, setLocation] = useLocation();
  const { data: events, isLoading } = trpc.admin.availability.upcoming.useQuery({ limit: 6 });
  const { requireAuth } = useProgressiveAuth();
  
  const handleBookClick = (eventId: number) => {
    requireAuth(
      'booking',
      'Sign in to book this session and manage your bookings',
      () => {
        // Navigate to booking page with pre-selected event
        setLocation(`/book-session?eventId=${eventId}`);
      }
    );
  };
  
  if (isLoading) {
    return (
      <section className="py-20 bg-gradient-to-br from-white via-purple-50/30 to-pink-50/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Upcoming Sessions
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Loading available sessions...
            </p>
          </div>
        </div>
      </section>
    );
  }
  
  if (!events || events.length === 0) {
    return null; // Don't show section if no events
  }
  
  return (
    <section className="py-20 bg-gradient-to-br from-white via-purple-50/30 to-pink-50/30">
      <div className="container">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Upcoming Sessions
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Book your spot in our upcoming dance sessions. Hover over a card to see details and book instantly.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {events.map((event: any) => (
            <EventCard
              key={event.id}
              event={{
                ...event,
                startTime: new Date(event.startTime),
                endTime: new Date(event.endTime),
              }}
              onBookClick={handleBookClick}
            />
          ))}
        </div>
        
        {events.length >= 6 && (
          <div className="text-center mt-10">
            <a
              href="/book-session"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all hover:scale-105"
            >
              View All Available Sessions
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
