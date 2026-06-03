import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Download, Check, ChevronRight, AlertCircle, History, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import TermoIAExtractor from '@/components/termos/TermoIAExtractor';
import TermoReviewModal from '@/components/termos/TermoReviewModal';

// ── Centros de custo do Termo (nomenclatura oficial) ────────────────────────
const CENTROS_CUSTO_TERMO = [
  { value: 'MIS', label: 'MIS' },
  { value: 'MHAB', label: 'MHAB' },
  { value: 'MUMO', label: 'MUMO' },
  { value: 'Atuacao Geral', label: 'Atuacao Geral' },
  { value: 'Noturno nos Museus Centro', label: 'Noturno nos Museus Centro' },
  { value: 'Noturno nos Museus Pampulha', label: 'Noturno nos Museus Pampulha' },
];

// Normaliza centros legados
function normalizarCentroCusto(cc) {
  if (!cc) return cc;
  const map = { MAB: 'MHAB', MUMU: 'MUMO' };
  return map[cc.trim().toUpperCase()] || cc;
}

// Produtos e entregas disponíveis
const PRODUTOS_ENTREGAS = [
  'Monitoria e mediacao cultural',
  'Oficina educativa',
  'Palestra ou formacao',
  'Acao cultural',
  'Apresentacao artistica',
  'Cobertura fotografica',
  'Cobertura de video',
  'Producao de conteudo (texto, post, release)',
  'Identidade visual / arte grafica',
  'Expografia',
  'Catalogo ou publicacao',
  'Gestao e coordenacao',
  'Consultoria especializada',
  'Relatorio tecnico',
  'Outro',
];

// Mapeamento centro de custo -> filtro de atividades
const CC_PARA_FILTRO_ATIVIDADE = {
  'MIS': ['MIS', 'MIS BH'],
  'MHAB': ['MHAB', 'MAB'],
  'MUMO': ['MUMO', 'MUMU'],
  'Atuacao Geral': ['Geral/Transversal', 'Coordenacao', 'Comunicacao', 'Educacao', 'Producao', 'Administrativo-financeiro', 'Atuacao Geral', 'Geral'],
  'Noturno nos Museus Centro': ['Noturno nos Museus', 'Noturno Centro'],
  'Noturno nos Museus Pampulha': ['Noturno Pampulha', 'Noturno nos Museus Pampulha'],
};

