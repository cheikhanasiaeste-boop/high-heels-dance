import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Video, Clock, CheckCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type SessionState = 'loading' | 'upcoming' | 'ready' | 'live' | 'ended' | 'error';

export default function SessionView() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [, navigate] = useLocation();
  
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [timeUntilStart, setTimeUntilStart] = useState('');
  const [showMeetEmbed, setShowMeetEmbed] = useState(false);
  
  // Fetch booking details with slot information
  const { data: bookings, isLoading } = trpc.bookings.myBookings.useQuery();
  const booking = bookings?.find(b => b.id === parseInt(bookingId!));
  
  // Check session state and time window
  useEffect(() => {
    if (!booking || !booking.slot) return;
    
    const checkSessionState = () => {
      const now = Date.now();
      const sessionStart = new Date(booking.slot!.startTime).getTime();
      const sessionEnd = new Date(booking.slot!.endTime).getTime();
      const fifteenMinutesBefore = sessionStart - 15 * 60 * 1000;
      
      if (now > sessionEnd) {
        setSessionState('ended');
      } else if (now >= fifteenMinutesBefore && now <= sessionEnd) {
        setSessionState('ready');
      } else {
        setSessionState('upcoming');
        
        // Calculate time until session
        const minutesUntil = Math.floor((sessionStart - now) / 1000 / 60);
        const hoursUntil = Math.floor(minutesUntil / 60);
        
        if (hoursUntil > 0) {
          setTimeUntilStart(`${hoursUntil}h ${minutesUntil % 60}m`);
        } else {
          setTimeUntilStart(`${minutesUntil}m`);
        }
      }
    };
    
    checkSessionState();
    const interval = setInterval(checkSessionState, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [booking]);
  
  // Handle joining session - show embedded Meet
  const handleJoinSession = () => {
    if (!booking?.slot?.meetLink) {
      setErrorMessage('Meeting link is not available');
      setSessionState('error');
      return;
    }
    
    setShowMeetEmbed(true);
    setSessionState('live');
  };
  
  // Handle opening in new tab
  const handleOpenInNewTab = () => {
    if (booking?.slot?.meetLink) {
      window.open(booking.slot.meetLink, '_blank');
    }
  };
  
  if (isLoading || !booking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-12 flex flex-col items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-purple-600 mb-4" />
            <p className="text-lg text-gray-600">Loading session details...</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const slot = booking.slot;
  
  if (!slot) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-12">
            <Alert variant="destructive">
              <AlertCircle className="h-5 w-5" />
              <AlertDescription>Session information not found</AlertDescription>
            </Alert>
            <Button onClick={() => navigate('/my-sessions')} className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to My Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Show embedded Google Meet
  if (showMeetEmbed && slot.meetLink) {
    return (
      <div className="h-screen w-screen flex flex-col bg-black">
        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowMeetEmbed(false);
                setSessionState('ready');
              }}
              className="text-white hover:bg-gray-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Exit Session
            </Button>
            <div>
              <h2 className="font-semibold">{slot.title}</h2>
              <p className="text-sm text-gray-400">
                {new Date(slot.startTime).toLocaleString()} - {new Date(slot.endTime).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenInNewTab}
            className="bg-transparent border-gray-600 text-white hover:bg-gray-800"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Open in New Tab
          </Button>
        </div>
        <iframe
          src={slot.meetLink}
          allow="camera; microphone; fullscreen; speaker; display-capture"
          className="flex-1 w-full border-0"
          title="Google Meet Session"
        />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/my-sessions')}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to My Sessions
        </Button>
        
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
            <CardTitle className="text-2xl">{slot.title}</CardTitle>
            <CardDescription className="text-purple-100">
              {slot.description || 'Dance session with Elizabeth Zolotova'}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-6 space-y-6">
            {/* Session Details */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Session Time</p>
                  <p className="text-sm text-gray-600">
                    {new Date(slot.startTime).toLocaleString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="text-sm text-gray-500">
                    Duration: {Math.round((new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()) / 1000 / 60)} minutes
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Video className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Session Type</p>
                  <p className="text-sm text-gray-600">
                    {slot.eventType === 'online' ? 'Online via Google Meet' : 'In-Person'}
                  </p>
                  {slot.eventType === 'in-person' && slot.location && (
                    <p className="text-sm text-gray-500">{slot.location}</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Session State UI */}
            {sessionState === 'upcoming' && (
              <Alert className="border-blue-200 bg-blue-50">
                <Clock className="h-5 w-5 text-blue-600" />
                <AlertDescription className="text-blue-900">
                  <p className="font-medium mb-1">Session starts in {timeUntilStart}</p>
                  <p className="text-sm">You can join 15 minutes before the start time.</p>
                </AlertDescription>
              </Alert>
            )}
            
            {sessionState === 'ready' && slot.eventType === 'online' && (
              <div className="space-y-4">
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <AlertDescription className="text-green-900">
                    <p className="font-medium">Ready to join!</p>
                    <p className="text-sm">Click the button below to enter the session.</p>
                  </AlertDescription>
                </Alert>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleJoinSession}
                    size="lg"
                    className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    <Video className="mr-2 h-5 w-5" />
                    Join Session (Embedded)
                  </Button>
                  
                  {slot.meetLink && (
                    <Button
                      onClick={handleOpenInNewTab}
                      variant="outline"
                      size="lg"
                      className="flex-1"
                    >
                      <ExternalLink className="mr-2 h-5 w-5" />
                      Open in New Tab
                    </Button>
                  )}
                </div>
                
                {slot.meetLink && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 mb-2">Direct Meeting Link:</p>
                    <a
                      href={slot.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-purple-600 hover:text-purple-700 underline break-all"
                    >
                      {slot.meetLink}
                    </a>
                  </div>
                )}
              </div>
            )}
            
            {sessionState === 'ended' && (
              <Alert>
                <AlertCircle className="h-5 w-5" />
                <AlertDescription>
                  This session has ended. Thank you for attending!
                </AlertDescription>
              </Alert>
            )}
            
            {sessionState === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-5 w-5" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            
            {/* Booking Details */}
            {booking.notes && (
              <div className="pt-4 border-t">
                <p className="font-medium text-gray-900 mb-2">Your Notes</p>
                <p className="text-sm text-gray-600">{booking.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
