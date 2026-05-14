import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log interno com timestamp e ID único
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.error(`[${errorId}]`, error, errorInfo);

    // Salvar no localStorage para debug
    try {
      const logs = JSON.parse(localStorage.getItem('app_error_logs') || '[]');
      logs.push({
        id: errorId,
        message: error?.message,
        stack: error?.stack,
        component: errorInfo?.componentStack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
      });
      // Manter apenas últimos 20 erros
      localStorage.setItem('app_error_logs', JSON.stringify(logs.slice(-20)));
    } catch (e) {
      console.error('Erro ao salvar log:', e);
    }

    this.setState({
      error,
      errorInfo,
      errorId,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-white border border-red-100 rounded-2xl shadow-sm p-8 space-y-6">
            {/* Ícone de erro */}
            <div className="flex justify-center">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            {/* Mensagem */}
            <div className="text-center space-y-2">
              <h1 className="text-xl font-semibold text-slate-900">
                Tivemos um problema ao carregar esta página
              </h1>
              <p className="text-sm text-slate-500">
                Isso às vezes acontece. Tente recarregar ou volte ao painel para continuar.
              </p>
            </div>

            {/* ID do erro (para debug) */}
            {this.state.errorId && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <p className="text-xs text-slate-500 font-medium">ID do erro:</p>
                <p className="text-xs text-slate-700 font-mono break-all">{this.state.errorId}</p>
              </div>
            )}

            {/* Mensagem técnica (apenas em dev) */}
            {import.meta.env.DEV && this.state.error && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 max-h-48 overflow-auto">
                <p className="text-xs text-red-700 font-mono whitespace-pre-wrap break-words">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            {/* Ações */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={this.handleReset}
                className="flex-1 gap-2 bg-slate-900 hover:bg-slate-800 text-white"
              >
                <RefreshCw className="w-4 h-4" />
                Tentar novamente
              </Button>
              <Button
                onClick={this.handleHome}
                variant="outline"
                className="flex-1 gap-2"
              >
                <Home className="w-4 h-4" />
                Voltar ao painel
              </Button>
            </div>

            {/* Link para reload completo */}
            <button
              onClick={this.handleReload}
              className="w-full text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
            >
              Recarregar página completamente
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;