function formatarMesAno(data) {
  if (!data) return '';
  const d = new Date(data);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

// ── Configurações dos projetos ──────────────────────────────────────────────
const PROJETOS = {
  museu_centro: {
    label: 'Museu Centro',
    nome_projeto: 'Projeto Museus Centro',
    termo_colaboracao: 'Termo de Colaboração 01-031.069/24-80',
    orgao_parceiro: 'Fundação Municipal de Cultura da Prefeitura Municipal de Belo Horizonte – MG (FMC)',
    descricao_nf_base: 'Projeto Museus Centro - Termo de Colaboração 01-031.069/24-80, parceria com SMC/FMC',
    texto_vinculacao: 'A prestação dos serviços se dará no âmbito do Projeto Museus Centro, objeto do Termo de Colaboração 01-031.069/24-80, firmado entre a CONTRATANTE e a Fundação Municipal de Cultura da Prefeitura Municipal de Belo Horizonte – MG (FMC).',
  },
  museu_centro_noturno: {
    label: 'Museu Centro Noturno',
    nome_projeto: 'Projeto Museus Centro – Noturno nos Museus Ed. 2026',
    termo_colaboracao: 'Termo de Colaboração 01-031.069/24-80',
    orgao_parceiro: 'Fundação Municipal de Cultura da Prefeitura Municipal de Belo Horizonte – MG (FMC)',
    descricao_nf_base: 'Projeto Museus Centro – Noturno nos Museus Ed. 2026 - Termo de Colaboração 01-031.069/24-80, parceria com SMC/FMC',
    texto_vinculacao: 'A prestação dos serviços se dará no âmbito do Projeto Museus Centro – Noturno nos Museus Ed. 2026, objeto do Termo de Colaboração 01-031.069/24-80, firmado entre a CONTRATANTE e a Fundação Municipal de Cultura da Prefeitura Municipal de Belo Horizonte – MG (FMC).',
  },
  museu_centro_noturno_pampulha: {
    label: 'Museu Centro Noturno Pampulha',
    nome_projeto: 'Projeto Museus Centro – Noturno nos Museus Pampulha Ed. 2026',
    termo_colaboracao: 'Termo de Colaboração 01-031.069/24-80',
    orgao_parceiro: 'Fundação Municipal de Cultura / Fundação Municipal de Parques – Prefeitura Municipal de Belo Horizonte – MG',
    descricao_nf_base: 'Projeto Museus Centro – Noturno nos Museus Pampulha Ed. 2026 - Termo de Colaboração 01-031.069/24-80, parceria com SMC/FMC/FMP',
    texto_vinculacao: 'A prestação dos serviços se dará no âmbito do Projeto Museus Centro – Noturno nos Museus Pampulha Ed. 2026, objeto do Termo de Colaboração 01-031.069/24-80, firmado entre a CONTRATANTE e a Fundação Municipal de Cultura / Fundação Municipal de Parques da Prefeitura Municipal de Belo Horizonte – MG.',
  },
};

const CC_SEM_MUSEU = ['Geral/Transversal', 'Coordenação', 'Comunicação', 'Administrativo-financeiro', 'Consultorias', 'Publicações', 'Despesas Gerais'];

function montarDescricaoNF(projeto, centroCusto, museuLocal) {
  if (!projeto) return '';
  const base = projeto.descricao_nf_base || '';
  const semMuseu = !centroCusto || CC_SEM_MUSEU.includes(centroCusto);
  if (semMuseu || !museuLocal || museuLocal === 'Outro') return base;
  return `${base} – ${museuLocal}`;
}

const DADOS_CONTRATANTE = {
  nome: 'OSC Viaduto das Artes',
  nome_nf: 'Viaduto das Artes',
  cnpj: '16.911.508/0001-81',
  cnpj_nf: '23.843.648/0001-25',
  inscricao_municipal: '0.745.690/001-X',
  endereco: 'Avenida Olinto Meireles, 45, Belo Horizonte, MG, CEP: 30.640-010',
  endereco_nf: 'Av. Olinto Meireles, 45 - Barreiro, Belo Horizonte - MG, 30640-010',
  telefone: '(31) 98802-5140',
  email: 'viadutodasartes@viadutodasartes.org.br',
  representante: 'Leandro Gabriel',
  representante_completo: 'Leandro Gabriel Coelho Pereira',
  cargo: 'Presidente',
};

const FORMAS_PAGAMENTO = [
  'PIX, transferência online ou depósito bancário',
  'PIX',
  'Transferência bancária (TED/DOC)',
  'Boleto bancário',
  'Em parcelas conforme cronograma',
];

const MUSEUS = ['MUMO', 'MIS', 'MHAB', 'Viaduto das Artes', 'Outro'];

const EMPTY_FORM = {
  projeto: '',
  funcao_projeto: '',
  contratado_nome: '',
  contratado_cpf_cnpj: '',
  contratado_representante: '',
  contratado_cpf_representante: '',
  contratado_endereco: '',
  contratado_telefone: '',
  contratado_email: '',
  objeto: '',
  escopo: '',
  museu_local: '',
  periodo_execucao: '',
  valor_total: '',
  detalhamento_valores: '',
  forma_pagamento: 'PIX, transferencia online ou deposito bancario',
  banco: '',
  agencia: '',
  conta: '',
  pix: '',
  descricao_nf_editavel: '',
  rubrica_vinculada: '',
  centro_custo_termo: '',
  centro_custo: '',
  data_assinatura: '',
  cidade_assinatura: 'Belo Horizonte',
  testemunha1_nome: '',
  testemunha1_cpf: '',
  testemunha2_nome: '',
  testemunha2_cpf: '',
  produto_entrega: '',
  produto_entrega_outro: '',
  atividade_relacionada_id: '',
  atividade_relacionada_manual: '',
};

export default function GeradorTermoCompromisso() {
  const [step, setStep] = useState('projeto'); // 'projeto' | 'form' | 'review' | 'historico'
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [numeroTC, setNumeroTC] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const queryClient = useQueryClient();

  const { data: termos = [] } = useQuery({
    queryKey: ['termos'],
    queryFn: () => base44.entities.TermoCompromisso.list('-created_date', 200),
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-ativas'],
    queryFn: () => base44.entities.Rubrica.filter({ ativo: true }),
  });

  // Busca atividades de relatórios para o campo "Atividade relacionada"
  const { data: atividades = [] } = useQuery({
    queryKey: ['atividades-termo'],
    queryFn: () => base44.entities.Activity.list('-created_date', 300),
    staleTime: 5 * 60 * 1000,
  });

  // Filtra atividades pelo centro de custo do termo
  const atividadesFiltradas = useMemo(() => {
    const cc = formData.centro_custo_termo;
    if (!cc) return atividades;
    const filtros = CC_PARA_FILTRO_ATIVIDADE[cc] || [];
    if (!filtros.length) return atividades;
    return atividades.filter(a => {
      const ccAtiv = (a.centro_custo || a.museu || '').trim();
      return filtros.some(f => ccAtiv.toLowerCase().includes(f.toLowerCase()));
    });
  }, [atividades, formData.centro_custo_termo]);

  // Busca número TC do backend ao entrar no formulário
  useEffect(() => {
    if (step === 'form' && !numeroTC) {
      base44.functions.invoke('gerarNumeroTC', {})
        .then(res => { if (res.data?.numero_tc) setNumeroTC(res.data.numero_tc); })
        .catch(() => {
          // Fallback local
          const ano = new Date().getFullYear();
          const termoAno = termos.filter(t => (t.numero_tc || '').startsWith(`TC-MC-${ano}-`));
          const seq = termoAno.length + 1;
          setNumeroTC(`TC-MC-${ano}-${String(seq).padStart(3, '0')}`);
        });
    }
  }, [step, termos]);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.TermoCompromisso.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['termos'] }),
  });

  const handleField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const projetoAtual = PROJETOS[formData.projeto] || null;

  const handleProjetoSelect = (projeto) => {
    const proj = PROJETOS[projeto];
    setFormData(prev => ({
      ...EMPTY_FORM,
      projeto,
      descricao_nf_editavel: montarDescricaoNF(proj, '', ''),
    }));
    setNumeroTC('');
    setStep('form');
  };

  const handleCentroTermo = (cc) => {
    const normalizado = normalizarCentroCusto(cc);
    setFormData(prev => ({
      ...prev,
      centro_custo_termo: normalizado,
      centro_custo: normalizado,
      descricao_nf_editavel: montarDescricaoNF(projetoAtual, normalizado, prev.museu_local),
      atividade_relacionada_id: '',
    }));
  };

  const handleCentroCusto = (cc) => {
    setFormData(prev => ({
      ...prev,
      centro_custo: cc,
      descricao_nf_editavel: montarDescricaoNF(projetoAtual, cc, prev.museu_local),
    }));
  };

  const handleMuseuLocal = (museu) => {
    setFormData(prev => ({
      ...prev,
      museu_local: museu,
      descricao_nf_editavel: montarDescricaoNF(projetoAtual, prev.centro_custo, museu),
    }));
  };

  // Callback da extração IA — preenche o formulário
  const handleDadosExtraidos = (dados) => {
    setFormData(prev => {
      const novo = { ...prev };
      Object.entries(dados).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') novo[k] = v;
      });
      // Recalcula descrição NF se museu ou cc mudou
      if (dados.museu_local || dados.centro_custo) {
        novo.descricao_nf_editavel = montarDescricaoNF(
          projetoAtual,
          dados.centro_custo || novo.centro_custo,
          dados.museu_local || novo.museu_local
        );
      }
      return novo;
    });
  };

  const handleOpenReview = () => {
    if (!formData.contratado_nome || !formData.objeto || !formData.valor_total) {
      toast.error('Preencha os campos obrigatorios: nome do contratado, objeto e valor total.');
      return;
    }
    if (!formData.centro_custo_termo) {
      toast.error('Selecione o Centro de custo / Projeto vinculado.');
      return;
    }
    if (!formData.produto_entrega) {
      toast.error('Selecione os Produtos e entregas gerados.');
      return;
    }
    if (formData.produto_entrega === 'Outro' && !formData.produto_entrega_outro?.trim()) {
      toast.error('Descreva o produto/entrega no campo de texto.');
      return;
    }
    setShowReview(true);
  };

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    let termoId = null;
    try {
      // 1. Salva o registro do termo com numero_tc permanente
      const user = await base44.auth.me();
      const produtoFinal = formData.produto_entrega === 'Outro'
        ? formData.produto_entrega_outro
        : formData.produto_entrega;

      const savedTermo = await saveMutation.mutateAsync({
        numero_tc: numeroTC,
        numero_termo: numeroTC,
        projeto: formData.projeto,
        funcao_projeto: formData.funcao_projeto,
        contratado_nome: formData.contratado_nome,
        contratado_cpf_cnpj: formData.contratado_cpf_cnpj,
        contratado_email: formData.contratado_email,
        objeto: formData.objeto,
        valor_total: parseFloat(formData.valor_total) || 0,
        periodo_execucao: formData.periodo_execucao,
        museu: formData.museu_local,
        banco: formData.banco,
        agencia: formData.agencia,
        conta: formData.conta,
        pix_key: formData.pix,
        centro_custo: formData.centro_custo_termo || formData.centro_custo,
        dados_extraidos_ia: formData.dados_extraidos_ia || null,
        divergencias_ia: formData.divergencias_ia || [],
        gerado_por_email: user?.email || '',
        gerado_por_nome: user?.full_name || '',
        drive_backup_status: 'pendente',
        status: 'gerado',
        observacoes: [
          produtoFinal ? `Produto/entrega: ${produtoFinal}` : '',
          formData.atividade_relacionada_id && formData.atividade_relacionada_id !== 'outra'
            ? `Atividade vinculada ID: ${formData.atividade_relacionada_id}`
            : '',
          formData.atividade_relacionada_manual
            ? `Atividade manual: ${formData.atividade_relacionada_manual}`
            : '',
        ].filter(Boolean).join(' | '),
      });
      termoId = savedTermo?.id;

      // 2. Gera o PDF
      const payload = {
        ...formData,
        numero_termo: numeroTC,
        dados_contratante: DADOS_CONTRATANTE,
        projeto_config: projetoAtual,
      };

      const response = await base44.functions.invoke('generateTermoPDF', payload);

      // 3. Faz download local
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${numeroTC} - ${(formData.contratado_nome || 'CONTRATADO').toUpperCase()}${formData.funcao_projeto ? ' - ' + formData.funcao_projeto.toUpperCase() : ''} - MUSEUS CENTRO - R$ ${parseFloat(formData.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

      // 4. Backup automático no Drive (em background)
      toast.success(`Termo ${numeroTC} gerado! Enviando backup para o Drive...`);

      // Converte blob para base64
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);

      const isPampulha = formData.centro_custo_termo === 'Noturno nos Museus Pampulha';

      base44.functions.invoke('backupTermoDrive', {
        numero_tc: numeroTC,
        contratado_nome: formData.contratado_nome,
        funcao: formData.funcao_projeto,
        valor_total: formData.valor_total,
        ano: new Date().getFullYear(),
        pdf_base64: base64,
        termo_id: termoId,
        pasta_extra_id: isPampulha ? '1Ov9ci6Dwg297mm7QiqX1wfLIb92EZSGf' : null,
      }).then(res => {
        if (res.data?.success) {
          toast.success('Backup no Drive concluido!');
          queryClient.invalidateQueries({ queryKey: ['termos'] });
        }
      }).catch(() => {
        toast.error('Aviso: Backup no Drive falhou. O PDF foi salvo localmente.');
      });

      setShowReview(false);
    } catch (error) {
      toast.error('Erro ao gerar PDF: ' + (error?.message || 'Tente novamente'));
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Histórico de termos ────────────────────────────────────────────────────
  if (step === 'historico') {
    const ano = new Date().getFullYear();
    const termosAno = termos.filter(t => (t.numero_tc || t.numero_termo || '').includes(String(ano)));
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <button onClick={() => setStep('projeto')} className="text-xs text-slate-400 hover:text-slate-600 mb-1 block">← Voltar</button>
              <h1 className="text-xl font-bold text-slate-900">Histórico de Termos — {ano}</h1>
              <p className="text-xs text-slate-500">{termosAno.length} termo(s) gerado(s)</p>
            </div>
            <Button size="sm" onClick={() => setStep('projeto')} className="bg-slate-900 text-white">
              + Novo Termo
            </Button>
          </div>
          <div className="space-y-2">
            {termosAno.length === 0 && (
              <p className="text-center text-slate-400 py-12">Nenhum termo gerado em {ano}.</p>
            )}
            {termosAno.map(t => (
              <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-bold text-slate-900">{t.numero_tc || t.numero_termo}</p>
                  <p className="text-sm text-slate-700">{t.contratado_nome}</p>
                  <div className="flex gap-2 mt-1">
                    {t.funcao_projeto && <span className="text-xs text-slate-500">{t.funcao_projeto}</span>}
                    {t.valor_total && <span className="text-xs text-slate-500">R$ {parseFloat(t.valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      t.status === 'gerado' ? 'bg-blue-100 text-blue-700' :
                      t.status === 'assinado' ? 'bg-green-100 text-green-700' :
                      t.status === 'rascunho' ? 'bg-slate-100 text-slate-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>{t.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {t.drive_backup_status === 'concluido' && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Drive
                    </span>
                  )}
                  {t.drive_backup_url && (
                    <a href={t.drive_backup_url} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> Abrir
                    </a>
                  )}
                  <span className="text-xs text-slate-400">
                    {t.created_date ? new Date(t.created_date).toLocaleDateString('pt-BR') : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Tela 1: seleção de projeto ─────────────────────────────────────────────
  if (step === 'projeto') {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
        <div className="max-w-lg w-full">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <FileText className="w-7 h-7 text-slate-700" />
              <h1 className="text-2xl font-bold text-slate-900">Gerador de Termo de Compromisso</h1>
            </div>
            <button
              onClick={() => setStep('historico')}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              <History className="w-4 h-4" /> Histórico
            </button>
          </div>
          <p className="text-slate-500 mb-8 text-sm">Selecione o projeto para este termo:</p>
          <div className="space-y-4">
            {Object.entries(PROJETOS).map(([key, proj]) => (
              <button
                key={key}
                onClick={() => handleProjetoSelect(key)}
                className="w-full text-left bg-white border border-slate-200 hover:border-slate-900 hover:bg-slate-900 hover:text-white rounded-xl p-5 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-base">{proj.label}</p>
                    <p className="text-xs text-slate-400 group-hover:text-slate-300 mt-1">{proj.termo_colaboracao}</p>
                    <p className="text-xs text-slate-400 group-hover:text-slate-300 mt-0.5 truncate">{proj.orgao_parceiro}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Tela 2: formulário ─────────────────────────────────────────────────────
  return (
    <>
      {showReview && (
        <TermoReviewModal
          formData={formData}
          numeroTC={numeroTC}
          projetoAtual={projetoAtual}
          onConfirm={handleGeneratePDF}
          onEdit={() => setShowReview(false)}
          onClose={() => setShowReview(false)}
          isGenerating={isGenerating}
        />
      )}

      <div className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <button onClick={() => setStep('projeto')} className="text-xs text-slate-400 hover:text-slate-600 mb-2 flex items-center gap-1">
                ← Trocar projeto
              </button>
              <h1 className="text-xl font-bold text-slate-900">Termo de Compromisso de Prestação de Serviço</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-slate-900 text-white text-xs px-2 py-0.5 rounded-full">{projetoAtual?.label}</span>
                <span className="text-xs text-slate-400 font-mono">{numeroTC || '...'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep('historico')}>
                <History className="w-4 h-4 mr-1" /> Histórico
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveMutation.mutate({ ...formData, numero_tc: numeroTC, numero_termo: numeroTC, status: 'rascunho' })}
              >
                <Check className="w-4 h-4 mr-1" /> Salvar
              </Button>
              <Button
                size="sm"
                className="bg-slate-900 hover:bg-slate-800 text-white"
                onClick={handleOpenReview}
                disabled={isGenerating}
              >
                <Download className="w-4 h-4 mr-1" />
                Revisar e Gerar PDF
              </Button>
            </div>
          </div>

          {/* Projeto selecionado */}
          <Card className="mb-6 border-blue-100 bg-blue-50">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs font-semibold text-blue-800 mb-1">PROJETO SELECIONADO</p>
              <p className="text-sm font-medium text-blue-900">{projetoAtual?.nome_projeto}</p>
              <p className="text-xs text-blue-700 mt-0.5">{projetoAtual?.termo_colaboracao}</p>
              <p className="text-xs text-blue-600 mt-0.5">{projetoAtual?.orgao_parceiro}</p>
            </CardContent>
          </Card>

          {/* IA Extractor — sempre visível no topo */}
          <div className="mb-6">
            <TermoIAExtractor projetoConfig={projetoAtual} onDadosExtraidos={handleDadosExtraidos} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Col 1 */}
            <div className="space-y-5">

              {/* Número do Termo */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Número do Termo</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Input
                      value={numeroTC}
                      onChange={e => setNumeroTC(e.target.value)}
                      className="font-mono"
                      placeholder="TC-MC-2026-001"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Gerado automaticamente. Não reutilizável.</p>
                </CardContent>
              </Card>

              {/* Dados do Contratado */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Dados do Contratado</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Nome / Razão Social *</label>
                    <Input value={formData.contratado_nome} onChange={e => handleField('contratado_nome', e.target.value)} placeholder="Nome completo ou razão social" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">CPF ou CNPJ *</label>
                    <Input value={formData.contratado_cpf_cnpj} onChange={e => handleField('contratado_cpf_cnpj', e.target.value)} placeholder="000.000.000-00 ou 00.000.000/0001-00" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Função no projeto</label>
                    <Input value={formData.funcao_projeto} onChange={e => handleField('funcao_projeto', e.target.value)} placeholder="ex: Educadora, Designer, Fotógrafo" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Representante Legal (se PJ)</label>
                    <Input value={formData.contratado_representante} onChange={e => handleField('contratado_representante', e.target.value)} placeholder="Nome do representante legal" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">CPF do Representante</label>
                    <Input value={formData.contratado_cpf_representante} onChange={e => handleField('contratado_cpf_representante', e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Endereço Completo</label>
                    <Textarea value={formData.contratado_endereco} onChange={e => handleField('contratado_endereco', e.target.value)} placeholder="Rua, número, bairro, cidade-UF, CEP" rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Telefone</label>
                      <Input value={formData.contratado_telefone} onChange={e => handleField('contratado_telefone', e.target.value)} placeholder="(31) 9xxxx-xxxx" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">E-mail</label>
                      <Input value={formData.contratado_email} onChange={e => handleField('contratado_email', e.target.value)} placeholder="email@exemplo.com" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Objeto e Escopo */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Objeto e Escopo</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Objeto do serviço *</label>
                    <Textarea value={formData.objeto} onChange={e => handleField('objeto', e.target.value)} placeholder="Descreva resumidamente o serviço a ser prestado" rows={3} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Escopo detalhado</label>
                    <Textarea value={formData.escopo} onChange={e => handleField('escopo', e.target.value)} placeholder="(a) ... (b) ... (c) ..." rows={5} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Vinculação institucional (editável)</label>
                    <Textarea value={formData.texto_vinculacao_editavel || projetoAtual?.texto_vinculacao || ''} onChange={e => handleField('texto_vinculacao_editavel', e.target.value)} rows={3} />
                  </div>
                </CardContent>
              </Card>

              {/* Prazo e Local */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Prazo e Local da Prestação</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Museu / Local *</label>
                    <Select value={formData.museu_local} onValueChange={handleMuseuLocal}>
                      <SelectTrigger><SelectValue placeholder="Selecione o local" /></SelectTrigger>
                      <SelectContent>
                        {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Mês / Período de execução *</label>
                    <Input value={formData.periodo_execucao} onChange={e => handleField('periodo_execucao', e.target.value)} placeholder="ex: dezembro/2025, ou 01/12/2025 a 20/12/2025" />
                  </div>
                </CardContent>
              </Card>

              {/* Centro de custo / Projeto vinculado */}
              <Card className="border-slate-300">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Centro de custo / Projeto vinculado <span className="text-red-500">*</span></CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Select value={formData.centro_custo_termo} onValueChange={handleCentroTermo}>
                      <SelectTrigger className={!formData.centro_custo_termo ? 'border-red-300' : ''}>
                        <SelectValue placeholder="Selecione o centro de custo" />
                      </SelectTrigger>
                      <SelectContent>
                        {CENTROS_CUSTO_TERMO.map(cc => (
                          <SelectItem key={cc.value} value={cc.value}>{cc.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!formData.centro_custo_termo && (
                      <p className="text-xs text-red-500 mt-1">Campo obrigatorio</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Rubrica orçamentária vinculada</label>
                    <Select value={formData.rubrica_vinculada} onValueChange={v => handleField('rubrica_vinculada', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione a rubrica (opcional)" /></SelectTrigger>
                      <SelectContent>
                        {rubricas.map(r => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.rubrica} {r.grupo ? `(${r.grupo})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Produtos e entregas */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Produtos e entregas gerados <span className="text-red-500">*</span></CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Select value={formData.produto_entrega} onValueChange={v => handleField('produto_entrega', v)}>
                    <SelectTrigger className={!formData.produto_entrega ? 'border-red-300' : ''}>
                      <SelectValue placeholder="Selecione o produto ou entrega" />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUTOS_ENTREGAS.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.produto_entrega === 'Outro' && (
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Descreva o produto/entrega <span className="text-red-500">*</span></label>
                      <Textarea
                        value={formData.produto_entrega_outro}
                        onChange={e => handleField('produto_entrega_outro', e.target.value)}
                        placeholder="Descreva detalhadamente o produto ou entrega gerado"
                        rows={2}
                        className={!formData.produto_entrega_outro?.trim() ? 'border-red-300' : ''}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Atividade relacionada */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Atividade relacionada</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-slate-400">
                    {formData.centro_custo_termo
                      ? `${atividadesFiltradas.length} atividade(s) de: ${formData.centro_custo_termo}`
                      : 'Selecione o centro de custo para filtrar atividades'}
                  </p>
                  <Select value={formData.atividade_relacionada_id} onValueChange={v => handleField('atividade_relacionada_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione a atividade (opcional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outra">Outra atividade (preenchimento manual)</SelectItem>
                      {atividadesFiltradas.map(a => {
                        const cc = normalizarCentroCusto(a.centro_custo || a.museu || '');
                        const mes = formatarMesAno(a.data_realizacao || a.data_inicio);
                        const label = [a.titulo, cc, mes].filter(Boolean).join(' — ');
                        return <SelectItem key={a.id} value={a.id}>{label}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                  {formData.atividade_relacionada_id === 'outra' && (
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Descreva a atividade</label>
                      <Input
                        value={formData.atividade_relacionada_manual}
                        onChange={e => handleField('atividade_relacionada_manual', e.target.value)}
                        placeholder="Nome ou descrição da atividade"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Col 2 */}
            <div className="space-y-5">

              {/* Valores */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Valores e Pagamento</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Valor Total (R$) *</label>
                    <Input type="number" step="0.01" value={formData.valor_total} onChange={e => handleField('valor_total', e.target.value)} placeholder="0,00" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Detalhamento das parcelas / valores</label>
                    <Textarea value={formData.detalhamento_valores} onChange={e => handleField('detalhamento_valores', e.target.value)} placeholder="ex: 2 parcelas de R$ 1.000,00 com vencimento em 10/01 e 10/02" rows={2} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Forma de pagamento *</label>
                    <Select value={formData.forma_pagamento} onValueChange={v => handleField('forma_pagamento', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FORMAS_PAGAMENTO.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Dados bancários */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Dados Bancários / PIX do Contratado</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Banco</label>
                    <Input value={formData.banco} onChange={e => handleField('banco', e.target.value)} placeholder="Nome do banco" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Agência</label>
                      <Input value={formData.agencia} onChange={e => handleField('agencia', e.target.value)} placeholder="0001" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Conta</label>
                      <Input value={formData.conta} onChange={e => handleField('conta', e.target.value)} placeholder="00000000-0" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Chave PIX</label>
                    <Input value={formData.pix} onChange={e => handleField('pix', e.target.value)} placeholder="CPF, CNPJ, e-mail ou telefone" />
                  </div>
                </CardContent>
              </Card>

              {/* Dados para NF */}
              <Card className="border-amber-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    Dados para Emissão da Nota Fiscal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 space-y-1">
                    <p><span className="font-medium">Razão Social:</span> Viaduto das Artes</p>
                    <p><span className="font-medium">Endereço:</span> Av. Olinto Meireles, 45 - Barreiro, Belo Horizonte - MG, 30640-010</p>
                    <p><span className="font-medium">CNPJ:</span> 23.843.648/0001-25</p>
                    <p><span className="font-medium">Inscrição Municipal:</span> 0.745.690/001-X</p>
                    <p><span className="font-medium">Tel.:</span> (31) 98802-5140</p>
                    <p><span className="font-medium">Email:</span> viadutodasartes@viadutodasartes.org.br</p>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Descrição obrigatória da NF (editável) *</label>
                    <Textarea
                      value={formData.descricao_nf_editavel}
                      onChange={e => handleField('descricao_nf_editavel', e.target.value)}
                      rows={3}
                      className="text-xs font-mono"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Assinatura e Testemunhas */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Assinatura e Testemunhas</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Cidade *</label>
                      <Input value={formData.cidade_assinatura} onChange={e => handleField('cidade_assinatura', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Data de assinatura</label>
                      <Input type="date" value={formData.data_assinatura} onChange={e => handleField('data_assinatura', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Testemunha 1 – Nome</label>
                      <Input value={formData.testemunha1_nome} onChange={e => handleField('testemunha1_nome', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Testemunha 1 – CPF</label>
                      <Input value={formData.testemunha1_cpf} onChange={e => handleField('testemunha1_cpf', e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Testemunha 2 – Nome</label>
                      <Input value={formData.testemunha2_nome} onChange={e => handleField('testemunha2_nome', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Testemunha 2 – CPF</label>
                      <Input value={formData.testemunha2_cpf} onChange={e => handleField('testemunha2_cpf', e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>

          {/* Botão inferior */}
          <div className="mt-8 flex justify-end gap-3">
            <Button variant="outline" onClick={() => saveMutation.mutate({ ...formData, numero_tc: numeroTC, numero_termo: numeroTC, status: 'rascunho' })}>
              <Check className="w-4 h-4 mr-1" /> Salvar rascunho
            </Button>
            <Button
              className="bg-slate-900 hover:bg-slate-800 text-white px-8"
              onClick={handleOpenReview}
              disabled={isGenerating}
            >
              <Download className="w-4 h-4 mr-1" />
              Revisar e Gerar PDF
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}