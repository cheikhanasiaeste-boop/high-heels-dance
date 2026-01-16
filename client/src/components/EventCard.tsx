import { useState } from 'react';
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, formatDistance, isWithin24Hours } from '@/lib/dateUtils';

interface EventCardProps {
  event: {
    id: number;
    title: string;
    startTime: Date;
    endTime: Date;
    eventType: 'online' | 'in-person';
    location?: string | null;
    sessionType: 'private' | 'group';
    capacity: number;
    currentBookings: number;
    isFree: boolean;
    price?: string | null;
    description?: string | null;
  };
  onBookClick: (eventId: number) => void;
}

export function EventCard({ event, onBookClick }: EventCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const spotsLeft = event.capacity - event.currentBookings;
  const isUrgent = isWithin24Hours(event.startTime);
  const duration = Math.round((event.endTime.getTime() - event.startTime.getTime()) / (1000 * 60)); // minutes
  
  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:shadow-lg hover:border-primary/30 focus-within:ring-2 focus-within:ring-primary/20"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      tabIndex={0}
      role="article"
      aria-label={`${event.title} on ${format(event.startTime, 'PPP')}`}
    >
      {/* Urgent indicator */}
      {isUrgent && (
        <div className="absolute top-3 right-3 z-10">
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-amber-100 text-amber-900 rounded-full border border-amber-200">
            <Clock className="w-3 h-3" />
            Soon
          </span>
        </div>
      )}
      
      {/* Card content */}
      <div className="p-5">
        {/* Event type badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
            event.eventType === 'online' 
              ? 'bg-blue-100 text-blue-900 border border-blue-200' 
              : 'bg-purple-100 text-purple-900 border border-purple-200'
          }`}>
            {event.eventType === 'online' ? '🌐 Online' : '📍 In-Person'}
          </span>
          <span className="text-xs text-muted-foreground capitalize">
            {event.sessionType}
          </span>
        </div>
        
        {/* Title */}
        <h3 className="text-lg font-semibold text-foreground mb-2 line-clamp-2">
          {event.title}
        </h3>
        
        {/* Date & Time */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Calendar className="w-4 h-4 flex-shrink-0" />
          <span>{format(event.startTime, 'PPP')}</span>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>{format(event.startTime, 'p')} • {duration} min</span>
        </div>
        
        {/* Location */}
        {event.location && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="w-4 h-4 flex-shrink-0" />
            <span className="line-clamp-1">{event.location}</span>
          </div>
        )}
        
        {/* Availability */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className={`font-medium ${
              spotsLeft <= 2 ? 'text-amber-600' : 'text-foreground'
            }`}>
              {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
            </span>
          </div>
          
          <span className="text-sm font-semibold text-foreground">
            {event.isFree ? 'Free' : `$${event.price}`}
          </span>
        </div>
      </div>
      
      {/* Hover overlay */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/90 to-primary/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 transition-all duration-200 ${
          isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!isHovered}
      >
        <div className="text-center text-white mb-4">
          <h4 className="text-xl font-bold mb-2">{event.title}</h4>
          <p className="text-sm opacity-90 mb-1">
            {format(event.startTime, 'EEEE, MMMM d')}
          </p>
          <p className="text-sm opacity-90 mb-1">
            {format(event.startTime, 'p')} - {format(event.endTime, 'p')}
          </p>
          <p className="text-sm opacity-90">
            {duration} minutes • {spotsLeft} spots available
          </p>
        </div>
        
        <Button
          size="lg"
          variant="secondary"
          className="min-w-[160px] h-12 text-base font-semibold shadow-lg hover:scale-105 transition-transform"
          onClick={(e) => {
            e.stopPropagation();
            onBookClick(event.id);
          }}
          aria-label={`Book ${event.title}`}
        >
          Book Now
        </Button>
        
        {!event.isFree && (
          <p className="text-white text-sm mt-3 opacity-90">
            ${event.price}
          </p>
        )}
      </div>
    </div>
  );
}
