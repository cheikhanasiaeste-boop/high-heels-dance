import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAdaptiveTextStyling } from "@/hooks/useAdaptiveTextStyling";
import "@/styles/adaptiveText.css";

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
  
  // Analyze image and get adaptive styling
  const { textColorClass, gradientClass, overlayOpacity, isAnalyzing } = useAdaptiveTextStyling(
    settings?.imageUrl
  );

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

  // Determine if we should use image-based layout
  const hasImage = settings.imageUrl;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleDismiss();
    }}>
      <DialogContent 
        className="sm:max-w-2xl p-0 overflow-hidden border-0 gap-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{settings.title}</DialogTitle>
        {hasImage ? (
          // Image-based popup with adaptive text overlay
          <div className="relative min-h-[400px] sm:min-h-[500px] flex items-center justify-center">
            {/* Background image */}
            <img 
              src={settings.imageUrl!} 
              alt="" 
              className="absolute inset-0 w-full h-full object-cover"
            />
            
            {/* Adaptive gradient overlay (only if needed for contrast) */}
            <div 
              className={`absolute inset-0 ${gradientClass}`}
              style={{ 
                '--overlay-opacity': overlayOpacity 
              } as React.CSSProperties}
            />
            
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/20 hover:bg-black/30 backdrop-blur-sm transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-white drop-shadow-lg" />
            </button>
            
            {/* Content with adaptive text styling */}
            <div className="relative z-10 px-8 py-12 max-w-xl mx-auto text-center adaptive-text-content">
              <div className={`space-y-4 adaptive-text-animated ${textColorClass}`}>
                {/* Title */}
                <h2 className="popup-heading">
                  {settings.title}
                </h2>
                
                {/* Message */}
                <div className="popup-description">
                  {settings.message}
                </div>
                
                {/* Email input and buttons */}
                <div className="space-y-3 pt-4">
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
                        className="bg-white/95 backdrop-blur-sm border-white/20 text-gray-900 placeholder:text-gray-500 h-12 text-base"
                      />
                    </div>
                  )}
                  
                  <div className="flex gap-3">
                    {settings.showEmailInput ? (
                      <>
                        <Button 
                          onClick={handleEmailSubmit} 
                          disabled={!email} 
                          className="flex-1 h-12 text-base font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-lg"
                        >
                          {settings.buttonText}
                        </Button>
                        <Button 
                          onClick={handleDismiss} 
                          variant="outline"
                          className="h-12 text-base font-medium bg-white/90 hover:bg-white backdrop-blur-sm border-white/30 text-gray-900"
                        >
                          Maybe Later
                        </Button>
                      </>
                    ) : (
                      <Button 
                        onClick={handleDismiss} 
                        className="w-full h-12 text-base font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-lg"
                      >
                        {settings.buttonText}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Standard popup without image (fallback)
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-gray-900">
                  {settings.title}
                </h2>
                <div className="text-gray-600">
                  {settings.message}
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            
            <div className="space-y-3">
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
