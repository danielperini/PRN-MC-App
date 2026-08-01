import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.warn('[SectionErrorBoundary]', this.props.title || 'Seção', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-5 py-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-amber-700">
            {this.props.title ? <span className="font-medium">{this.props.title}: </span> : null}
            Esta seção encontrou um problema e foi ocultada temporariamente.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-1 text-xs text-amber-600 underline underline-offset-2 hover:text-amber-800"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}