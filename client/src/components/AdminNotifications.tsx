import { useEffect } from 'react';
import { useAdminNotifications, AdminNotification } from '@/hooks/useAdminNotifications';
import { toast } from 'sonner';
import { Bell, UserPlus, Calendar, DollarSign, MessageSquare } from 'lucide-react';

const notificationIcons = {
  booking: Calendar,
  registration: UserPlus,
  purchase: DollarSign,
  testimonial: MessageSquare,
};

export function AdminNotifications() {
  const handleNotification = (notification: AdminNotification) => {
    const Icon = notificationIcons[notification.type] || Bell;
    
    toast(notification.title, {
      description: notification.message,
      duration: 5000,
      icon: <Icon className="h-4 w-4" />,
    });

    // Play notification sound
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Ignore errors if audio playback fails
      });
    } catch (error) {
      // Ignore errors
    }
  };

  const { isConnected } = useAdminNotifications(handleNotification);

  // Log connection status for debugging
  useEffect(() => {
    if (isConnected) {
      console.log('[Admin Notifications] Connected to real-time notification stream');
    }
  }, [isConnected]);

  // This component doesn't render anything visible
  return null;
}
