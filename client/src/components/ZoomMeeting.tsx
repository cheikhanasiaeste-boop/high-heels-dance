import { useEffect, useRef, useState } from "react";
import ZoomMtgEmbedded from "@zoom/meetingsdk/embedded";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Loader2, Video, X } from "lucide-react";
import { toast } from "sonner";

interface ZoomMeetingProps {
  bookingId: number;
  onClose?: () => void;
}

/**
 * Zoom Web Meeting SDK Component
 * 
 * Embeds a Zoom meeting directly in the website using the Zoom Web Meeting SDK.
 * 
 * Security features:
 * - No Zoom URL is ever exposed or accessible
 * - SDK signature is generated server-side and expires in 60 seconds
 * - Access is controlled by backend (auth, booking verification, time window)
 * - Meeting can only be joined from this website
 */
export function ZoomMeeting({ bookingId, onClose }: ZoomMeetingProps) {
  const meetingContainerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isJoined, setIsJoined] = useState(false);

  const joinMutation = trpc.zoom.join.useMutation();

  useEffect(() => {
    let client: any = null;

    async function initializeZoomSDK() {
      try {
        setIsLoading(true);
        setError(null);

        // 1. Get SDK credentials from backend
        const credentials = await joinMutation.mutateAsync({ bookingId });

        // 2. Initialize Zoom Web Meeting SDK
        client = ZoomMtgEmbedded.createClient();

        const meetingSDKElement = meetingContainerRef.current;
        if (!meetingSDKElement) {
          throw new Error("Meeting container not found");
        }

        // 3. Initialize SDK
        await client.init({
          zoomAppRoot: meetingSDKElement,
          language: "en-US",
          patchJsMedia: true,
          leaveOnPageUnload: true,
        });

        // 4. Join meeting with SDK signature
        await client.join({
          sdkKey: credentials.sdkKey,
          signature: credentials.signature,
          meetingNumber: credentials.meetingNumber.toString(),
          userName: credentials.userName,
          userEmail: credentials.userEmail,
          tk: "", // Registration token (not needed)
          zak: "", // Zoom access token (not needed for SDK)
        });

        setIsJoined(true);
        setIsLoading(false);

        toast.success("Joined Zoom meeting successfully!");
      } catch (err: any) {
        console.error("Failed to join Zoom meeting:", err);
        setError(err.message || "Failed to join meeting");
        setIsLoading(false);
        
        toast.error(err.message || "Failed to join meeting");
      }
    }

    initializeZoomSDK();

    // Cleanup on unmount
    return () => {
      if (client && isJoined) {
        try {
          client.leaveMeeting();
        } catch (err) {
          console.error("Error leaving meeting:", err);
        }
      }
    };
  }, [bookingId]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] p-8 bg-gray-50 rounded-lg">
        <div className="text-center max-w-md">
          <div className="mb-4 text-red-500">
            <Video className="w-16 h-16 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Unable to Join Meeting</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          {onClose && (
            <Button onClick={onClose} variant="outline">
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[600px]">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 rounded-lg z-10">
          <Loader2 className="w-12 h-12 animate-spin text-purple-600 mb-4" />
          <p className="text-gray-600">Connecting to Zoom meeting...</p>
          <p className="text-sm text-gray-500 mt-2">Please wait while we set up your session</p>
        </div>
      )}
      
      {/* Zoom SDK Container */}
      <div 
        ref={meetingContainerRef} 
        className="w-full h-full min-h-[600px] rounded-lg overflow-hidden"
        style={{ display: isLoading ? "none" : "block" }}
      />
      
      {/* Close button (only show when joined) */}
      {isJoined && onClose && (
        <Button
          onClick={onClose}
          variant="outline"
          size="sm"
          className="absolute top-4 right-4 z-20 bg-white/90 hover:bg-white"
        >
          <X className="w-4 h-4 mr-2" />
          Leave Meeting
        </Button>
      )}
    </div>
  );
}
