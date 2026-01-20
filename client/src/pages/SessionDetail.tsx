import { useAuth } from '@/_core/hooks/useAuth';
import { Link, useRoute, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Clock, MapPin, Video, Calendar, User, Target } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState } from 'react';
import { MapView } from '@/components/Map';

export default function SessionDetail() {
  const [, params] = useRoute('/session/:bookingId');
  const [, navigate] = useLocation();
  const bookingId = params?.bookingId ? parseInt(params.bookingId) : null;

  const { data, isLoading, error } = trpc.bookings.getSessionDetail.useQuery(
    { bookingId: bookingId! },
    { enabled: !!bookingId }
  );

  const [sessionState, setSessionState] = useState<'upcoming' | 'live' | 'completed' | 'cancelled'>('upcoming');
  const [zoomClient, setZoomClient] = useState<any>(null);

  // Calculate session state
  useEffect(() => {
    if (!data?.slot) return;

    const updateState = () => {
      if (data.booking.status === 'cancelled') {
        setSessionState('cancelled');
        return;
      }

      const now = new Date();
      const sessionStart = new Date(data.slot.startTime);
      const sessionEnd = new Date(data.slot.endTime);
      const joinWindowStart = new Date(sessionStart.getTime() - 15 * 60 * 1000); // 15 min before

      if (now > sessionEnd) {
        setSessionState('completed');
      } else if (now >= joinWindowStart && now <= sessionEnd) {
        setSessionState('live');
      } else {
        setSessionState('upcoming');
      }
    };

    updateState();
    const interval = setInterval(updateState, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [data]);

  // Helper function to get badge variant based on state
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

  // Calculate session duration in minutes
  const getSessionDuration = () => {
    if (!data?.slot) return 0;
    const start = new Date(data.slot.startTime);
    const end = new Date(data.slot.endTime);
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  };

  // Handle Join Session button click
  const handleJoinSession = async () => {
    if (data?.slot?.eventType === 'online' && data.slot.meetLink) {
      // Navigate to SessionView page for Google Meet embed
      navigate(`/session-view/${bookingId}`);
    }
  };

  // Handle Add to Calendar
  const handleAddToCalendar = () => {
    if (!data?.slot) return;

    const start = new Date(data.slot.startTime);
    const end = new Date(data.slot.endTime);
    
    // Format dates for Google Calendar
    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const title = encodeURIComponent(data.slot.title);
    const description = encodeURIComponent(data.slot.description || 'Dance session');
    const location = encodeURIComponent(data.slot.location || 'Online');
    const startDate = formatDate(start);
    const endDate = formatDate(end);

    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startDate}/${endDate}&details=${description}&location=${location}`;
    
    window.open(googleCalendarUrl, '_blank');
  };

  if (!bookingId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-red-600">Invalid session ID</p>
            <Link href="/my-bookings">
              <Button className="mt-4">Back to My Sessions</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b bg-white sticky top-0 z-50">
          <div className="container py-4">
            <Link href="/my-bookings">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to My Sessions
              </Button>
            </Link>
          </div>
        </header>
        <div className="container py-8 flex items-center justify-center">
          <p className="text-gray-600">Loading session details...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b bg-white sticky top-0 z-50">
          <div className="container py-4">
            <Link href="/my-bookings">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to My Sessions
              </Button>
            </Link>
          </div>
        </header>
        <div className="container py-8 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <p className="text-red-600 mb-4">
                {error?.message || 'Session not found or you do not have access'}
              </p>
              <Link href="/my-bookings">
                <Button>Back to My Sessions</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { booking, slot } = data;
  const isOnline = slot.eventType === 'online';
  const isJoinable = sessionState === 'live' && isOnline && slot.meetLink;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container py-4">
          <Link href="/my-bookings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to My Sessions
            </Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content Area (70%) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Session Header */}
            <Card>
              <CardHeader>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-2xl">{slot.title}</CardTitle>
                    <Badge className={getStateBadgeClass(sessionState)} variant="outline">
                      {sessionState === 'live' && '🟢 '}
                      {sessionState.charAt(0).toUpperCase() + sessionState.slice(1)}
                    </Badge>
                    <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>
                      {booking.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span className="font-medium">
                      {new Date(slot.startTime).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}{' '}
                      at{' '}
                      {new Date(slot.startTime).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </CardHeader>
              {slot.description && (
                <CardContent>
                  <p className="text-gray-700 leading-relaxed">{slot.description}</p>
                </CardContent>
              )}
            </Card>

            {/* Embedded Content Area */}
            <Card>
              <CardContent className="pt-6">
                {isOnline ? (
                  <div className="space-y-4">
                    {isJoinable ? (
                      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-8 text-center border-2 border-purple-200">
                        <Video className="w-16 h-16 mx-auto mb-4 text-purple-600" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                          Session is Live! 🎉
                        </h3>
                        <p className="text-gray-600 mb-6">
                          Your instructor is ready. Click below to join the session.
                        </p>
                        <Button
                          size="lg"
                          className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg"
                          onClick={handleJoinSession}
                        >
                          <Video className="w-5 h-5 mr-2" />
                          Join Session Now
                        </Button>
                      </div>
                    ) : sessionState === 'upcoming' ? (
                      <div className="bg-blue-50 rounded-lg p-8 text-center border-2 border-blue-200">
                        <Clock className="w-16 h-16 mx-auto mb-4 text-blue-600" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                          Session Starts Soon
                        </h3>
                        <p className="text-gray-600 mb-4">
                          The join button will appear 15 minutes before the session starts.
                        </p>
                        <p className="text-sm text-gray-500">
                          Make sure you have a stable internet connection and your camera/microphone ready.
                        </p>
                      </div>
                    ) : sessionState === 'completed' ? (
                      <div className="bg-gray-50 rounded-lg p-8 text-center border-2 border-gray-200">
                        <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                          Session Completed
                        </h3>
                        <p className="text-gray-600">
                          This session has ended. Thank you for attending!
                        </p>
                      </div>
                    ) : (
                      <div className="bg-red-50 rounded-lg p-8 text-center border-2 border-red-200">
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                          Session Cancelled
                        </h3>
                        <p className="text-gray-600">
                          This session has been cancelled.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-purple-600" />
                      Session Location
                    </h3>
                    <div className="bg-gray-100 rounded-lg p-4 mb-4">
                      <p className="font-medium text-gray-900">{slot.location}</p>
                    </div>
                    {/* Placeholder for Google Maps - will be implemented with actual coordinates */}
                    <div className="bg-gray-200 rounded-lg h-96 flex items-center justify-center">
                      <div className="text-center">
                        <MapPin className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                        <p className="text-gray-600">Map view coming soon</p>
                        <p className="text-sm text-gray-500 mt-2">
                          Please use the address above for directions
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Side Panel (30%) */}
          <div className="space-y-6">
            {/* Session Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  📋 Session Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Type</p>
                  <p className="font-medium flex items-center gap-2">
                    {isOnline ? (
                      <>
                        <Video className="w-4 h-4 text-purple-600" />
                        🌐 Online
                      </>
                    ) : (
                      <>
                        <MapPin className="w-4 h-4 text-purple-600" />
                        📍 In-person
                      </>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Duration</p>
                  <p className="font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-600" />
                    {getSessionDuration()} minutes
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">
                    {isOnline ? 'Platform' : 'Location'}
                  </p>
                  <p className="font-medium">
                    {isOnline ? 'Zoom' : slot.location}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Session Format</p>
                  <p className="font-medium flex items-center gap-2">
                    <User className="w-4 h-4 text-purple-600" />
                    {slot.sessionType === 'private' ? 'Private (1-on-1)' : `Group (up to ${slot.capacity})`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  🎯 Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {isJoinable && (
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="lg"
                    onClick={handleJoinSession}
                  >
                    <Video className="w-4 h-4 mr-2" />
                    Join Session
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleAddToCalendar}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Add to Calendar
                </Button>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="mailto:support@example.com">
                    <Target className="w-4 h-4 mr-2" />
                    Contact Support
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
