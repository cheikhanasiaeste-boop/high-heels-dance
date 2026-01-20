import { useAuth } from '@/_core/hooks/useAuth';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, ArrowLeft, Clock, MapPin, Video, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';

export default function MyBookings() {
  const { user } = useAuth();
  const { data: bookings, isLoading } = trpc.bookings.myBookings.useQuery();

  // Helper function to determine session state
  const getSessionState = (booking: any) => {
    if (booking.status === 'cancelled') return 'cancelled';
    
    const now = new Date();
    const sessionStart = new Date(booking.slot!.startTime);
    const sessionEnd = new Date(booking.slot!.endTime);
    const joinWindowStart = new Date(sessionStart.getTime() - 15 * 60 * 1000); // 15 min before
    
    if (now > sessionEnd) return 'completed';
    if (now >= joinWindowStart && now <= sessionEnd) return 'live';
    return 'upcoming';
  };

  // Helper function to get badge variant based on state
  const getStateBadgeVariant = (state: string) => {
    switch (state) {
      case 'live':
        return 'default'; // Green
      case 'upcoming':
        return 'secondary'; // Blue
      case 'completed':
        return 'outline'; // Gray
      case 'cancelled':
        return 'destructive'; // Red
      default:
        return 'secondary';
    }
  };

  // Helper function to get badge color classes
  const getStateBadgeClass = (state: string) => {
    switch (state) {
      case 'live':
        return 'bg-green-100 text-green-700 border-green-200 animate-pulse';
      case 'upcoming':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'completed':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'cancelled':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">My Sessions</h1>
        </div>
      </header>

      {/* Content */}
      <div className="container py-8 max-w-5xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <CardTitle>Upcoming Sessions</CardTitle>
                <CardDescription>
                  View and manage your booked dance sessions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-gray-600">Loading your bookings...</p>
              </div>
            ) : bookings && bookings.length > 0 ? (
              <div className="space-y-4">
                {bookings.map((booking: any) => {
                  const sessionState = getSessionState(booking);
                  const isJoinable = sessionState === 'live' && booking.slot?.eventType === 'online' && booking.slot?.zoomMeetingId;
                  
                  return (
                    <Link key={booking.id} href={`/session/${booking.id}`}>
                      <Card className="cursor-pointer hover:shadow-lg hover:border-purple-300 transition-all duration-200 hover:-translate-y-0.5">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <CardTitle className="text-xl">
                                  {booking.slot?.title || `${booking.sessionType} Session`}
                                </CardTitle>
                                <Badge 
                                  className={getStateBadgeClass(sessionState)}
                                  variant="outline"
                                >
                                  {sessionState === 'live' && '🟢 '}
                                  {sessionState.charAt(0).toUpperCase() + sessionState.slice(1)}
                                </Badge>
                                <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>
                                  {booking.status}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {/* Date & Time */}
                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <Clock className="w-4 h-4 text-purple-600" />
                            <span className="font-medium">
                              {new Date(booking.slot!.startTime).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}{' '}
                              at{' '}
                              {new Date(booking.slot!.startTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {/* Session Type */}
                          {booking.slot?.eventType === 'online' ? (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <Video className="w-4 h-4 text-purple-600" />
                              <span className="font-medium">🌐 Online Session</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-gray-700">
                              <MapPin className="w-4 h-4 text-purple-600" />
                              <span className="font-medium">📍 {booking.slot?.location || 'In-person Session'}</span>
                            </div>
                          )}

                          {/* Description */}
                          {booking.slot?.description && (
                            <div className="pt-2 border-t border-gray-100">
                              <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
                                {booking.slot.description}
                              </p>
                            </div>
                          )}
                        </CardContent>
                        <CardFooter className="pt-0 flex justify-between items-center">
                          <Button variant="outline" size="sm" className="gap-2">
                            View Session Details
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                          {isJoinable && (
                            <Badge className="bg-green-600 text-white hover:bg-green-700 px-3 py-1 animate-pulse">
                              ✨ Ready to Join
                            </Badge>
                          )}
                        </CardFooter>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <Calendar className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No bookings yet
                </h3>
                <p className="text-gray-600 mb-6">
                  Book your first dance session to get started on your journey!
                </p>
                <Link href="/book-session">
                  <Button>Book a Session</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
