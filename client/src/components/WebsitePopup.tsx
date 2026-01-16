import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PopupSettings {
  id: number;
  enabled: boolean;
  title: string;
  message: string;
  imageUrl: string | null;
  buttonText: string;
  showEmailInput: boolean;
  emailPlaceholder: string | null;
  backgroundColor: string | null;
  textColor: string | null;
}

interface WebsitePopupProps {
  settings: PopupSettings | null;
  onDismiss: (popupId: number) => void;
  onEmailSubmit: (popupId: number, email: string) => void;
}

export function WebsitePopup({ settings, onDismiss, onEmailSubmit }: WebsitePopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (settings && settings.enabled) {
      // Check if user has already seen this popup
      const seenKey = `popup_seen_${settings.id}`;
      const hasSeen = localStorage.getItem(seenKey);
      
      if (!hasSeen) {
        // Show popup after a short delay
        const timer = setTimeout(() => {
          setIsOpen(true);
        }, 1000);
        
        return () => clearTimeout(timer);
      }
    }
  }, [settings]);

  const handleDismiss = () => {
    if (settings) {
      setIsOpen(false);
      localStorage.setItem(`popup_seen_${settings.id}`, 'true');
      onDismiss(settings.id);
    }
  };

  const handleEmailSubmit = () => {
    if (settings && email) {
      setIsOpen(false);
      localStorage.setItem(`popup_seen_${settings.id}`, 'true');
      onEmailSubmit(settings.id, email);
      setEmail('');
    }
  };

  if (!settings || !settings.enabled) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleDismiss();
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{settings.title}</DialogTitle>
          <DialogDescription>
            {settings.message}
          </DialogDescription>
        </DialogHeader>
        
        {settings.imageUrl && (
          <div className="flex justify-center">
            <img 
              src={settings.imageUrl} 
              alt="Popup" 
              className="max-w-full max-h-64 rounded-lg object-contain"
            />
          </div>
        )}
        
        <div className="space-y-4">
          {settings.showEmailInput && (
            <div className="space-y-2">
              <Input
                type="email"
                placeholder={settings.emailPlaceholder || 'Enter your email'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email) {
                    handleEmailSubmit();
                  }
                }}
              />
            </div>
          )}
          
          <div className="flex gap-2">
            {settings.showEmailInput ? (
              <>
                <Button onClick={handleEmailSubmit} disabled={!email} className="flex-1">
                  {settings.buttonText}
                </Button>
                <Button onClick={handleDismiss} variant="outline">
                  Maybe Later
                </Button>
              </>
            ) : (
              <Button onClick={handleDismiss} className="w-full">
                {settings.buttonText}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
