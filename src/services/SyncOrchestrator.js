/**
 * SyncOrchestrator.js
 * Barramento canônico de eventos de sincronização do Museus Centro.
 *
 * Substitui os window.dispatchEvent dispersos por uma API com log centralizado.
 * Para compatibilidade retroativa, SyncOrchestrator.emit() também despacha
 * o window.dispatchEvent correspondente, preservando todos os listeners antigos.
 *
 * Eventos suportados (mapeados para compatibilidade):
 *   rubricas:sync          → window event "rubricas:sync"
 *   rubricas:recalculadas  → window event "rubricas:recalculadas"
 *   purchase:changed       → window event "purchase:changed"
 *   dashboard:update       → window event "dashboard:update"
 *   notas-drive:sync       → window event "notas-drive:sync"
 *   gallery:sync           → window event "gallery:sync"
 */

const KNOWN_EVENTS = new Set([
  'rubricas:sync',
  'rubricas:recalculadas',
  'purchase:changed',
  'dashboard:update',
  'notas-drive:sync',
  'gallery:sync',
]);

const _handlers = new Map(); // event → Set<handler>
const _log = [];             // histórico de eventos emitidos (últimos 100)
const MAX_LOG = 100;

const SyncOrchestrator = {
  /**
   * Emite um evento para os listeners registrados E para window.dispatchEvent.
   * @param {string} evento
   * @param {any} [payload]
   */
  emit(evento, payload) {
    if (!KNOWN_EVENTS.has(evento)) {
      console.warn(`[SyncOrchestrator] Evento desconhecido: "${evento}". Emitindo mesmo assim.`);
    }

    const entry = { evento, payload, ts: new Date().toISOString() };
    _log.push(entry);
    if (_log.length > MAX_LOG) _log.shift();

    // Compatibilidade retroativa: despacha window event
    try {
      window.dispatchEvent(new CustomEvent(evento, { detail: payload }));
    } catch (_) {
      // ambiente sem window (testes) — ignora
    }

    // Notifica listeners registrados via .on()
    const handlers = _handlers.get(evento);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload, entry);
        } catch (err) {
          console.error(`[SyncOrchestrator] Erro no handler de "${evento}":`, err);
        }
      });
    }
  },

  /**
   * Registra um listener para um evento.
   * @param {string} evento
   * @param {Function} handler (payload, { evento, ts }) => void
   * @returns {Function} unsub — chame para remover o listener
   */
  on(evento, handler) {
    if (!_handlers.has(evento)) _handlers.set(evento, new Set());
    _handlers.get(evento).add(handler);
    return () => {
      _handlers.get(evento)?.delete(handler);
    };
  },

  /**
   * Remove um handler específico de um evento.
   * @param {string} evento
   * @param {Function} handler
   */
  off(evento, handler) {
    _handlers.get(evento)?.delete(handler);
  },

  /**
   * Invalida queries do React Query pelo escopo informado.
   * @param {import('@tanstack/react-query').QueryClient} queryClient
   * @param {'rubricas'|'compras'|'dashboard'|'galeria'|'all'} escopo
   */
  invalidateQueries(queryClient, escopo = 'all') {
    if (!queryClient) return;
    const scopeMap = {
      rubricas: [['Rubrica'], ['rubrica'], ['rubricas']],
      compras: [['PurchaseRequest'], ['compras'], ['purchase']],
      dashboard: [['dashboard'], ['relatorios'], ['atividades']],
      galeria: [['galeria'], ['ReportPhoto'], ['Attachment']],
      all: [[]],
    };
    const keys = scopeMap[escopo] || [[]];
    keys.forEach((key) => {
      try {
        queryClient.invalidateQueries({ queryKey: key });
      } catch (_) {}
    });
  },

  /**
   * Retorna o log dos últimos eventos emitidos (somente leitura).
   * @returns {Array<{evento: string, payload: any, ts: string}>}
   */
  getLog() {
    return [..._log];
  },

  /** Lista de eventos suportados */
  EVENTS: Object.freeze({
    RUBRICAS_SYNC: 'rubricas:sync',
    RUBRICAS_RECALCULADAS: 'rubricas:recalculadas',
    PURCHASE_CHANGED: 'purchase:changed',
    DASHBOARD_UPDATE: 'dashboard:update',
    NOTAS_DRIVE_SYNC: 'notas-drive:sync',
    GALLERY_SYNC: 'gallery:sync',
  }),
};

export default SyncOrchestrator;