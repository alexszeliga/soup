import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * React Error Boundary to catch rendering failures in sub-components.
 * 
 * Specifically intended to isolate metadata rendering issues in TorrentCards
 * so that a single bad TMDB match doesn't crash the entire dashboard.
 */
class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-6 bg-red-50 rounded-2xl border border-red-100 flex flex-col items-center justify-center gap-3 text-red-600">
          <AlertTriangle size={32} />
          <p className="font-medium text-sm">Rendering failed for this section</p>
          <button 
            onClick={() => this.setState({ hasError: false })}
            className="text-xs underline"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
