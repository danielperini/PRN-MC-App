/**
 * Serviço Centralizado de Cache - Museus Centro
 * 
 * Gerencia todos os caches localStorage/sessionStorage da aplicação
 * de forma unificada, facilitando limpeza e manutenção.
 */

import { CACHE_KEYS, CACHE_CONFIG } from '@/utils/constants';

class CacheService {
  constructor() {
    this.prefix = 'museus_centro_';
  }

  // ============================================================================
  // MÉTODOS GENÉRICOS
  // ============================================================================

  /**
   * Salva valor no localStorage
   */
  set(key, value, ttlMs = null) {
    try {
      const payload = {
        value,
        savedAt: Date.now(),
        ttl: ttlMs
      };
      localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.warn('CacheService.set error:', error);
      return false;
    }
  }

  /**
   * Recupera valor do localStorage
   */
  get(key) {
    try {
      const raw = localStorage.getItem(`${this.prefix}${key}`);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      
      // Verificar TTL
      if (parsed.ttl && Date.now() - parsed.savedAt > parsed.ttl) {
        this.remove(key);
        return null;
      }

      return parsed.value;
    } catch (error) {
      console.warn('CacheService.get error:', error);
      return null;
    }
  }

  /**
   * Remove valor do localStorage
   */
  remove(key) {
    try {
      localStorage.removeItem(`${this.prefix}${key}`);
      return true;
    } catch (error) {
      console.warn('CacheService.remove error:', error);
      return false;
    }
  }

  /**
   * Verifica se chave existe e está válida
   */
  has(key) {
    return this.get(key) !== null;
  }

  // ============================================================================
  // CACHE DE PERMISSÕES
  // ============================================================================

  savePermission(email, permission) {
    const key = `user_permission_${this.normalizeEmail(email)}`;
    return this.set(key, permission, CACHE_CONFIG.PERMISSION_CACHE_TTL_MS);
  }

  getPermission(email) {
    const key = `user_permission_${this.normalizeEmail(email)}`;
    return this.get(key);
  }

  clearPermission(email) {
    const key = `user_permission_${this.normalizeEmail(email)}`;
    return this.remove(key);
  }

  // ============================================================================
  // CACHE DE RELATÓRIOS
  // ============================================================================

  saveRelatoriosList(reports) {
    return this.set(CACHE_KEYS.RELATORIOS_LIST, reports, 10 * 60 * 1000); // 10 min
  }

  getRelatoriosList() {
    return this.get(CACHE_KEYS.RELATORIOS_LIST);
  }

  clearRelatoriosList() {
    return this.remove(CACHE_KEYS.RELATORIOS_LIST);
  }

  // ============================================================================
  // CACHE DE DASHBOARD
  // ============================================================================

  saveDashboardUpdate(timestamp) {
    return this.set(CACHE_KEYS.DASHBOARD_UPDATE, timestamp, 60 * 60 * 1000); // 1 hora
  }

  getDashboardUpdate() {
    return this.get(CACHE_KEYS.DASHBOARD_UPDATE);
  }

  saveDashboardViewMode(mode) {
    return this.set(CACHE_KEYS.DASHBOARD_VIEW_MODE, mode, null); // Sem TTL
  }

  getDashboardViewMode() {
    return this.get(CACHE_KEYS.DASHBOARD_VIEW_MODE);
  }

  clearDashboardViewMode() {
    return this.remove(CACHE_KEYS.DASHBOARD_VIEW_MODE);
  }

  // ============================================================================
  // CACHE DE RELATÓRIO FÍSICO-FINANCEIRO
  // ============================================================================

  saveRelatorioFisicoFinanceiroHtml(html) {
    return this.set(CACHE_KEYS.RELATORIOS_FISICO_FINANCEIRO_HTML, html, 30 * 60 * 1000); // 30 min
  }

  getRelatorioFisicoFinanceiroHtml() {
    return this.get(CACHE_KEYS.RELATORIOS_FISICO_FINANCEIRO_HTML);
  }

  saveRelatorioFisicoFinanceiroMeta(meta) {
    return this.set(CACHE_KEYS.RELATORIOS_FISICO_FINANCEIRO_META, meta, 30 * 60 * 1000);
  }

  getRelatorioFisicoFinanceiroMeta() {
    return this.get(CACHE_KEYS.RELATORIOS_FISICO_FINANCEIRO_META);
  }

