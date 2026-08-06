import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, AlertCircle, CheckCircle2, Send, Trash2, SplitSquareHorizontal, BookOpen, ShieldCheck, RefreshCw, LinkIcon, Search, X, Sparkles, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { findDuplicatePurchaseRequest } from '@/lib/purchaseDuplicateGuard';
import DuplicatePurchaseDetectedModal from '@/components/compras/DuplicatePurchaseDetectedModal';
import { METAS_PROJETO } from '@/lib/metasProjeto';
import { useReanaliseAutomaticaNF } from '@/hooks/useReanaliseAutomaticaNF';


const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Noturno 2026', 'Noturno Pampulha', 'Atuação Geral'];
const MUSEUS_RATEIO = ['MHAB', 'MIS', 'MUMO'];
const DEFAULT_RATEIO = MUSEUS_RATEIO.map((m) => ({ museu: m, valor: '' }));

const COORD_EMAILS = [
  'danielperini.mc@viadutodasartes.org.br',
  'danie@periniprojetos.com.br',
];

function normalizeDateToInput(value) {
  if (!value) return '';

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoLike) {
    return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]}`;
  }

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  return '';
}

function getDataEmissaoFromIA(ia) {
  return (
    ia?.nf_data_emissao ||
    ia?.data_emissao ||
    ia?.dataEmissao ||
    ia?.emissao ||
    ia?.data_da_emissao ||
    ia?.dataNota ||
    ''
  );
}

// Extrai dados básicos do nome do arquivo como fallback quando IA não retornou dados suficientes
function extrairDadosDoNomeArquivo(fileName) {
  if (!fileName) return {};
  const nome = String(fileName).replace(/\.[^.]+$/, '');
  const result = {};

  // Tenta extrair número de NF: padrões como NF12345, NF-12345, Nota 12345, etc.
  const nfMatch = nome.match(/(?:NF|NFE|NFS|NOTA|RPS)[^0-9]*(\d{3,})/i);
  if (nfMatch) result.nf_numero = nfMatch[1];

  // Tenta extrair valor: padrões como R$ 1.234,56 ou R$1234,00
  const valorMatch = nome.match(/R\$\s*([\d.,]+)/i);
  if (valorMatch) result.nf_valor_total = valorMatch[1];

  // Tenta extrair CNPJ (14 dígitos) ou CPF (11 dígitos) do nome do arquivo
  const cnpjMatch = nome.match(/\b(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\.\s]?\d{4}[-\.\s]?\d{2})\b/);
  if (cnpjMatch) result.nf_emitente_cpf_cnpj = cnpjMatch[1].replace(/[^\d]/g, '');

  const cpfMatch = !cnpjMatch && nome.match(/\b(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2})\b/);
  if (cpfMatch) result.nf_emitente_cpf_cnpj = cpfMatch[1].replace(/[^\d]/g, '');

  // Tenta extrair mês/ano para data estimada: padrão "MM-YYYY" ou "MM/YYYY" no nome
  const mesAnoMatch = nome.match(/\b(0?[1-9]|1[0-2])[-\/](20\d{2})\b/);
  if (mesAnoMatch) {
    const mes = String(mesAnoMatch[1]).padStart(2, '0');
    const ano = mesAnoMatch[2];
    // Usa o último dia do mês como data estimada de emissão
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
    result.nf_data_emissao_fallback = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`;
  }

  // Usa o nome do arquivo como fornecedor fallback (sem extensão e sem número)
  const fornecedor = nome
    .replace(/NF[^0-9]*/gi, '')
    .replace(/\d{4,}/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (fornecedor) result.nf_emitente_nome_fallback = fornecedor;

  result.descricao_servico_fallback = `Documento: ${nome}`;

  return result;
}

