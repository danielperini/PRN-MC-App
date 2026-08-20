import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';
import { validateUserAccess, recoverExistingUserAccess, normalizeEmail } from '@/utils/auth/recoverExistingUserAccess';
import { trackUserLoginOnce } from '@/lib/userLoginMonitoring';

const AuthContext = createContext();

async function probeLocalSession() {
  try {
    const res = await fetch(`/api/apps/${encodeURIComponent(appParams.appId || '')}/entities/Notification?limit=1`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-App-Id': appParams.appId || '' },
      cache: 'no-store',
    });
    if (res.ok) return true;
    if (res.status === 401 || res.status === 403) return false;
    return null;
  } catch (error) {
    console.warn('Local session probe failed:', error);
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

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

        const res = await fetch(`/api/apps/public/prod/public-settings/by-id/${appParams.appId}`, {
          headers,
          credentials: 'include',
          cache: 'no-store',
        });

        if (res.ok) {
          const publicSettings = await res.json();
          setAppPublicSettings(publicSettings);

          if (appParams.token) {
            await checkUserAuth();
          } else {
            // The migrated installation authenticates with the HttpOnly
            // appgestor_session cookie, not a Base44 access_token. Do not
            // mark the user as logged out merely because the token is null.
            const localSession = await probeLocalSession();
            if (localSession === true) {
              setIsAuthenticated(true);
              setIsLoadingAuth(false);
            } else if (localSession === false) {
              setIsAuthenticated(false);
              setAuthError({ type: 'auth_required', message: 'Authentication required' });
              setIsLoadingAuth(false);
            } else {
              // Keep the old behavior only when the local installation cannot
              // be reached at all; this avoids an authentication redirect loop.
              setIsAuthenticated(false);
              setIsLoadingAuth(false);
            }
          }
          setIsLoadingPublicSettings(false);
        } else {
          const errorData = await res.json().catch(() => ({}));
          const reason = errorData?.extra_data?.reason;

          if (res.status === 403 && reason) {
            if (reason === 'auth_required') {
              const localSession = await probeLocalSession();
              if (localSession === true) {
                setIsAuthenticated(true);
                setAuthError(null);
              } else {
                setAuthError({ type: 'auth_required', message: 'Authentication required' });
              }
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
      const localSession = await probeLocalSession();
      if (localSession === true) {
        setAuthError(null);
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        if (error.status === 401 || error.status === 403) {
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
      }
      setIsLoadingAuth(false);
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) {
      base44.auth.logout(window.location.href);
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
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