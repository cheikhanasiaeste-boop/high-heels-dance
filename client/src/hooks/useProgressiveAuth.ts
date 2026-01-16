import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';

interface AuthContext {
  context: 'booking' | 'course';
  contextDetails?: string;
  timestamp: number;
}

interface UseProgressiveAuthReturn {
  isAuthModalOpen: boolean;
  authContext: 'booking' | 'course' | null;
  authContextDetails: string | undefined;
  requireAuth: (context: 'booking' | 'course', contextDetails?: string, onSuccess?: () => void) => void;
  closeAuthModal: () => void;
  checkAndResumeFlow: () => void;
}

export function useProgressiveAuth(): UseProgressiveAuthReturn {
  const { isAuthenticated } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authContext, setAuthContext] = useState<'booking' | 'course' | null>(null);
  const [authContextDetails, setAuthContextDetails] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Check if there's a pending action after authentication
  const checkAndResumeFlow = useCallback(() => {
    const storedContext = sessionStorage.getItem('auth_return_context');
    if (storedContext && isAuthenticated) {
      try {
        const parsed: AuthContext = JSON.parse(storedContext);
        
        // Check if context is still valid (within 30 minutes)
        const isValid = Date.now() - parsed.timestamp < 30 * 60 * 1000;
        
        if (isValid) {
          // Resume the flow based on context
          if (parsed.context === 'booking') {
            // Navigate to booking page or trigger booking completion
            console.log('Resuming booking flow:', parsed.contextDetails);
            // You can emit an event or use a callback here
          } else if (parsed.context === 'course') {
            // Navigate to course or trigger course access
            console.log('Resuming course access:', parsed.contextDetails);
          }
        }
        
        // Clear the stored context
        sessionStorage.removeItem('auth_return_context');
      } catch (error) {
        console.error('Failed to parse auth context:', error);
        sessionStorage.removeItem('auth_return_context');
      }
    }
  }, [isAuthenticated]);

  // Check for pending flow on mount and when auth status changes
  useEffect(() => {
    checkAndResumeFlow();
  }, [isAuthenticated, checkAndResumeFlow]);

  // Require authentication before proceeding with an action
  const requireAuth = useCallback(
    (context: 'booking' | 'course', contextDetails?: string, onSuccess?: () => void) => {
      if (isAuthenticated) {
        // User is already authenticated, proceed immediately
        onSuccess?.();
      } else {
        // Show auth modal
        setAuthContext(context);
        setAuthContextDetails(contextDetails);
        setIsAuthModalOpen(true);
        
        // Store the success callback
        if (onSuccess) {
          setPendingAction(() => onSuccess);
        }
      }
    },
    [isAuthenticated]
  );

  // Close auth modal
  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setAuthContext(null);
    setAuthContextDetails(undefined);
    setPendingAction(null);
  }, []);

  // Execute pending action when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && pendingAction) {
      pendingAction();
      setPendingAction(null);
      closeAuthModal();
    }
  }, [isAuthenticated, pendingAction, closeAuthModal]);

  return {
    isAuthModalOpen,
    authContext,
    authContextDetails,
    requireAuth,
    closeAuthModal,
    checkAndResumeFlow
  };
}
