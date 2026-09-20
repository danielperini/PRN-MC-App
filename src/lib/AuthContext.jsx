import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import '@/lib/sanitizeAuthRedirect';
import { appParams } from '@/lib/app-params';
import { validateUserAccess, recoverExistingUserAccess, normalizeEmail, syncUserAccessState } from '@/utils/auth/recoverExistingUserAccess';
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

// The application authenticates through the HttpOnly appgestor_session cookie.
// Resolve the user from that same session instead of letting legacy SDK state
// (which can belong to a previous browser login) choose the report author.
async function getLocalSessionUser() {
  const appId = encodeURIComponent(appParams.appId || '');
  if (!appId) return null;

  const res = await fetch(`/api/apps/${appId}/entities/User/me`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'X-App-Id': appParams.appId || '' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const currentUser = await res.json();
  const email = normalizeEmail(currentUser?.email);
  return email ? { ...currentUser, email } : null;
}

function navigateToLoginSafely() {
  if (typeof window === 'undefined' || window.location.pathname === '/login') return;
  window.location.assign('/login');
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

      if (typeof window !== 'undefined' && window.location.pathname === '/login') {
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        setIsLoadingPublicSettings(false);
        return;
      }

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
            const localSession = await probeLocalSession();
            if (localSession === true) {
              const localUser = await getLocalSessionUser();
              if (localUser) {
                const recovery = await syncUserAccessState(localUser, { origin: 'local-session' }).catch(() => null);
                const authenticatedUser = recovery?.recovered ? recovery.user : localUser;
                setUser(authenticatedUser);
                trackUserLoginOnce(authenticatedUser);
              }
              setIsAuthenticated(Boolean(localUser));
              setIsLoadingAuth(false);
            } else if (localSession === false) {
              setIsAuthenticated(false);
              setAuthError({ type: 'auth_required', message: 'Authentication required' });
              setIsLoadingAuth(false);
            } else {
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
                const localUser = await getLocalSessionUser();
                if (localUser) {
                  const recovery = await syncUserAccessState(localUser, { origin: 'local-session-public-settings' }).catch(() => null);
                  const authenticatedUser = recovery?.recovered ? recovery.user : localUser;
                  setUser(authenticatedUser);
                  setIsAuthenticated(true);
                  setAuthError(null);
                  trackUserLoginOnce(authenticatedUser);
                } else {
                  setIsAuthenticated(false);
                  setAuthError({ type: 'auth_required', message: 'Authentication required' });
                }
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
        const localUser = await getLocalSessionUser();
        if (localUser) {
          const recovery = await syncUserAccessState(localUser, { origin: 'local-session-auth-fallback' }).catch(() => null);
          const authenticatedUser = recovery?.recovered ? recovery.user : localUser;
          setUser(authenticatedUser);
          setAuthError(null);
          setIsAuthenticated(true);
          trackUserLoginOnce(authenticatedUser);
        } else {
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
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
      base44.auth.logout();
      navigateToLoginSafely();
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = navigateToLoginSafely;

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
      authChecked: !isLoadingAuth,
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
