import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { CARD_BASE } from '@/lib/styleTokens';
import { cn } from '@/lib/utils';

class SectionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[SectionErrorBoundary]', this.props.title || 'Seção', error, info);
  }

  reset() {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) this.props.onRetry();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={cn(CARD_BASE, 'border-amber-200 bg-amber-50 p-4 flex items-start gap-3', this.props.className)}>
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">
              {this.props.title ? `"${this.props.title}" não pôde ser carregada` : 'Esta seção não pôde ser carregada'}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Tente novamente ou recarregue a página.</p>
          </div>
          <button
            onClick={this.reset}
            className="shrink-0 flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <RotateCw className="w-3 h-3" />
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;