// Auto-sugestão de rubrica por palavras-chave na descrição/fornecedor
function sugerirRubricaPorKeywords(texto, rubricas) {
  if (!texto || !rubricas || rubricas.length === 0) return null;
  const t = String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const KEYWORDS = [
    { keywords: ['educador', 'educacao', 'educativa', 'educativo', 'monitor'], termos: ['educador', 'educacao', 'educativo'] },
    { keywords: ['analista adm', 'analista administrativo', 'financeiro', 'administrativo financeiro'], termos: ['analista adm', 'administrativo', 'financeiro'] },
    { keywords: ['comunicacao', 'comunicador', 'comunicadora', 'midia', 'redes sociais', 'social media'], termos: ['comunicacao', 'comunicacao', 'midia'] },
    { keywords: ['producao', 'produtor', 'produtora', 'cultural'], termos: ['producao', 'producao cultural'] },
    { keywords: ['coordenador', 'coordenacao', 'gestor', 'gestora'], termos: ['coordenacao', 'coordenador', 'gestao'] },
    { keywords: ['fotografo', 'fotografia', 'foto', 'imagem'], termos: ['fotografia', 'foto', 'comunicacao'] },
    { keywords: ['designer', 'design grafico', 'identidade visual'], termos: ['design', 'comunicacao'] },
    { keywords: ['manutencao', 'limpeza', 'zeladoria', 'servicos gerais'], termos: ['manutencao', 'servicos gerais'] },
    { keywords: ['material', 'suprimento', 'insumo', 'material didatico'], termos: ['material', 'suprimento'] },
    { keywords: ['consultoria', 'consultor', 'assessoria', 'especialista'], termos: ['consultoria', 'assessoria'] },
    { keywords: ['alimentacao', 'refeicao', 'lanche', 'coffee'], termos: ['alimentacao', 'refeicao'] },
  ];

  for (const { keywords } of KEYWORDS) {
    if (keywords.some((k) => t.includes(k))) {
      // Busca rubrica que contenha algum dos termos
      const termosBusca = keywords;
      const encontrada = rubricas.find((r) => {
        const nomeR = String(r.rubrica || r.nome || r.descricao || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return termosBusca.some((k) => nomeR.includes(k));
      });
      if (encontrada) return encontrada.id;
    }
  }

  return null;
}

function dataIAValida(dataStr) {
  if (!dataStr) return false;
  const d = new Date(dataStr);
  if (isNaN(d.getTime())) return false;
  const hoje = new Date();
  const limite = new Date('2020-01-01');
  return d >= limite && d <= new Date(hoje.getTime() + 86400000);
}

export default function ReviewModalNF({ intake, onClose, onSaved, painelDadosIdentificados, isCoordenador }) {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSolicitarXmlPanel, setShowSolicitarXmlPanel] = useState(false);
  const [destinatariosDisponiveis, setDestinatariosDisponiveis] = useState([]);
  const [destinatariosSelecionados, setDestinatariosSelecionados] = useState(new Set());
  const [mensagemXml, setMensagemXml] = useState('');
  const [enviandoXml, setEnviandoXml] = useState(false);
  const [approvingDirect, setApprovingDirect] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [preenchendoIA, setPreenchendoIA] = useState(false);
  const [xmlCandidates, setXmlCandidates] = useState([]);
  const [selectedXmlId, setSelectedXmlId] = useState('');
  const [loadingXmls, setLoadingXmls] = useState(false);
  const [linkingXml, setLinkingXml] = useState(false);
  const [rubricas, setRubricas] = useState([]);
  const [rubricaBusca, setRubricaBusca] = useState('');
  const [rubricaDropdownOpen, setRubricaDropdownOpen] = useState(false);
  const [metasProjeto, setMetasProjeto] = useState([]);
  const [loadingMetas, setLoadingMetas] = useState(true);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [ignoreDuplicate, setIgnoreDuplicate] = useState(false);
  const rubricaRef = useRef(null);

  useEffect(() => {
    if (!rubricaDropdownOpen) return;
    function handleClick(e) {
      if (rubricaRef.current && !rubricaRef.current.contains(e.target)) {
        setRubricaDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [rubricaDropdownOpen]);

  const ia = intake.resultado_ia || {};
  const dataEmissaoIA = getDataEmissaoFromIA(ia);

  // Destrava documentos presos em ANALISANDO_IA ao abrir o modal
  useEffect(() => {
    const status = String(intake.status_processamento || '').toUpperCase();
    if (status === 'ANALISANDO_IA') {
      base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'AGUARDANDO_REVISAO',
        erros_validacao: ['IA não conseguiu concluir a análise. Revise manualmente.'],
      }).catch(() => {});
    }
  }, [intake.id, intake.status_processamento]);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const [dividirEntreMuseus, setDividirEntreMuseus] = useState(false);
  const [rateio, setRateio] = useState(DEFAULT_RATEIO);

  // Fallback: extrai dados do nome do arquivo se IA não preencheu campos essenciais
  const fallbackArquivo = extrairDadosDoNomeArquivo(intake.file_name_original);
  const iaIncompleta = !ia.nf_numero && !ia.nf_emitente_nome && !ia.nf_valor_total;

  const dataEmissaoNormalizada = normalizeDateToInput(dataEmissaoIA);
  const dataEmissaoFinal = dataIAValida(dataEmissaoNormalizada)
    ? dataEmissaoNormalizada
    : (fallbackArquivo.nf_data_emissao_fallback || '');

  const [form, setForm] = useState({
    nf_numero: ia.nf_numero || fallbackArquivo.nf_numero || '',
    nf_valor_total: ia.nf_valor_total || fallbackArquivo.nf_valor_total || '',
    nf_data_emissao: dataEmissaoFinal,
    nf_horario_emissao: ia.nf_horario_emissao || ia.horario_emissao || '',
    nf_emitente_nome: ia.nf_emitente_nome || fallbackArquivo.nf_emitente_nome_fallback || '',
    nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || fallbackArquivo.nf_emitente_cpf_cnpj || '',
    nf_destinatario_nome: ia.nf_destinatario_nome || '',
    descricao_servico: ia.descricao_servico || fallbackArquivo.descricao_servico_fallback || '',
    municipio: ia.municipio || intake.municipio || '',
    competencia: ia.competencia || ia.competencia_sugerida || '',
    centro_custo: ia.centro_custo_sugerido || intake.centro_custo || '',
    rubrica_id: intake.rubrica_id_sugerida || '',
    file_name_final: intake.file_name_final || intake.file_name_original,
    meta_id: '',
    tipo_gasto: ia.tipo_gasto || 'Serviço',
  });

  // Ref para capturar form atual sem stale closure no hook de reanálise
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);

  // Reanálise automática quando campos críticos estão vazios ou valor divergente
  const reanalise = useReanaliseAutomaticaNF({
    intake,
    getForm: () => formRef.current,
    setForm,
  });
  const reanaliseAtiva = reanalise.reanalisando;

  const abrirSolicitarXml = useCallback(async () => {
    setShowSolicitarXmlPanel(true);

    // Monta lista de destinatários: solicitante + membros do mesmo centro_custo
    const lista = [];
    const visto = new Set();

    const addEmail = (email, nome) => {
      if (!email || visto.has(email)) return;
      visto.add(email);
      lista.push({ email, nome: nome || email });
    };

    // Solicitante do intake
    addEmail(intake.user_email, intake.user_name);

    // TeamMembers do mesmo centro_custo ou fornecedor
    try {
      const cc = intake.centro_custo || ia.centro_custo_sugerido;
      const cnpj = form.nf_emitente_cpf_cnpj || ia.nf_emitente_cpf_cnpj;
      const [porCc, porCnpj] = await Promise.all([
        cc ? base44.entities.TeamMember.filter({ centro_custo: cc }, '', 50).catch(() => []) : [],
        cnpj ? base44.entities.TeamMember.filter({ cpf: cnpj }, '', 10).catch(() =>
          base44.entities.TeamMember.filter({ cnpj }, '', 10).catch(() => [])) : [],
      ]);
      [...(porCc || []), ...(porCnpj || [])].forEach(m => addEmail(m.user_email || m.email_pessoal, m.user_name));
    } catch {}

    setDestinatariosDisponiveis(lista);
    setDestinatariosSelecionados(new Set(lista.map(d => d.email)));

    // Monta mensagem padrão
    const linkBase = window.location.origin;
    const prId = intake.entidade_destino_id;
    const link = prId ? `${linkBase}/Compras?id=${prId}` : `${linkBase}/EntradaUnica`;
    const valor = form.nf_valor_total ? `R$ ${form.nf_valor_total}` : '—';
    const msg = `Olá,

Identificamos que a Nota Fiscal abaixo foi enviada sem o arquivo XML correspondente:

• Número da NF: ${form.nf_numero || '—'}
• Fornecedor: ${form.nf_emitente_nome || '—'}
• Valor: ${valor}
• Data de Emissão: ${form.nf_data_emissao || '—'}

Para conformidade fiscal, é obrigatório o envio do XML da NF-e. Por favor, acesse o sistema e faça o upload do XML pelo link abaixo:

${link}

Em caso de dúvidas, entre em contato com a coordenação.

Atenciosamente,
Equipe Museus Centro`;
    setMensagemXml(msg);
  }, [intake, ia, form]);

  const handleEnviarEmailXml = useCallback(async () => {
    const destinatarios = [...destinatariosSelecionados];
    if (destinatarios.length === 0) return;
    setEnviandoXml(true);
    try {
      // Enviar para cada destinatário selecionado
      await Promise.all(destinatarios.map(email =>
        base44.functions.invoke('sendSystemMessage', {
          to: email,
          subject: `[Museus Centro] XML pendente — NF ${form.nf_numero || intake.file_name_original}`,
          body: mensagemXml.replace(/\n/g, '<br>'),
        }).catch(e => console.warn('Falha ao enviar para', email, e))
      ));

      // Atualizar xml_pendente_desde no intake (Fluxo 4)
      await base44.entities.DocumentIntake.update(intake.id, {
        xml_pendente_desde: new Date().toISOString(),
        enviado_sem_xml: true,
      }).catch(() => {});

      toast({ title: `E-mail enviado para ${destinatarios.length} destinatário(s).`, duration: 3000 });
      setShowSolicitarXmlPanel(false);
      onSaved?.();
    } catch (e) {
      toast({ title: 'Erro ao enviar e-mail', description: e?.message, variant: 'destructive', duration: 3000 });
    } finally {
      setEnviandoXml(false);
    }
  }, [destinatariosSelecionados, mensagemXml, form, intake, onSaved]);

  useEffect(() => {
    const normalized = normalizeDateToInput(dataEmissaoIA);
    if (!form.nf_data_emissao && normalized && dataIAValida(normalized)) {
      setForm((f) => ({ ...f, nf_data_emissao: normalized }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataEmissaoIA]);

  useEffect(() => {
    async function loadMetas() {
      setLoadingMetas(true);
      try {
        const list = await base44.entities.ProjectMeta.list('ordem', 200);
        const ativas = (list || []).filter((m) => m?.ativo !== false);
        setMetasProjeto(ativas.length > 0 ? ativas : METAS_PROJETO.map((m) => ({ id: m.id, nome: m.label })));
      } catch {
        setMetasProjeto(METAS_PROJETO.map((m) => ({ id: m.id, nome: m.label })));
      } finally {
        setLoadingMetas(false);
      }
    }
    loadMetas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function loadRubricas() {
      try {
        // Busca rubricas do banco e filtra as do 3º e 4º Aditivo ativas
        const list = await base44.entities.Rubrica.list('', 2000);
        const rubricasValidas = (list || []).filter(
          (r) => r?.ativo !== false && (
            String(r?.origem_recurso || '').includes('3') ||
            String(r?.origem_recurso || '').includes('4') ||
            String(r?.centro_custo || '').toLowerCase().includes('pampulha')
          )
        );

        const rubricasFinal = rubricasValidas.length > 0 ? rubricasValidas : [];
        setRubricas(rubricasFinal);

        // Auto-sugestão de rubrica apenas se for do 3º Aditivo
        const rubricaIdSugerida = intake.rubrica_id_sugerida;
        if (rubricaIdSugerida) {
          // Valida se a rubrica sugerida pertence ao 3º Aditivo
          const pertence = rubricasFinal.some((r) => r.id === rubricaIdSugerida);
          if (!pertence) {
            // Rubrica da IA não é do 3º Aditivo — limpa a sugestão
            setForm((f) => ({ ...f, rubrica_id: '' }));
          }
        } else {
          // Sem sugestão do intake — tenta por keywords, mas só dentro das rubricas filtradas
          const textosBusca = [
            ia.descricao_servico,
            ia.nf_emitente_nome,
            intake.file_name_original,
            ia.rubrica_nome_sugerida,
          ].filter(Boolean).join(' ');

          if (textosBusca) {
            const sugerida = sugerirRubricaPorKeywords(textosBusca, rubricasFinal);
            if (sugerida) {
              setForm((f) => f.rubrica_id ? f : { ...f, rubrica_id: sugerida });
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    }

    loadRubricas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function parseValorBR(v) {
    const s = String(v || '0').trim().replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
      return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(s.replace(',', '.')) || 0;
  }

  function buildNomePadronizado() {
    const numero = (form.nf_numero || 'SEM-NUM').trim();
    const fornecedor = (form.nf_emitente_nome || 'FORNECEDOR').trim().substring(0, 40).toUpperCase();
    const valorNum = parseValorBR(form.nf_valor_total);
    const valorFormatado = valorNum > 0
      ? valorNum.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '0,00';
    const extAtual = (intake.file_name_original || 'arquivo.pdf').split('.').pop()?.toLowerCase() || 'pdf';
    return `${numero} - ${fornecedor} - MUSEUS CENTRO - R$ ${valorFormatado}.${extAtual}`;
  }

  function getRubricaNome(rubricaId) {
    const rubrica = rubricas.find((r) => r.id === rubricaId);
    return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '';
  }

  useEffect(() => {
    setForm((f) => ({ ...f, file_name_final: buildNomePadronizado() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nf_numero, form.nf_emitente_nome, form.nf_valor_total]);

  useEffect(() => {
    async function loadXMLs() {
      if (!form.nf_numero) {
        setXmlCandidates([]);
        setSelectedXmlId('');
        return;
      }

      setLoadingXmls(true);

      try {
        const list = await base44.entities.Attachment.filter(
          {
            nf_numero: form.nf_numero,
            nf_tipo_documento: 'xml_nf',
          },
          '-created_date',
          20
        );

        const unique = [];
        const seen = new Set();

        for (const item of list || []) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          unique.push(item);
        }

        setXmlCandidates(unique);
        setSelectedXmlId(unique[0]?.id || '');
      } catch (e) {
        console.error('Erro ao buscar XML:', e);
      } finally {
        setLoadingXmls(false);
      }
    }

    loadXMLs();
  }, [form.nf_numero]);

  const valorTotal = parseValorBR(form.nf_valor_total);
  const totalRateado = rateio.reduce((sum, r) => sum + (parseFloat(r.valor) || 0), 0);
  const diferencaRateio = Math.abs(valorTotal - totalRateado);
  const rateioValido = dividirEntreMuseus
    ? diferencaRateio < 0.01 && rateio.some((r) => parseFloat(r.valor) > 0)
    : true;

  function handleRateioValor(museu, valor) {
    setRateio((prev) => prev.map((r) => (r.museu === museu ? { ...r, valor } : r)));
  }

  function distribuirIgualmente() {
    const museusSelecionados = rateio.filter((r) => r.museu);
    const valorPorMuseu = (valorTotal / museusSelecionados.length).toFixed(2);
    setRateio(MUSEUS_RATEIO.map((m) => ({ museu: m, valor: valorPorMuseu })));
  }

  function getRateioPayload() {
    if (!dividirEntreMuseus) return null;
    return rateio
      .filter((r) => parseFloat(r.valor) > 0)
      .map((r) => ({ museu: r.museu, valor: parseFloat(r.valor) }));
  }

  async function handleVincularXML() {
    if (!selectedXmlId || !intake.entidade_destino_id) {
      toast({
        title: 'Não foi possível vincular XML',
        description: 'O PDF ainda não possui Attachment associado.',
        variant: 'destructive',
        duration: 3000,
      });
      return;
    }

    setLinkingXml(true);

    try {
      const xml = await base44.entities.Attachment.get(selectedXmlId);

      await base44.entities.Attachment.update(intake.entidade_destino_id, {
        nf_xml_attachment_id: xml.id,
        nf_revisado: true,
        nf_categoria: 'nota_fiscal',
        nf_numero: form.nf_numero,
        nf_valor_total: valorTotal,
        nf_data_emissao: form.nf_data_emissao,
        nf_emitente_nome: form.nf_emitente_nome,
        nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
        nf_tipo_documento: 'pdf_nf',
        nf_nome_renomeado: form.file_name_final,
      });

      await base44.entities.Attachment.update(xml.id, {
        nf_pdf_attachment_id: intake.entidade_destino_id,
        nf_revisado: true,
        nf_categoria: 'nota_fiscal',
        nf_numero: form.nf_numero,
        nf_valor_total: valorTotal,
        nf_data_emissao: form.nf_data_emissao,
        nf_emitente_nome: form.nf_emitente_nome,
        nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
      });

      toast({
        title: 'XML vinculado ao PDF com sucesso.',
        duration: 3000,
      });

      onSaved?.();
    } catch (e) {
      toast({
        title: 'Erro ao vincular XML',
        description: e?.message || 'Falha ao vincular XML.',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLinkingXml(false);
    }
  }

  async function handleSalvarRascunho() {
    setSaving(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'RASCUNHO',
        resultado_ia: {
          ...ia,
          ...form,
          rateio_museus: getRateioPayload(),
          dividir_entre_museus: dividirEntreMuseus,
        },
        centro_custo: form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id,
        file_name_final: form.file_name_final,
        revisado_pelo_usuario: true,
      });
      toast({ title: 'Rascunho salvo com sucesso.', duration: 3000 });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao salvar rascunho', description: e.message, variant: 'destructive', duration: 3000 });
    } finally {
      setSaving(false);
    }
  }

  async function atualizarRubrica(rubricaId, valorDebito) {
    const rubrica = await base44.entities.Rubrica.get(rubricaId);
    if (!rubrica) return;

    const valorBase = rubrica.valor_total || rubrica.valor_rubrica || 0;
    const utilizado = (rubrica.valor_utilizado || 0) + valorDebito;
    const comprometido = rubrica.saldo_comprometido || 0;
    const saldo = valorBase - utilizado - comprometido;
    const percentual = valorBase > 0 ? (utilizado / valorBase) * 100 : 0;

    await base44.entities.Rubrica.update(rubricaId, {
      valor_utilizado: utilizado,
      saldo_comprometido: comprometido,
      saldo,
      percentual_utilizado: percentual,
    });
  }

  async function debitarRubricas(rateioPayload) {
    const debitosPorRubrica = {};

    for (const item of rateioPayload) {
      const configs = await base44.entities.RubricaMuseuConfig.filter({
        rubrica_id: form.rubrica_id,
        museu: item.museu,
      });

      const rubricaAlvo = configs && configs.length > 0 ? configs[0].rubrica_id : form.rubrica_id;
      debitosPorRubrica[rubricaAlvo] = (debitosPorRubrica[rubricaAlvo] || 0) + item.valor;
    }

    for (const [rubricaId, valorDebito] of Object.entries(debitosPorRubrica)) {
      try {
        await atualizarRubrica(rubricaId, valorDebito);
      } catch (e) {
        console.error(`Erro ao debitar rubrica ${rubricaId}:`, e);
      }
    }
  }

  async function debitarRubricaSimples(valor) {
    try {
      await atualizarRubrica(form.rubrica_id, valor);
    } catch (e) {
      console.error('Erro ao debitar rubrica:', e);
    }
  }

  async function handleDeletarDocumento() {
    if (!confirm('Tem certeza que deseja deletar este documento? Esta ação não pode ser desfeita.')) return;
    setDeleting(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'DELETADO',
      });
      toast({ title: 'Documento deletado com sucesso.', duration: 3000 });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao deletar', description: e.message, variant: 'destructive', duration: 3000 });
    } finally {
      setDeleting(false);
    }
  }

  async function handleRereprocessar() {
    setReprocessing(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ANALISANDO_IA',
        resultado_ia: null,
        erros_validacao: [],
        revisado_pelo_usuario: false,
      });
      toast({ title: 'Documento enviado para reprocessamento.', duration: 3000 });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao rereprocessar', description: e.message, variant: 'destructive', duration: 3000 });
    } finally {
      setReprocessing(false);
    }
  }

  async function handlePreencherComIA() {
    setPreenchendoIA(true);
    try {
      const res = await base44.functions.invoke('processarNotaFiscalComClaude', {
        intake_id: intake.id,
        file_url: intake.arquivo_original_url,
        orientacoes_usuario: '',
      });
      const dados = res?.data?.resultado_ia || res?.data || {};
      if (!dados.nf_emitente_nome && !dados.nf_valor_total) {
        toast({ title: 'IA não retornou dados suficientes.', variant: 'destructive', duration: 3000 });
        return;
      }
      // Recarrega o intake atualizado do banco
      const updated = await base44.entities.DocumentIntake.get(intake.id);
      const iaAtualizado = updated?.resultado_ia || dados;
      const dataAtualizada = normalizeDateToInput(
        iaAtualizado.nf_data_emissao ||
        iaAtualizado.data_emissao ||
        iaAtualizado.dataEmissao || ''
      );
      setForm((f) => ({
        ...f,
        nf_numero: iaAtualizado.nf_numero || f.nf_numero,
        nf_valor_total: iaAtualizado.nf_valor_total || f.nf_valor_total,
        nf_data_emissao: dataIAValida(dataAtualizada) ? dataAtualizada : f.nf_data_emissao,
        nf_emitente_nome: iaAtualizado.nf_emitente_nome || f.nf_emitente_nome,
        nf_emitente_cpf_cnpj: iaAtualizado.nf_emitente_cpf_cnpj || f.nf_emitente_cpf_cnpj,
        municipio: iaAtualizado.municipio || f.municipio,
        descricao_servico: iaAtualizado.descricao_servico || f.descricao_servico,
        competencia: iaAtualizado.competencia || f.competencia,
        nf_horario_emissao: iaAtualizado.nf_horario_emissao || f.nf_horario_emissao,
        centro_custo: iaAtualizado.centro_custo_sugerido || f.centro_custo,
      }));
      toast({ title: '✅ Campos preenchidos com IA.', duration: 3000 });
    } catch (e) {
      toast({ title: 'Erro ao preencher com IA', description: e?.message, variant: 'destructive', duration: 3000 });
    } finally {
      setPreenchendoIA(false);
    }
  }

  async function handleProcessarNota(aprovarDireto = false, ignoreDup = false) {
    if (sending || approvingDirect) return;

    if (!form.rubrica_id) {
      toast({ title: 'Selecione a rubrica antes de continuar.', variant: 'destructive', duration: 3000 });
      return;
    }

    // Bloqueia se a rubrica selecionada não pertencer ao 3º ou 4º Aditivo
    const rubricaSel = rubricas.find((r) => r.id === form.rubrica_id);
    const origemValida = rubricaSel && (
      String(rubricaSel.origem_recurso || '').includes('3') ||
      String(rubricaSel.origem_recurso || '').includes('4') ||
      String(rubricaSel.centro_custo || '').toLowerCase().includes('pampulha')
    );
    if (rubricaSel && !origemValida) {
      toast({ title: 'Rubrica inválida', description: 'A rubrica selecionada não pertence ao 3º ou 4º Aditivo.', variant: 'destructive', duration: 4000 });
      return;
    }

    if (!form.centro_custo && !dividirEntreMuseus) {
      toast({ title: 'Selecione o centro de custo.', variant: 'destructive', duration: 3000 });
      return;
    }

    if (!valorTotal || valorTotal <= 0) {
      toast({ title: 'Informe o valor total da nota.', variant: 'destructive', duration: 3000 });
      return;
    }

    if (dividirEntreMuseus && !rateioValido) {
      toast({ title: 'Rateio inválido.', variant: 'destructive', duration: 3000 });
      return;
    }

    // Verificar duplicidade apenas na primeira tentativa (ou quando não forçado a ignorar)
    if (!ignoreDup && !ignoreDuplicate) {
      try {
        const payloadTeste = {
          nf_numero: form.nf_numero,
          nf_emitente_nome: form.nf_emitente_nome,
          nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
          nf_valor_total: valorTotal
        };
        const duplicate = await findDuplicatePurchaseRequest({
          base44,
          payload: payloadTeste,
          currentId: null
        });
        if (duplicate) {
          setDuplicateWarning(duplicate);
          return;
        }
      } catch (err) {
        console.warn('Erro ao verificar duplicidade:', err);
      }
    }

    if (aprovarDireto) {
      setApprovingDirect(true);
    } else {
      setSending(true);
    }

    try {
      const rateioPayload = getRateioPayload();
      const rubricaNome = getRubricaNome(form.rubrica_id);
      const centroCustoFinal = dividirEntreMuseus ? 'Rateado' : form.centro_custo;

      const pr = await base44.entities.PurchaseRequest.create({
        descricao_item: form.descricao_servico || form.nf_emitente_nome || form.file_name_final,
        fornecedor_nome: form.nf_emitente_nome,
        fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
        fornecedor_cpf_cnpj: form.nf_emitente_cpf_cnpj,

        valor_solicitado: valorTotal,
        valor_total: valorTotal,
        valor: valorTotal,

        meta_id: (form.meta_id && form.meta_id !== '__none__') ? form.meta_id : undefined,
        tipo_gasto: form.tipo_gasto || 'Serviço',

        centro_custo: centroCustoFinal,

        rubrica_id: form.rubrica_id,
        rubrica_nome: rubricaNome,
        budgetline_id: form.rubrica_id,

        status: aprovarDireto ? 'APROVADO_COORD' : 'SOLICITADO',

        origem: 'EntradaUnica',
        intake_id: intake.id,
        documento_intake_id: intake.id,

        nota_fiscal_url: intake.arquivo_original_url || '',
        arquivo_url: intake.arquivo_original_url || '',

        nf_numero: form.nf_numero,
        nf_data_emissao: form.nf_data_emissao,

        observacoes: `NF ${form.nf_numero || 'sem número'} - ${form.nf_emitente_nome || 'Fornecedor não informado'}`,
      });

      const attachment = await base44.entities.Attachment.create({
        purchase_request_id: pr?.id || '',
        document_intake_id: intake.id,
        report_id: '',

        file_name: form.file_name_final,
        file_type: intake.mime_type || 'application/pdf',
        file_url: intake.arquivo_original_url || '',

        description: 'Entrada Única - Nota Fiscal',

        nf_categoria: 'nota_fiscal',
        nf_numero: form.nf_numero,
        nf_valor_total: valorTotal,
        nf_data_emissao: form.nf_data_emissao,
        nf_emitente_nome: form.nf_emitente_nome,
        nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
        nf_tipo_documento: intake.tipo_detectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
        nf_nome_original: intake.file_name_original,
        nf_nome_renomeado: form.file_name_final,
        nf_status_leitura: 'lido_com_sucesso',
        nf_revisado: true,

        rubrica_id: form.rubrica_id,
        rubrica_nome: rubricaNome,
      }).catch((e) => {
        console.warn('Não foi possível criar Attachment da Entrada Única:', e);
        return null;
      });

      if (aprovarDireto) {
        if (dividirEntreMuseus && rateioPayload && rateioPayload.length > 0) {
          await debitarRubricas(rateioPayload);
        } else {
          await debitarRubricaSimples(valorTotal);
        }
      }

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: aprovarDireto ? 'APROVADO' : 'ENVIADO_APROVACAO',
        ocultar_entrada_unica: true,

        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: pr?.id || '',

        attachment_id: attachment?.id || intake.attachment_id || '',

        centro_custo: centroCustoFinal,
        rubrica_id_sugerida: form.rubrica_id,
        rubrica_nome_sugerida: rubricaNome,
        file_name_final: form.file_name_final,

        resultado_ia: {
          ...ia,
          ...form,
          categoria: 'Nota Fiscal',
          purchase_request_id: pr?.id || '',
          attachment_id: attachment?.id || intake.attachment_id || '',
          rateio_museus: rateioPayload,
          dividir_entre_museus: dividirEntreMuseus,
          centro_custo_sugerido: centroCustoFinal,
          rubrica_id: form.rubrica_id,
          rubrica_nome_sugerida: rubricaNome,
          nf_valor_total: valorTotal,
          nf_numero: form.nf_numero,
          nf_data_emissao: form.nf_data_emissao,
          nf_emitente_nome: form.nf_emitente_nome,
          nf_emitente_cpf_cnpj: form.nf_emitente_cpf_cnpj,
          descricao_servico: form.descricao_servico,
        },

        revisado_pelo_usuario: true,
      });

      toast({
        title: aprovarDireto
          ? '✅ Nota aprovada e debitada.'
          : 'Enviado para aprovação. Solicitação criada em Compras.',
        duration: 3000,
      });

      onSaved?.();
      onClose?.();
    } catch (e) {
      console.error('Erro ao processar nota:', e);
      toast({
        title: 'Erro ao processar nota',
        description: e?.message || 'Falha ao aprovar/enviar nota.',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setSending(false);
      setApprovingDirect(false);
    }
  }
  const temXMLVinculado =
    !!selectedXmlId ||
    xmlCandidates.length > 0 ||
    !!intake?.nf_xml_attachment_id ||
    !!intake?.resultado_ia?.nf_xml_attachment_id ||
    !!intake?.resultado_ia?.xml_url;

  const errosFiltrados = (intake.erros_validacao || []).filter((e) => {
    const txt = String(e || '').toLowerCase();

    if (temXMLVinculado && txt.includes('xml')) {
      return false;
    }

    if (txt.includes('cnpj') || txt.includes('empresa') || txt.includes('registrada')) {
      return false;
    }

    if (
      form.nf_valor_total &&
      (txt.includes('valor da nf') ||
        txt.includes('valor') ||
        txt.includes('destinatário') ||
        txt.includes('destinatario'))
    ) {
      return false;
    }

    if (txt.includes('futura') || txt.includes('future')) {
      const match = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const dataDoc = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
        dataDoc.setHours(0, 0, 0, 0);

        if (dataDoc <= hoje) return false;
      }
    }

    return true;
  });

  const rubricasOrdenadas = [...rubricas].sort((a, b) => {
    const grupoA = String(a.grupo || '');
    const grupoB = String(b.grupo || '');
    const nomeA = String(a.rubrica || a.nome || a.descricao || '');
    const nomeB = String(b.rubrica || b.nome || b.descricao || '');

    const byGrupo = grupoA.localeCompare(grupoB, 'pt-BR');
    if (byGrupo !== 0) return byGrupo;

    return nomeA.localeCompare(nomeB, 'pt-BR');
  });

  // Helper: classe para inputs — read-only visual durante reanálise + borda emerald em campos atualizados
  const inputStateClass = (campo) => {
    const atualizado = reanalise.camposAtualizados.includes(campo);
    const ring = atualizado ? 'ring-2 ring-emerald-400 border-emerald-400' : '';
    const ro = reanaliseAtiva ? 'bg-slate-50 cursor-not-allowed' : '';
    return `${ring} ${ro}`.trim();
  };

  return (
    <>
      <DuplicatePurchaseDetectedModal
        duplicate={duplicateWarning}
        onClose={() => setDuplicateWarning(null)}
        onProceed={() => {
          setIgnoreDuplicate(true);
          setDuplicateWarning(null);
          // Reprocessa direto ignorando a verificação de duplicidade
          handleProcessarNota(false, true);
        }}
      />

      <Dialog open onOpenChange={onClose}>
        <DialogContent className="!max-w-3xl w-full flex flex-col max-h-[calc(100vh-48px)] overflow-hidden p-0">
          {/* Cabeçalho fixo */}
          <DialogHeader className="px-6 pt-6 pb-3 border-b flex-shrink-0">
            <div className="flex items-start justify-between">
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                <FileText className="w-5 h-5 text-blue-500" />
                Conferência de Nota Fiscal
                {ia?.preenchido_por_ia_historico === true && Number(ia?.ia_historico_score || 0) >= 70 && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
                    <Sparkles className="w-3 h-3" />
                    IA Histórico {Math.round(Number(ia.ia_historico_score))}%
                  </span>
                )}
              </DialogTitle>
              <a href="/GuiaNotaFiscal" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="text-xs h-8">
                  <BookOpen className="w-3 h-3 mr-1" />
                  Ver guia
                </Button>
              </a>
            </div>
          </DialogHeader>

          {/* Corpo rolável apenas verticalmente */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 min-w-0 box-border">
        <div className="space-y-4 w-full min-w-0">
          {painelDadosIdentificados && (
            <div>{painelDadosIdentificados}</div>
          )}

          {/* Banner: reanálise automática em andamento */}
          {reanalise.reanalisando && (
            <div className="flex items-center gap-3 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg text-sm text-yellow-800">
              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
              <span>Campos incompletos ou valor divergente detectado — reanalisando o PDF automaticamente...</span>
            </div>
          )}

          {/* Banner: sucesso na reanálise */}
          {reanalise.reanaliseSucesso && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border-l-4 border-emerald-400 rounded-lg text-sm text-emerald-800">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Campos atualizados automaticamente pela IA.</span>
            </div>
          )}

          {/* Banner: falha na reanálise */}
          {reanalise.reanaliseFalha && (
            <div className="flex items-center gap-3 p-3 bg-red-50 border-l-4 border-red-400 rounded-lg text-sm text-red-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Não foi possível extrair todos os campos automaticamente. Preencha manualmente.</span>
            </div>
          )}

          {/* Banner: NF sem XML vinculado — FLUXO 2 */}
          {!intake.nf_xml_intake_id && intake.tipo_detectado === 'NOTA_FISCAL_PDF' && (
            <div className="bg-yellow-50 border-l-4 border-orange-400 rounded-lg text-sm text-yellow-800">
              <div className="flex items-start gap-3 p-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-500" />
                <div className="flex-1">
                  <p className="font-medium">Esta NF não possui XML vinculado.</p>
                  <p className="text-xs mt-0.5">Vincule o XML para conformidade fiscal ou solicite ao responsável.</p>
                </div>
                {!showSolicitarXmlPanel && (
                  <button
                    onClick={abrirSolicitarXml}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-orange-500 text-white rounded-lg px-3 py-1.5 hover:bg-orange-600 transition-colors"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Solicitar XML por e-mail
                  </button>
                )}
              </div>

              {/* Sub-painel de envio — FLUXO 3 */}
              {showSolicitarXmlPanel && (
                <div className="border-t border-orange-200 bg-white rounded-b-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">Enviar solicitação de XML por e-mail</p>
                    <button onClick={() => setShowSolicitarXmlPanel(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Destinatários */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-600">Destinatários</p>
                    {destinatariosDisponiveis.length === 0 ? (
                      <p className="text-xs text-slate-400">Nenhum destinatário encontrado.</p>
                    ) : (
                      <div className="space-y-1">
                        {destinatariosDisponiveis.map(d => (
                          <label key={d.email} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={destinatariosSelecionados.has(d.email)}
                              onChange={e => {
                                setDestinatariosSelecionados(prev => {
                                  const next = new Set(prev);
                                  e.target.checked ? next.add(d.email) : next.delete(d.email);
                                  return next;
                                });
                              }}
                              className="rounded accent-orange-500"
                            />
                            <span className="text-xs text-slate-700">{d.nome} <span className="text-slate-400">({d.email})</span></span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Prévia da mensagem */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-600">Mensagem (editável)</p>
                    <textarea
                      className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 resize-y focus:outline-none focus:ring-1 focus:ring-orange-300"
                      rows={8}
                      value={mensagemXml}
                      onChange={e => setMensagemXml(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowSolicitarXmlPanel(false)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">Cancelar</button>
                    <button
                      onClick={handleEnviarEmailXml}
                      disabled={enviandoXml || destinatariosSelecionados.size === 0}
                      className="flex items-center gap-1.5 text-xs font-semibold bg-orange-500 text-white rounded-lg px-4 py-1.5 hover:bg-orange-600 disabled:opacity-50 transition-colors"
                    >
                      {enviandoXml ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Enviar e-mail
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Documento analisado pela IA. Campos preenchidos automaticamente.
          </div>

          {ia.classificacao_justificativa && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
              <p className="font-medium mb-1">💡 Motivo da Classificação IA:</p>
              <p className="italic">{ia.classificacao_justificativa}</p>
            </div>
          )}

          {errosFiltrados.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
              <p className="font-medium flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> Inconsistências detectadas:
              </p>
              {errosFiltrados.map((e, i) => (
                <p key={i}>• {e}</p>
              ))}
            </div>
          )}

          <div className="space-y-1 w-full min-w-0">
            <Label>Nome padronizado do arquivo</Label>
            <Input className={`w-full min-w-0 ${inputStateClass('file_name_final')}`} value={form.file_name_final} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, file_name_final: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full min-w-0">
            <div className="space-y-1 min-w-0">
              <Label>Número da NF</Label>
              <Input className={`w-full min-w-0 ${inputStateClass('nf_numero')}`} value={form.nf_numero} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, nf_numero: e.target.value }))} />
            </div>
            <div className="space-y-1 min-w-0">
              <Label>Valor Total (R$)</Label>
              <Input className={`w-full min-w-0 ${inputStateClass('nf_valor_total')}`} value={form.nf_valor_total} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, nf_valor_total: e.target.value }))} />
            </div>
            <div className="space-y-1 min-w-0">
              <Label>Data de Emissão</Label>
              <Input type="date" className={`w-full min-w-0 ${inputStateClass('nf_data_emissao')}`} value={form.nf_data_emissao} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, nf_data_emissao: e.target.value }))} />
            </div>
            <div className="space-y-1 min-w-0">
              <Label>Horário de Emissão</Label>
              <Input className={`w-full min-w-0 ${inputStateClass('nf_horario_emissao')}`} value={form.nf_horario_emissao} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, nf_horario_emissao: e.target.value }))} placeholder="HH:MM:SS" />
            </div>
            <div className="space-y-1 min-w-0">
              <Label>Competência</Label>
              <Input className={`w-full min-w-0 ${inputStateClass('competencia')}`} value={form.competencia} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, competencia: e.target.value }))} placeholder="Ex: Março/2026" />
            </div>
          </div>

          <div className="space-y-1 w-full min-w-0">
            <Label>Fornecedor / Emitente</Label>
            <Input className={`w-full min-w-0 ${inputStateClass('nf_emitente_nome')}`} value={form.nf_emitente_nome} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, nf_emitente_nome: e.target.value }))} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full min-w-0">
            <div className="space-y-1 min-w-0">
              <Label>CNPJ / CPF do Emitente</Label>
              <Input className={`w-full min-w-0 ${inputStateClass('nf_emitente_cpf_cnpj')}`} value={form.nf_emitente_cpf_cnpj} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, nf_emitente_cpf_cnpj: e.target.value }))} />
            </div>
            <div className="space-y-1 min-w-0">
              <Label>Município</Label>
              <Input className={`w-full min-w-0 ${inputStateClass('municipio')}`} value={form.municipio} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, municipio: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1 w-full min-w-0">
            <Label>Descrição do Serviço / Item</Label>
            <Input className={`w-full min-w-0 ${inputStateClass('descricao_servico')}`} value={form.descricao_servico} readOnly={reanaliseAtiva} onChange={(e) => setForm((f) => ({ ...f, descricao_servico: e.target.value }))} />
          </div>

          {/* Dados adicionais extraídos pela IA */}
          {(ia.nf_emitente_banco || ia.nf_emitente_pix || ia.nf_emitente_email || ia.nf_chave_acesso || ia.nf_valor_iss) && (
            <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Dados adicionais extraídos pela IA</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                {ia.nf_chave_acesso && (
                  <div className="col-span-2">
                    <span className="text-slate-500">Chave de acesso: </span>
                    <span className="font-mono break-all">{ia.nf_chave_acesso}</span>
                  </div>
                )}
                {ia.nf_valor_iss && (
                  <div><span className="text-slate-500">ISS: </span><strong>R$ {ia.nf_valor_iss}</strong>
                    {ia.nf_aliquota_iss && <span className="text-slate-400"> ({ia.nf_aliquota_iss}%)</span>}
                  </div>
                )}
                {ia.nf_emitente_inscricao_municipal && (
                  <div><span className="text-slate-500">Insc. Municipal: </span><strong>{ia.nf_emitente_inscricao_municipal}</strong></div>
                )}
                {ia.nf_emitente_email && (
                  <div><span className="text-slate-500">E-mail emitente: </span><strong>{ia.nf_emitente_email}</strong></div>
                )}
                {ia.nf_emitente_telefone && (
                  <div><span className="text-slate-500">Telefone: </span><strong>{ia.nf_emitente_telefone}</strong></div>
                )}
                {ia.nf_emitente_banco && (
                  <div><span className="text-slate-500">Banco: </span><strong>{ia.nf_emitente_banco}</strong>
                    {ia.nf_emitente_agencia && <span> / Ag. {ia.nf_emitente_agencia}</span>}
                    {ia.nf_emitente_conta && <span> / Cc. {ia.nf_emitente_conta}</span>}
                  </div>
                )}
                {ia.nf_emitente_pix && (
                  <div className="col-span-2"><span className="text-slate-500">PIX: </span><strong>{ia.nf_emitente_pix}</strong></div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1 w-full min-w-0">
            <Label>Meta do Projeto</Label>
            <Select
              value={form.meta_id || undefined}
              onValueChange={(v) => setForm((f) => ({ ...f, meta_id: v }))}
              disabled={loadingMetas}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder={loadingMetas ? 'Carregando metas...' : 'Selecionar meta'} />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto">
                <SelectItem value="__none__">— Nenhuma —</SelectItem>
                {metasProjeto.map((meta) => (
                  <SelectItem key={meta.id} value={meta.id}>
                    {meta.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 w-full min-w-0">
            <Label>
              Tipo de Gasto <span className="text-red-500">*</span>
            </Label>
            <Select value={form.tipo_gasto} onValueChange={(v) => setForm((f) => ({ ...f, tipo_gasto: v }))}>
              <SelectTrigger className="w-full min-w-0">
                <SelectValue placeholder="Selecionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Produto">Produto</SelectItem>
                <SelectItem value="Serviço">Serviço</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 w-full min-w-0" ref={rubricaRef}>
            <Label>
              Rubrica <span className="text-red-500">*</span>
            </Label>
            {(() => {
              const rubricaSelecionada = rubricas.find((r) => r.id === form.rubrica_id);
              const rubricaLabel = rubricaSelecionada
                ? `${rubricaSelecionada.grupo ? rubricaSelecionada.grupo + ' — ' : ''}${rubricaSelecionada.rubrica || rubricaSelecionada.nome || rubricaSelecionada.descricao || 'Rubrica sem nome'}${rubricaSelecionada.centro_custo ? ' — ' + rubricaSelecionada.centro_custo : ''}`
                : '';
              const rubricasFiltradas = rubricasOrdenadas.filter((r) => {
                if (!rubricaBusca) return true;
                const q = rubricaBusca.toLowerCase();
                const nome = String(r.rubrica || r.nome || r.descricao || '').toLowerCase();
                const grupo = String(r.grupo || '').toLowerCase();
                const cc = String(r.centro_custo || '').toLowerCase();
                return nome.includes(q) || grupo.includes(q) || cc.includes(q);
              });

              return (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setRubricaDropdownOpen((v) => !v); setRubricaBusca(''); }}
                    className="w-full flex items-center justify-between border rounded-md px-3 py-2 text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <span className={rubricaLabel ? 'text-slate-900 truncate' : 'text-slate-400'}>
                      {rubricaLabel || 'Selecionar rubrica'}
                    </span>
                    <Search className="w-4 h-4 text-slate-400 flex-shrink-0 ml-2" />
                  </button>

                  {rubricaDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg">
                      <div className="p-2 border-b border-slate-100 flex items-center gap-2">
                        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <input
                          autoFocus
                          type="text"
                          className="flex-1 text-sm outline-none"
                          placeholder="Buscar rubrica..."
                          value={rubricaBusca}
                          onChange={(e) => setRubricaBusca(e.target.value)}
                        />
                        {rubricaBusca && (
                          <button type="button" onClick={() => setRubricaBusca('')}>
                            <X className="w-4 h-4 text-slate-400" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-52 overflow-y-auto">
                        {!rubricaBusca && (
                          <button
                            type="button"
                            onClick={() => { setForm((f) => ({ ...f, rubrica_id: '' })); setRubricaDropdownOpen(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 text-slate-400 italic"
                          >
                            — Nenhuma (limpar seleção) —
                          </button>
                        )}
                        {rubricasFiltradas.length === 0 && (
                          <p className="text-sm text-slate-400 text-center py-4">Nenhuma rubrica encontrada</p>
                        )}
                        {rubricasFiltradas.map((r) => {
                          const label = `${r.grupo ? r.grupo + ' — ' : ''}${r.rubrica || r.nome || r.descricao || 'Rubrica sem nome'}${r.centro_custo ? ' — ' + r.centro_custo : ''}`;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setForm((f) => ({ ...f, rubrica_id: r.id }));
                                setRubricaDropdownOpen(false);
                                setRubricaBusca('');
                              }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 ${form.rubrica_id === r.id ? 'bg-blue-50 text-blue-700' : 'text-slate-800'}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {loadingXmls && (
            <div className="border border-slate-200 rounded-xl p-3 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando XMLs correspondentes...
            </div>
          )}

          {!loadingXmls && xmlCandidates.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50">
              <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                Vincular XML existente a este PDF
              </p>

              <div className="space-y-2 max-h-40 overflow-auto">
                {xmlCandidates.map((xml) => (
                  <button
                    key={xml.id}
                    type="button"
                    onClick={() => setSelectedXmlId(xml.id)}
                    className={`w-full text-left p-2 rounded border text-sm ${
                      selectedXmlId === xml.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-medium truncate">{xml.file_name || xml.nf_nome_original || 'XML sem nome'}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {xml.nf_numero ? `NF ${xml.nf_numero}` : 'XML candidato'}
                      {xml.nf_emitente_nome ? ` — ${xml.nf_emitente_nome}` : ''}
                    </p>
                  </button>
                ))}
              </div>

              <Button
                type="button"
                onClick={handleVincularXML}
                disabled={!selectedXmlId || linkingXml}
                className="w-full"
              >
                {linkingXml ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                Vincular XML ao PDF
              </Button>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
            <div className="flex items-center gap-2">
              <SplitSquareHorizontal className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Rateamento da Rubrica</span>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rateio_tipo" checked={!dividirEntreMuseus} onChange={() => setDividirEntreMuseus(false)} className="accent-slate-700" />
                <span className="text-slate-700">Pago pela verba geral (sem rateio entre museus)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="rateio_tipo" checked={dividirEntreMuseus} onChange={() => setDividirEntreMuseus(true)} className="accent-slate-700" />
                <span className="text-slate-700">Dividir entre museus</span>
              </label>
            </div>

            {!dividirEntreMuseus && (
              <div className="space-y-1">
                <Label>
                  Centro de Custo <span className="text-red-500">*</span>
                </Label>
                <Select value={form.centro_custo} onValueChange={(v) => setForm((f) => ({ ...f, centro_custo: v }))}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {CENTROS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {dividirEntreMuseus && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Informe o valor de cada museu. A soma deve ser igual ao valor total da NF.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={distribuirIgualmente} className="text-xs h-7">
                    Dividir igualmente
                  </Button>
                </div>

                <div className="space-y-2">
                  {rateio.map((r) => (
                    <div key={r.museu} className="flex items-center gap-3">
                      <span className="w-16 text-sm font-medium text-slate-700 flex-shrink-0">{r.museu}</span>
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                        <Input type="number" min="0" step="0.01" placeholder="0,00" value={r.valor} onChange={(e) => handleRateioValor(r.museu, e.target.value)} className="pl-9" />
                      </div>
                    </div>
                  ))}
                </div>

                <div className={`flex justify-between items-center text-sm font-medium px-1 py-2 rounded-lg border ${rateioValido ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <span>Total rateado:</span>
                  <span>
                    R$ {totalRateado.toFixed(2)} {valorTotal > 0 && `/ R$ ${valorTotal.toFixed(2)}`}
                  </span>
                </div>

                {!rateioValido && valorTotal > 0 && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Diferença de R$ {diferencaRateio.toFixed(2)} — ajuste os valores antes de enviar.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            ⚡ Ao enviar, o valor será debitado imediatamente da(s) rubrica(s) correspondente(s), atualizando o valor realizado e o saldo disponível.
          </div>

          {errosFiltrados.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 space-y-2">
              <p className="font-medium">⚠️ Este documento tem inconsistências. Você pode:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Trocar o arquivo e reprocessar</li>
                <li>Deletar este documento</li>
                <li>Enviar mesmo assim (irá para revisão do coordenador)</li>
              </ul>
            </div>
          )}

        </div>
          </div>

          {/* Rodapé fixo */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0 flex-wrap bg-white">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>

            <Button variant="destructive" size="sm" onClick={handleDeletarDocumento} disabled={deleting || saving || sending}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
              Deletar
            </Button>

            <Button variant="outline" size="sm" onClick={handleRereprocessar} disabled={reprocessing || saving || sending || preenchendoIA}>
              {reprocessing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Rereprocessar
            </Button>

            <Button variant="outline" size="sm" onClick={handlePreencherComIA} disabled={preenchendoIA || saving || sending || reprocessing || reanaliseAtiva} className="border-purple-200 text-purple-700 hover:bg-purple-50">
              {preenchendoIA ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Preencher com IA
            </Button>

            <Button variant="outline" onClick={handleSalvarRascunho} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Rascunho
            </Button>

            {user && COORD_EMAILS.includes((user.email || '').toLowerCase().trim()) && (
              <Button
                onClick={() => handleProcessarNota(true)}
                disabled={sending || approvingDirect || !form.rubrica_id || reanaliseAtiva}
                className="bg-green-600 hover:bg-green-700"
              >
                {sending || approvingDirect ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Aprovar Direto
              </Button>
            )}

            <Button
              onClick={() => handleProcessarNota(false)}
              disabled={
                sending ||
                !form.rubrica_id ||
                (!dividirEntreMuseus && !form.centro_custo) ||
                (dividirEntreMuseus && !rateioValido) ||
                reanaliseAtiva
              }
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar para Aprovação
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}