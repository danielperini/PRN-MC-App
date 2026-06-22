import { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Hook unificado de análise de documentos.
 * 
 * Estados dos campos:
 * - 'vazio'           → nunca preenchido
 * - 'preenchido_ia'   → preenchido pela IA com alta confiança
 * - 'sugerido_ia'     → sugerido pela IA, aguarda confirmação
 * - 'confirmado'      → usuário confirmou o valor
 * - 'manual'          → usuário alterou manualmente
 */

export const FIELD_STATE = {
  VAZIO: 'vazio',
  PREENCHIDO_IA: 'preenchido_ia',
  SUGERIDO_IA: 'sugerido_ia',
  CONFIRMADO: 'confirmado',
  MANUAL: 'manual',
};

const STATE_LABELS = {
  [FIELD_STATE.VAZIO]: 'Vazio',
  [FIELD_STATE.PREENCHIDO_IA]: 'IA (auto)',
  [FIELD_STATE.SUGERIDO_IA]: 'Sugestão IA',
  [FIELD_STATE.CONFIRMADO]: 'Confirmado',
  [FIELD_STATE.MANUAL]: 'Manual',
};

const STATE_COLORS = {
  [FIELD_STATE.VAZIO]: 'text-gray-400',
  [FIELD_STATE.PREENCHIDO_IA]: 'text-blue-600',
  [FIELD_STATE.SUGERIDO_IA]: 'text-amber-600',
  [FIELD_STATE.CONFIRMADO]: 'text-green-600',
  [FIELD_STATE.MANUAL]: 'text-purple-600',
};

export function getFieldStateLabel(state) {
  return STATE_LABELS[state] || state;
}

export function getFieldStateColor(state) {
  return STATE_COLORS[state] || 'text-gray-400';
}

export default function useDocumentAnalysis() {
  const [analisando, setAnalisando] = useState(false);
  const [dadosAnalise, setDadosAnalise] = useState(null); // { campos: {...}, resumo: {...} }
  const [erro, setErro] = useState(null);
  const [fieldStates, setFieldStates] = useState({});
  const abortRef = useRef(false);

  /**
   * Analisa documentos e retorna dados estruturados.
   * @param {Object} opts
   * @param {string[]} opts.fileUrls - URLs dos arquivos
   * @param {Object} opts.contexto - Dados existentes do formulário
   * @param {Object} opts.camposConfirmados - { campo: true }
   */
  const analisar = useCallback(async ({ fileUrls = [], contexto = {}, camposConfirmados = {} }) => {
    abortRef.current = false;
    setAnalisando(true);
    setErro(null);

    try {
      const allUrls = [];
      const add = (u) => { if (u && typeof u === 'string' && u.startsWith('http')) allUrls.push(u); };
      for (const u of (Array.isArray(fileUrls) ? fileUrls : [])) add(u);
      add(contexto.nf_pdf_url);
      add(contexto.nota_fiscal_url);
      add(contexto.arquivo_url);
      add(contexto.file_url);
      add(contexto.documento_url);
      add(contexto.orcamento_url);
      add(contexto.comprovante_url);
      add(contexto.nf_xml_url);

      if (!allUrls.length) {
        setDadosAnalise({ campos: {}, resumo: { preenchidos: 0, sugeridos: 0, nao_localizados: 0 } });
        setAnalisando(false);
        return null;
      }

      const res = await base44.functions.invoke('analisarDocumentosUnificado', {
        file_urls: [...new Set(allUrls)],
        contexto,
        campos_confirmados: camposConfirmados,
      });

      if (abortRef.current) return null;

      const data = res?.data || res;
      setDadosAnalise(data);

      // Inicializar fieldStates
      const states = {};
      if (data?.campos) {
        for (const [key, campo] of Object.entries(data.campos)) {
          states[key] = campo?.estado || FIELD_STATE.PREENCHIDO_IA;
        }
      }
      setFieldStates(states);

      return data;
    } catch (e) {
      if (!abortRef.current) setErro(e?.message || 'Erro na análise');
      return null;
    } finally {
      if (!abortRef.current) setAnalisando(false);
    }
  }, []);

  /** Confirma um campo sugerido */
  const confirmarCampo = useCallback((campo) => {
    setFieldStates(prev => ({ ...prev, [campo]: FIELD_STATE.CONFIRMADO }));
  }, []);

  /** Marca campo como alterado manualmente */
  const marcarManual = useCallback((campo) => {
    setFieldStates(prev => ({ ...prev, [campo]: FIELD_STATE.MANUAL }));
  }, []);

  /** Reanalisa preservando campos confirmados/manuais */
  const reanalisar = useCallback((opts) => {
    const confirmados = {};
    for (const [key, state] of Object.entries(fieldStates)) {
      if (state === FIELD_STATE.CONFIRMADO || state === FIELD_STATE.MANUAL) {
        confirmados[key] = true;
      }
    }
    return analisar({ ...opts, camposConfirmados: confirmados });
  }, [fieldStates, analisar]);

  /** Cancela análise em andamento */
  const cancelar = useCallback(() => {
    abortRef.current = true;
    setAnalisando(false);
  }, []);

  /** Reseta tudo */
  const resetar = useCallback(() => {
    abortRef.current = true;
    setAnalisando(false);
    setDadosAnalise(null);
    setErro(null);
    setFieldStates({});
  }, []);

  return {
    analisando,
    dadosAnalise,
    erro,
    fieldStates,
    analisar,
    confirmarCampo,
    marcarManual,
    reanalisar,
    cancelar,
    resetar,
  };
}