  saveRelatorioPreviewConfig(config) {
    this.set(CACHE_KEYS.RELATORIO_PREVIEW_SELECTED_CHAPTERS, config.selectedChapters);
    this.set(CACHE_KEYS.RELATORIO_PREVIEW_ALL_CHAPTERS, config.allChapters);
    this.set(CACHE_KEYS.RELATORIO_PREVIEW_EXPORT_MODE, config.exportMode);
    this.set(CACHE_KEYS.RELATORIO_PREVIEW_EXPORT_VOLUME, config.exportVolume);
  }

  getRelatorioPreviewConfig() {
    return {
      selectedChapters: this.get(CACHE_KEYS.RELATORIO_PREVIEW_SELECTED_CHAPTERS),
      allChapters: this.get(CACHE_KEYS.RELATORIO_PREVIEW_ALL_CHAPTERS),
      exportMode: this.get(CACHE_KEYS.RELATORIO_PREVIEW_EXPORT_MODE),
      exportVolume: this.get(CACHE_KEYS.RELATORIO_PREVIEW_EXPORT_VOLUME)
    };
  }

  // ============================================================================
  // LIMPEZA DE CACHE
  // ============================================================================

  /**
   * Limpa todos os caches de relatórios
   */
  clearAllRelatorios() {
    const keys = [
      CACHE_KEYS.RELATORIOS_LIST,
      CACHE_KEYS.RELATORIOS_FISICO_FINANCEIRO_HTML,
      CACHE_KEYS.RELATORIOS_FISICO_FINANCEIRO_META,
      CACHE_KEYS.RELATORIOS_FISICO_FINANCEIRO_DADOS_HTML,
      CACHE_KEYS.RELATORIOS_FISICO_FINANCEIRO_GALERIA_HTML,
      CACHE_KEYS.RELATORIO_PREVIEW_SELECTED_CHAPTERS,
      CACHE_KEYS.RELATORIO_PREVIEW_ALL_CHAPTERS,
      CACHE_KEYS.RELATORIO_PREVIEW_EXPORT_MODE,
      CACHE_KEYS.RELATORIO_PREVIEW_EXPORT_VOLUME
    ];

    keys.forEach(key => this.remove(key));
    return true;
  }

  /**
   * Limpa todos os caches de dashboard
   */
  clearAllDashboard() {
    const keys = [
      CACHE_KEYS.DASHBOARD_UPDATE,
      CACHE_KEYS.DASHBOARD_VIEW_MODE,
      CACHE_KEYS.NEWS_HIGHLIGHT_CACHE_V2,
      CACHE_KEYS.NEWS_HIGHLIGHT_CACHE_V3
    ];

    keys.forEach(key => this.remove(key));
    return true;
  }

  /**
   * Limpa todos os caches de permissões
   */
  clearAllPermissions() {
    try {
      const keys = Object.keys(localStorage);
      const permissionKeys = keys.filter(k => k.includes('user_permission_'));
      permissionKeys.forEach(k => localStorage.removeItem(k));
      return true;
    } catch (error) {
      console.warn('CacheService.clearAllPermissions error:', error);
      return false;
    }
  }

  /**
   * Hard refresh - limpa TODOS os caches do sistema
   */
  hardRefresh() {
    try {
      const keys = Object.keys(localStorage);
      const museusKeys = keys.filter(k => k.includes(this.prefix));
      
      museusKeys.forEach(k => {
        try {
          localStorage.removeItem(k);
        } catch (e) {
          console.warn('Falha ao remover cache:', k, e);
        }
      });

      // Disparar evento de atualização
      window.dispatchEvent(new CustomEvent('dashboard:update'));
      
      return { ok: true, cleared: museusKeys.length };
    } catch (error) {
      console.error('CacheService.hardRefresh error:', error);
      return { ok: false, error: error.message };
    }
  }

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  /**
   * Retorna estatísticas de uso de cache
   */
  getStats() {
    try {
      const keys = Object.keys(localStorage);
      const museusKeys = keys.filter(k => k.includes(this.prefix));
      
      let totalSize = 0;
      const breakdown = {};

      museusKeys.forEach(key => {
        try {
          const value = localStorage.getItem(key);
          const size = (value?.length || 0) * 2; // bytes aproximados
          totalSize += size;
          
          // Categorizar
          const category = key.split('_')[1] || 'other';
          breakdown[category] = (breakdown[category] || 0) + size;
        } catch (e) {
          // Ignorar
        }
      });

      return {
        totalKeys: museusKeys.length,
        totalSizeBytes: totalSize,
        totalSizeKB: Math.round(totalSize / 1024),
        breakdown
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

// Exportar instância singleton
export const cacheService = new CacheService();

// Exportar classe para testes
export { CacheService };