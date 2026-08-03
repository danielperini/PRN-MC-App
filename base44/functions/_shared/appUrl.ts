/**
 * Retorna a URL pública do app publicado.
 *
 * Usa, em ordem de preferência:
 * 1. Variável/secret `APP_URL` (configurada no Dashboard → Secrets)
 * 2. Origem da requisição atual (funciona tanto para chamadas
 *    vindas do frontend quanto para invocações agendadas, pois ambas
 *    rodam no mesmo domínio do app publicado).
 *
 * Nunca hardcoded: nenhum subdomínio base44.app fixo, pois o app pode
 * ser republicado sob outro nome.
 */
export function getAppUrl(req?: Request | null): string {
  try {
    const fromSecret = Deno.env.get("APP_URL");
    if (fromSecret && /^https?:\/\//i.test(fromSecret)) {
      return fromSecret.replace(/\/$/, "");
    }
    if (req) {
      const fromReq = new URL(req.url).origin;
      if (fromReq && !/^https?:\/\/localhost/i.test(fromReq)) {
        return fromReq;
      }
    }
  } catch {
    // ignore e retorna vazio
  }
  return "";
}

/**
 * Constrói um link absoluto para uma rota do app.
 * Se a base não puder ser resolvida, retorna apenas o path relativo.
 */
export function buildAppLink(req: Request | null, path: string): string {
  const base = getAppUrl(req);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}