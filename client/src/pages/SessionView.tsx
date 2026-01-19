import { useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Video, Clock, CheckCircle, ArrowLeft } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type SessionState = 'loading' | 'upcoming' | 'ready' | 'live' | 'ended' | 'error';

export default function SessionView() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [, navigate] = useLocation();
  
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [timeUntilStart, setTimeUntilStart] = useState('');
  
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);
  const zoomSDKRef = useRef<any>(null);
  
  // Fetch booking details with slot information
  const { data: bookings, isLoading } = trpc.bookings.myBookings.useQuery();
  const booking = bookings?.find(b => b.id === parseInt(bookingId!));
  
  const joinMutation = trpc.zoom.getSignature.useMutation();
  
  // Dynamically load Zoom SDK only when needed
  const loadZoomSDK = async () => {
    if (zoomSDKRef.current) return zoomSDKRef.current;
    
    try {
      const ZoomModule = await import('@zoom/meetingsdk/embedded');
      zoomSDKRef.current = ZoomModule.default;
      return ZoomModule.default;
    } catch (error) {
      console.error('Failed to load Zoom SDK:', error);
      throw new Error('Failed to load Zoom SDK');
    }
  };
  
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
  
  // Initialize and join Zoom meeting
  const handleJoinSession = async () => {
    if (!booking?.slot?.zoomMeetingId) {
      setErrorMessage('Meeting information is not available');
      setSessionState('error');
      return;
    }
    
    try {
      setSessionState('loading');
      
      // Load Zoom SDK dynamically
      const ZoomMtgEmbedded = await loadZoomSDK();
      
      // Get signature from backend
      const signatureData = await joinMutation.mutateAsync({
        meetingNumber: booking.slot.zoomMeetingId,
        role: '0', // Participant
      });
      
      // Initialize Zoom SDK
      const client = ZoomMtgEmbedded.createClient();
      clientRef.current = client;
      
      // Initialize the embedded view
      await client.init({
        zoomAppRoot: zoomContainerRef.current!,
        language: 'en-US',
        patchJsMedia: true,
        leaveOnPageUnload: true,
      });
      
      // Join the meeting
      await client.join({
        signature: signatureData.signature,
        sdkKey: signatureData.sdkKey,
        meetingNumber: signatureData.meetingNumber,
        password: signatureData.password,
        userName: signatureData.userName,
        userEmail: signatureData.userEmail,
        tk: '', // Registration token (not needed)
      });
      
      setSessionState('live');
      
    } catch (error: any) {
      console.error('Failed to join session:', error);
      setErrorMessage(error.message || 'Failed to join session. Please try again.');
      setSessionState('error');
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        try {
          clientRef.current.leaveMeeting();
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    };
  }, []);
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-purple-100">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!booking || !booking.slot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-purple-100 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-center mb-2">Session Not Found</h2>
            <p className="text-muted-foreground text-center mb-4">
              This session does not exist or you don't have access to it.
            </p>
            <Button onClick={() => navigate('/my-sessions')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // Check if session is online
  if (booking.slot.eventType !== 'online') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-purple-100 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <AlertCircle className="h-12 w-12 text-amber-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-center mb-2">In-Person Session</h2>
            <p className="text-muted-foreground text-center mb-4">
              This is an in-person session at: <strong>{booking.slot.location}</strong>
            </p>
            <Button onClick={() => navigate('/my-sessions')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to My Sessions
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-purple-100">
      {/* Session Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{booking.slot.title || 'Online Session'}</h1>
              <p className="text-muted-foreground">
                {new Date(booking.slot.startTime).toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate('/my-sessions')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="container py-8">
        {/* Upcoming State */}
        {sessionState === 'upcoming' && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <Clock className="h-16 w-16 text-primary mx-auto mb-4" />
              <CardTitle className="text-2xl">Session Starts Soon</CardTitle>
              <CardDescription>
                You can join this session 15 minutes before it starts.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-lg font-medium text-primary mb-4">
                Time until session: {timeUntilStart}
              </p>
              {booking.slot.description && (
                <div className="mt-6 pt-6 border-t text-left">
                  <h3 className="font-semibold mb-2">Session Details</h3>
                  <p className="text-muted-foreground">{booking.slot.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Ready to Join State */}
        {sessionState === 'ready' && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <Video className="h-16 w-16 text-green-600 mx-auto mb-4" />
              <CardTitle className="text-2xl">Ready to Join</CardTitle>
              <CardDescription>
                Your session is ready. Click the button below to join.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                size="lg" 
                onClick={handleJoinSession}
                disabled={joinMutation.isPending}
                className="px-8 bg-green-600 hover:bg-green-700"
              >
                {joinMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Video className="h-5 w-5 mr-2" />
                    Join Session
                  </>
                )}
              </Button>
              
              {booking.slot.description && (
                <div className="mt-6 pt-6 border-t text-left">
                  <h3 className="font-semibold mb-2">Session Details</h3>
                  <p className="text-muted-foreground">{booking.slot.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Loading State */}
        {sessionState === 'loading' && (
          <Card className="max-w-2xl mx-auto">
            <CardContent className="py-12 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <p className="text-lg font-medium">Connecting to session...</p>
              <p className="text-muted-foreground mt-2">Please wait while we connect you to the session</p>
            </CardContent>
          </Card>
        )}
        
        {/* Live Session State */}
        {sessionState === 'live' && (
          <div className="max-w-7xl mx-auto">
            <Alert className="mb-4 bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                You're now in the live session. Enjoy your dance class!
              </AlertDescription>
            </Alert>
            
            {/* Zoom Embedded Container */}
            <div 
              ref={zoomContainerRef}
              className="w-full bg-black rounded-lg overflow-hidden shadow-2xl"
              style={{ height: 'calc(100vh - 250px)', minHeight: '600px' }}
            />
          </div>
        )}
        
        {/* Ended State */}
        {sessionState === 'ended' && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <CheckCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <CardTitle className="text-2xl">Session Ended</CardTitle>
              <CardDescription>
                This session has ended. Thank you for attending!
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button onClick={() => navigate('/my-sessions')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Sessions
              </Button>
            </CardContent>
          </Card>
        )}
        
        {/* Error State */}
        {sessionState === 'error' && (
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="text-center">
              <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
              <CardTitle className="text-2xl">Unable to Join Session</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 justify-center">
                <Button variant="outline" onClick={() => navigate('/my-sessions')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to My Sessions
                </Button>
                <Button onClick={handleJoinSession}>
                  Try Again
                </Button>
              </div>
              
              {/* Fallback: Open in Zoom App */}
              {booking.slot.zoomJoinUrl && (
                <div className="mt-6 pt-6 border-t text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Having trouble? Open the session in the Zoom app:
                  </p>
                  <Button 
                    variant="secondary"
                    onClick={() => window.open(booking.slot!.zoomJoinUrl!, '_blank')}
                  >
                    Open in Zoom App
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
