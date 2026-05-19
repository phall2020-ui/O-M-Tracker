import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorPanelProps {
  message: string;
  detail?: string;
  onRetry?: () => void;
}

export function ErrorPanel({ message, detail, onRetry }: ErrorPanelProps) {
  return (
    <div className="error-panel" role="alert">
      <div className="error-panel-icon">
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="error-panel-body">
        <strong>{message}</strong>
        <p>{detail || 'Check the connection and try again. Existing page controls remain available where possible.'}</p>
      </div>
      {onRetry && (
        <button type="button" className="secondary-action error-panel-action" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      )}
    </div>
  );
}
