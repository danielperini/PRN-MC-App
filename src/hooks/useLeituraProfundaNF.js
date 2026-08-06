import { useCallback, useState } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * useLeituraProfundaNF
 * Hook leve para invocar a função backend `lerNotaFiscalGPT` (leitura integral
 * via OpenAI Structured Outputs). Não substitui nem altera o fluxo atual
 * de análise/aprovação — apenas expõe um caminho opcional de leitura profunda
 * de uma NF específica para depuração/validação.
 *
 * Uso:
 *   const { ler, carregando, erro } = useLeituraProfundaNF();
 *   const { resultado } = await ler({ intake_id: '...' });
 */
export default function useLeituraProfundaNF() {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);

  const ler = useCallback(async (params) => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await base44.functions.invoke('lerNotaFiscalGPT', params);
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || 'Falha na leitura');
      setResultado(data.resultado);
      return data;
    } catch (e) {
      setErro(e?.message || 'Erro na leitura profunda');
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResultado(null);
    setErro(null);
    setCarregando(false);
  }, []);

  return { ler, carregando, erro, resultado, reset };
}