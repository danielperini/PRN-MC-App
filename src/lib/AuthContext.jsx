import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { validateUserAccess, recoverExistingUserAccess, normalizeEmail } from '@/utils/auth/recoverExistingUserAccess';
import { trackUserLoginOnce } from '@/lib/userLoginMonitoring';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      try {
        const headers = { 'X-App-Id': appParams.appId };
        if (appParams.token) headers['Authorization'] = `Bearer ${appParams.token}`;

        const res = await fetch(`/api/apps/public/prod/public-settings/by-id/${appParams.appId}`, { headers });

        if (res.ok) {
          const publicSettings = await res.json();
          setAppPublicSettings(publicSettings);

          if (appParams.token) {
            await checkUserAuth();
          } else {
            setIsLoadingAuth(false);
            setIsAuthenticated(false);
          }
          setIsLoadingPublicSettings(false);
        } else {
          const errorData = await res.json().catch(() => ({}));
          const reason = errorData?.extra_data?.reason;

          if (res.status === 403 && reason) {
            if (reason === 'auth_required') {
              setAuthError({ type: 'auth_required', message: 'Authentication required' });
            } else if (reason === 'user_not_registered') {
              const recovery = await recoverExistingUserAccess(null, { origin: 'public-settings-user-not-registered' });
              if (recovery.recovered) {
                setUser(recovery.user);
                setIsAuthenticated(true);
                setAuthError(null);
                trackUserLoginOnce(recovery.user);
              } else {
                setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
              }
            } else {
              setAuthError({ type: reason, message: errorData.message || 'Access denied' });
            }
          } else {
            setAuthError({ type: 'unknown', message: errorData.message || 'Failed to load app' });
          }
          setIsLoadingPublicSettings(false);
          setIsLoadingAuth(false);
        }
      } catch (appError) {
        console.error('App state check failed:', appError);
        setAuthError({ type: 'unknown', message: appError.message || 'Failed to load app' });
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({ type: 'unknown', message: error.message || 'An unexpected error occurred' });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      const normalizedEmail = normalizeEmail(currentUser.email);
      const registrations = await base44.entities.UserRegistration
        .filter({ email: normalizedEmail })
        .catch(() => []);
      const approvedRegistration = Array.isArray(registrations)
        ? registrations.find((item) => item.status === 'APROVADO')
        : null;
      const latestRegistration = !approvedRegistration && Array.isArray(registrations)
        ? registrations.find((item) => item.status === 'PENDENTE' || item.status === 'REJEITADO') || null
        : null;

      const access = await validateUserAccess({ ...currentUser, email: normalizedEmail }, { origin: 'auth-context' });
      if (access.allowed) {
        const authenticatedUser = access.user || { ...currentUser, email: normalizedEmail };
        setUser(authenticatedUser);
        setIsAuthenticated(true);
        setIsLoadingAuth(false);
        trackUserLoginOnce(authenticatedUser);
        return;
      }

      if (latestRegistration && latestRegistration.status !== 'APROVADO') {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({
          type: 'user_not_registered',
          message: latestRegistration.status === 'REJEITADO'
            ? 'User registration rejected'
            : 'User registration pending approval',
        });
        setIsLoadingAuth(false);
        return;
      }

      const authenticatedUser = { ...currentUser, email: normalizedEmail };
      setUser(authenticatedUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      trackUserLoginOnce(authenticatedUser);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState,
      checkUserAuth,
      authChecked: !isLoadingAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};