import { cn } from "@/lib/utils";
import { RotateCcw, Home } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-md text-center">
            <div className="text-6xl mb-6">😔</div>

            <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-8">
              We're sorry, an unexpected error occurred. Please try reloading the page.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => (window.location.href = "/")}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-full",
                  "bg-muted text-foreground",
                  "hover:bg-muted/80 transition-colors"
                )}
              >
                <Home size={16} />
                Go Home
              </button>
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-full",
                  "bg-[#C026D3] text-white",
                  "hover:bg-[#A21CAF] transition-colors"
                )}
              >
                <RotateCcw size={16} />
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
