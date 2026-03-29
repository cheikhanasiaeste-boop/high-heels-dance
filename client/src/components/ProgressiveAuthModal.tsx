import { AuthModal } from './AuthModal';

interface ProgressiveAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  context: 'booking' | 'course';
  contextDetails?: string;
}

const contextPrompts: Record<ProgressiveAuthModalProps['context'], string> = {
  booking: 'Sign in to manage your dance sessions and receive booking confirmations.',
  course: 'Sign in to access your course materials and track your progress.',
};

export function ProgressiveAuthModal({ isOpen, onClose, context, contextDetails }: ProgressiveAuthModalProps) {
  const prompt = contextDetails
    ? `${contextPrompts[context]} — ${contextDetails}`
    : contextPrompts[context];

  return <AuthModal isOpen={isOpen} onClose={onClose} prompt={prompt} />;
}
