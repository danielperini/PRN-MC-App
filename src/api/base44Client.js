import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

if (!appId) {
  console.error('VITE_BASE44_APP_ID não configurado.');
}

export const base44 = createClient({
  appId,
  token: token || undefined,
  functionsVersion,
  serverUrl: '',
  requiresAuth: true,
  appBaseUrl,
});
