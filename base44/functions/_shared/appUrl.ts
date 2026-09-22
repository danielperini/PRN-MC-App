/**
 * Retorna a URL pública do app publicado.
 *
 * Usa, em ordem de preferência:
 * 1. Variável/secret `APP_URL` (configurada no Dashboard → Secrets)
 * 2. Origem da requisição atual (funciona tanto para chamadas
 *    vindas do frontend quanto para invocações agendadas, pois ambas
 *    rodam no mesmo domínio do app publicado).
 *
 * O fallback é o domínio de produção do Gestor Museus. Isso impede links
 * relativos ou inválidos (`http:///...`) em execuções agendadas, que não
 * carregam uma origem HTTP completa.
 */
const FALLBACK_APP_URL = 'https://appgestor.periniprojetos.com.br';

function validPublicUrl(value: unknown): string {
  try {
    const parsed = new URL(String(value || '').trim());
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

export function getAppUrl(req?: Request | null): string {
  try {
    const fromSecret = validPublicUrl(Deno.env.get("APP_URL"));
    if (fromSecret) return fromSecret;
    if (req) {
      const fromReq = validPublicUrl(req.url);
      if (fromReq && !/^https?:\/\/localhost/i.test(fromReq)) {
        return fromReq;
      }
    }
  } catch {
    // ignore e retorna vazio
  }
  return FALLBACK_APP_URL;
}

/**
 * Constrói um link absoluto para uma rota do app.
 * A base sempre é absoluta: e-mails não devem depender do host do cliente.
 */
export function buildAppLink(req: Request | null, path: string): string {
  const base = getAppUrl(req);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}
