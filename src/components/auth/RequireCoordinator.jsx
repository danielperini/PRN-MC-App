import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function RequireCoordinator({ children, permission = null, fallback = null }) {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (!isAuth) {
          base44.auth.redirectToLogin();
          return;
        }

        const user = await base44.auth.me();
        if (!user) {
          base44.auth.redirectToLogin();
          return;
        }

        // Verificar se é coordenador ou admin
        const isCoordinator = user.role === 'COORDENADOR' || user.role === 'ADMIN';
        
        if (!isCoordinator) {
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }

        // Se requer permissão específica, verificar também
        if (permission) {
          const permissions = await base44.asServiceRole.entities.UserPermission.filter(
            { user_email: user.email },
            '-updated_date',
            1
          );

          const userPerm = permissions[0];
          if (!userPerm || !userPerm[permission]) {
            setIsAuthorized(false);
            setIsLoading(false);
            return;
          }
        }

        setIsAuthorized(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [permission]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Verificando acesso...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Erro ao verificar permissões: {error}</AlertDescription>
      </Alert>
    );
  }

  if (!isAuthorized) {
    return fallback || (
      <div className="space-y-4">
        <Alert variant="destructive" className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Acesso restrito. Apenas coordenadores podem acessar este módulo.
          </AlertDescription>
        </Alert>
        <div className="text-center py-8">
          <p className="text-gray-600">Entre em contato com um administrador para solicitar acesso.</p>
        </div>
      </div>
    );
  }

  return children;
}