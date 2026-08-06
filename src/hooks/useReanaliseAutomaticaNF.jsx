import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Extrai valor numérico de um nome de arquivo padronizado (ex: "123 - FORNECEDOR - MUSEUS CENTRO - R$ 1.234,56.pdf")
export function extrairValorDoNomeArquivo(fileName) {
  if (!fileName) return null;
  const raw = String(fileName);
  const match = raw.match(/R\$\s*([\d.,]+)\.[A-Za-z0-9]+$/i) || raw.match(/R\$\s*([\d.,]+)/i);
  if (!match) return null;
  const s = match[1].trim();
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.')) || null;
  if (/^\d+,\d{2}$/.test(s)) return Number(s.replace(',', '.')) || null;
  if (/^\d+\.\d{2}$/.test(s)) return Number(s) || null;
  return Number(s.replace(',', '.')) || null;
}

function normalizeDateToInput(value) {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

function dataIAValida(dataStr) {
  if (!dataStr) return false;
  const d = new Date(dataStr);
  if (isNaN(d.getTime())) return false;
  const hoje = new Date();
  const limite = new Date('2020-01-01');
  return d >= limite && d <= new Date(hoje.getTime() + 86400000);
}

export function buildNomePadronizado({ nf_numero, nf_emitente_nome, nf_valor_total }, fileOriginalName) {
  const numero = String(nf_numero || 'SEM-NUM').trim();
  const fornecedor = String(nf_emitente_nome || 'FORNECEDOR').trim().substring(0, 40).toUpperCase();
  const valorNum = Number(nf_valor_total) || 0;
  const valorFormatado = valorNum > 0
    ? valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : '0,00';
  const ext = (fileOriginalName || 'arquivo.pdf').split('.').pop()?.toLowerCase() || 'pdf';
  return `${numero} - ${fornecedor} - MUSEUS CENTRO - R$ ${valorFormatado}.${ext}`;
}

/**
 * Hook de reanálise automática da NF.
 * Verifica campos críticos vazios (nf_data_emissao, nf_emitente_cpf_cnpj) ou divergência
 * de valor entre nome de arquivo padronizado e nf_valor_total, e dispara reanálise via IA.
 *
 * @param {Object} intake - DocumentIntake original (não enriquecido)
 * @param {Object} formRef - estado atual do formulário { nf_valor_total, ... }
 * @param {Function} setForm - setter do formulário
 * @param {Function} getForm - função que retorna o form atual
 */
export function useReanaliseAutomaticaNF({ intake, getForm, setForm }) {
  const [status, setStatus] = useState('idle'); // idle | analisando | sucesso | falha
  const [camposAtualizados, setCamposAtualizados] = useState([]); // nomes dos campos atualizados pela IA
  const [municipioNaoEncontrado, setMunicipioNaoEncontrado] = useState(false);
  const autoReanalisouRef = useRef(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Detecta se precisa reanalisar ao montar
  useEffect(() => {
    if (autoReanalisouRef.current) return;
    if (!intake?.id) return;
    autoReanalisouRef.current = true;

    const dataEmissaoVazia = !intake.nf_data_emissao && !intake.resultado_ia?.nf_data_emissao && !intake.resultado_ia?.data_emissao;
    const cnpjVazio = !intake.nf_emitente_cpf_cnpj && !intake.resultado_ia?.nf_emitente_cpf_cnpj;
    const municipioVazio = !intake.municipio && !intake.resultado_ia?.municipio;

    // Divergência de valor entre nome do arquivo e nf_valor_total
    const valorNomeArquivo = extrairValorDoNomeArquivo(intake.file_name_final || intake.file_name_original);
    const valorCampo = Number(intake.nf_valor_total || intake.resultado_ia?.nf_valor_total || 0);
    let valorDivergente = false;
    if (valorNomeArquivo && valorCampo > 0) {
      const diff = Math.abs(valorNomeArquivo - valorCampo);
      valorDivergente = diff > valorCampo * 0.01; // > 1% de diferença
    }

    const precisaReanalisar = dataEmissaoVazia || cnpjVazio || valorDivergente || municipioVazio;
    if (!precisaReanalisar) return;

    setStatus('analisando');
    executarReanalise(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intake?.id]);

  async function executarReanalise() {
    const fileUrl = intake?.arquivo_original_url;
    if (!fileUrl) {
      setStatus('falha');
      return;
    }

    const timeoutMs = 60000;
    const startMs = Date.now();
    let done = false;

    timeoutRef.current = setTimeout(() => {
      if (!done) {
        done = true;
        setStatus('falha');
      }
    }, timeoutMs);

    try {
      await base44.functions.invoke('processarNotaFiscalComClaude', {
        intake_id: intake.id,
        file_url: fileUrl,
        orientacoes_usuario: '',
      });

      // Recarrega intake atualizado do banco
      const updated = await base44.entities.DocumentIntake.get(intake.id);
      const iaAtualizado = updated?.resultado_ia || {};

      const dataAtualizada = normalizeDateToInput(
        iaAtualizado.nf_data_emissao || iaAtualizado.data_emissao || iaAtualizado.dataEmissao || ''
      );
      const cnpjAtualizado = iaAtualizado.nf_emitente_cpf_cnpj || updated?.nf_emitente_cpf_cnpj || '';
      const valorAtualizado = iaAtualizado.nf_valor_total || updated?.nf_valor_total || '';
      const municipioAtualizado = iaAtualizado.municipio || updated?.municipio || '';

      // Município é campo não-bloqueante: mesmo que continue vazio, o status pode ser sucesso
      setMunicipioNaoEncontrado(!municipioAtualizado);

      // Verifica se a reanálise preencheu os campos críticos (município não bloqueia)
      const camposPreenchidos =
        (!dataEmissaoVaziaAntes() || dataIAValida(dataAtualizada)) &&
        (!cnpjVazioAntes() || cnpjAtualizado);

      // Aplica campos ao formulário
      const formAtual = getForm();
      const setParcial = (campo, valor) => {
        if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
          return { [campo]: valor };
        }
        return {};
      };

      const atualizacoes = {
        ...setParcial('nf_numero', iaAtualizado.nf_numero),
        ...setParcial('nf_valor_total', valorAtualizado),
        ...setParcial('nf_data_emissao', dataIAValida(dataAtualizada) ? dataAtualizada : undefined),
        ...setParcial('nf_emitente_nome', iaAtualizado.nf_emitente_nome),
        ...setParcial('nf_emitente_cpf_cnpj', cnpjAtualizado),
        ...setParcial('municipio', iaAtualizado.municipio),
        ...setParcial('descricao_servico', iaAtualizado.descricao_servico),
        ...setParcial('competencia', iaAtualizado.competencia),
        ...setParcial('nf_horario_emissao', iaAtualizado.nf_horario_emissao),
        ...setParcial('centro_custo', iaAtualizado.centro_custo_sugerido),
      };

      // Reconstrói nome padronizado com valores confirmados
      const nomePadronizado = buildNomePadronizado(
        { ...formAtual, ...atualizacoes },
        intake.file_name_original
      );

      setForm((f) => ({
        ...f,
        ...atualizacoes,
        file_name_final: nomePadronizado,
      }));

      // Persiste file_name_final no DocumentIntake
      await base44.entities.DocumentIntake.update(intake.id, {
        file_name_final: nomePadronizado,
      }).catch(() => {});

      // Identifica quais campos foram efetivamente preenchidos pela IA
      const camposNovos = Object.keys(atualizacoes).filter(
        (k) => atualizacoes[k] !== undefined && (!formAtual[k] || formAtual[k] !== atualizacoes[k])
      );

      if (camposPreenchidos && camposNovos.length > 0) {
        setStatus('sucesso');
        setCamposAtualizados(camposNovos);
        // Limpa destaque visual após 3 segundos
        setTimeout(() => setCamposAtualizados([]), 3000);
      } else {
        setStatus('falha');
      }

      done = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    } catch (e) {
      console.error('Erro na reanálise automática da NF:', e);
      if (!done) {
        done = true;
        setStatus('falha');
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    // Helpers para validar condições de entrada (capturadas no fechamento)
    function dataEmissaoVaziaAntes() {
      return !intake.nf_data_emissao && !intake.resultado_ia?.nf_data_emissao && !intake.resultado_ia?.data_emissao;
    }
    function cnpjVazioAntes() {
      return !intake.nf_emitente_cpf_cnpj && !intake.resultado_ia?.nf_emitente_cpf_cnpj;
    }
  }

  return {
    status,
    camposAtualizados,
    municipioNaoEncontrado,
    reanalisando: status === 'analisando',
    reanaliseSucesso: status === 'sucesso',
    reanaliseFalha: status === 'falha',
    reanaliseManual: executarReanalise,
  };
}