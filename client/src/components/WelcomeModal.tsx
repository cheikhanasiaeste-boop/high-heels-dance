import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar, MessageCircle, BookOpen, Sparkles } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

export function WelcomeModal({ isOpen, onClose, userName }: WelcomeModalProps) {
  const features = [
    {
      icon: Calendar,
      title: 'Book Dance Sessions',
      description: 'Schedule private or group classes at times that work for you'
    },
    {
      icon: BookOpen,
      title: 'Access Your Courses',
      description: 'View your enrolled courses and track your progress'
    },
    {
      icon: MessageCircle,
      title: 'Stay Connected',
      description: 'Receive updates, confirmations, and messages from instructors'
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">Welcome to High Heels Dance</DialogTitle>
        </DialogHeader>
        {/* Header with Sparkle Icon */}
        <div className="flex flex-col items-center text-center pt-2 pb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 animate-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Welcome{userName ? `, ${userName.split(' ')[0]}` : ''}! 🎉
          </h2>
          <p className="text-muted-foreground mt-2 text-base">
            You're all set to start your high heels dance journey
          </p>
        </div>

        {/* Features Grid */}
        <div className="space-y-4 py-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="flex items-start gap-4 p-4 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100 hover:border-purple-200 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Icon className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <div className="pt-4 pb-2">
          <Button
            onClick={onClose}
            size="lg"
            className="w-full text-base font-semibold"
          >
            Let's Get Started
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-3">
            You can access your profile and settings anytime from the menu
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
