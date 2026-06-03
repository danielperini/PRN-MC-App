import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Download, Check, ChevronRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

// ── Configurações dos projetos ──────────────────────────────────────────────
const PROJETOS = {
  museu_centro: {
    label: 'Museu Centro',
    nome_projeto: 'Projeto Museus Centro',
    termo_colaboracao: 'Termo de Colaboração 01-031.069/24-80',
    orgao_parceiro: 'Fundação Municipal de Cultura da Prefeitura Municipal de Belo Horizonte – MG (FMC)',
    // {museu} será substituído dinamicamente; se omitido (Geral/Comunicação), suprimir
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

// Centros de custo que NÃO precisam indicar museu na descrição da NF
const CC_SEM_MUSEU = ['Geral/Transversal', 'Coordenação', 'Comunicação', 'Administrativo-financeiro', 'Consultorias', 'Publicações', 'Despesas Gerais'];

// Monta a descrição da NF dinamicamente conforme projeto e centro de custo selecionados
function montarDescricaoNF(projeto, centroCusto, museuLocal) {
  if (!projeto) return '';
  const base = projeto.descricao_nf_base || '';
  const semMuseu = !centroCusto || CC_SEM_MUSEU.includes(centroCusto);
  if (semMuseu || !museuLocal || museuLocal === 'Outro') return base;
  return `${base} – ${museuLocal}`;
}

const DADOS_CONTRATANTE = {
  nome: 'OSC Viaduto das Artes',
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

function valorPorExtenso(valor) {
  // Conversão simples para valores comuns
  const num = parseFloat(valor || 0);
  if (!num || isNaN(num)) return '';
  const formatted = num.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  return `R$ ${formatted}`;
}

const EMPTY_FORM = {
  projeto: '',
  numero_termo: '',
  // Contratado
  contratado_nome: '',
  contratado_cpf_cnpj: '',
  contratado_representante: '',
  contratado_cpf_representante: '',
  contratado_endereco: '',
  contratado_telefone: '',
  contratado_email: '',
  // Objeto / Escopo
  objeto: '',
  escopo: '',
  museu_local: '',
  periodo_execucao: '',
  // Valores
  valor_total: '',
  detalhamento_valores: '',
  forma_pagamento: 'PIX, transferência online ou depósito bancário',
  // Dados bancários
  banco: '',
  agencia: '',
  conta: '',
  pix: '',
  // NF
  descricao_nf_editavel: '',
  // Rubrica / CC
  rubrica_vinculada: '',
  centro_custo: '',
  // Assinatura
  data_assinatura: '',
  cidade_assinatura: 'Belo Horizonte',
  // Testemunhas
  testemunha1_nome: '',
  testemunha1_cpf: '',
  testemunha2_nome: '',
  testemunha2_cpf: '',
};

export default function GeradorTermoCompromisso() {
  const [step, setStep] = useState('projeto'); // 'projeto' | 'form' | 'preview'
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [numeroTermo, setNumeroTermo] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  const { data: termos = [] } = useQuery({
    queryKey: ['termos'],
    queryFn: () => base44.entities.TermoCompromisso.list(),
  });

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-ativas'],
    queryFn: () => base44.entities.Rubrica.filter({ ativo: true }),
  });

  useEffect(() => {
    const ano = new Date().getFullYear();
    const num = (termos.length || 0) + 1;
    setNumeroTermo(String(num).padStart(2, '0'));
  }, [termos]);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.TermoCompromisso.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['termos'] }),
  });

  const handleField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleProjetoSelect = (projeto) => {
    const proj = PROJETOS[projeto];
    setFormData(prev => ({
      ...prev,
      projeto,
      descricao_nf_editavel: montarDescricaoNF(proj, prev.centro_custo, prev.museu_local),
    }));
    setStep('form');
  };

  // Recalcula descrição da NF automaticamente ao mudar CC ou museu
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

  const projetoAtual = PROJETOS[formData.projeto] || null;

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    try {
      const payload = {
        ...formData,
        numero_termo: numeroTermo,
        dados_contratante: DADOS_CONTRATANTE,
        projeto_config: projetoAtual,
      };

      const response = await base44.functions.invoke('generateTermoPDF', payload);

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TC-${numeroTermo}-${formData.contratado_nome.split(' ')[0] || 'termo'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

      await saveMutation.mutateAsync({
        numero_termo: `TC-${numeroTermo}`,
        projeto: formData.projeto,
        contratado_nome: formData.contratado_nome,
        objeto: formData.objeto,
        valor_total: parseFloat(formData.valor_total) || 0,
        status: 'gerado',
      });

      toast.success('Termo gerado e salvo com sucesso!');
    } catch (error) {
      toast.error('Erro ao gerar PDF: ' + (error?.message || 'Tente novamente'));
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Tela 1: seleção de projeto ───────────────────────────────────────────
  if (step === 'projeto') {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center justify-center">
        <div className="max-w-lg w-full">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-7 h-7 text-slate-700" />
            <h1 className="text-2xl font-bold text-slate-900">Gerador de Termo de Compromisso</h1>
          </div>
          <p className="text-slate-500 mb-8 text-sm">Selecione o projeto/instrumento que será utilizado neste termo:</p>

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

  // ── Tela 2: formulário ───────────────────────────────────────────────────
  return (
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
              <span className="text-xs text-slate-400">Nº {numeroTermo}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveMutation.mutate({ ...formData, numero_termo: `TC-${numeroTermo}`, status: 'rascunho' })}
            >
              <Check className="w-4 h-4 mr-1" /> Salvar
            </Button>
            <Button
              size="sm"
              className="bg-slate-900 hover:bg-slate-800 text-white"
              onClick={handleGeneratePDF}
              disabled={isGenerating || !formData.contratado_nome || !formData.objeto || !formData.valor_total}
            >
              <Download className="w-4 h-4 mr-1" />
              {isGenerating ? 'Gerando...' : 'Gerar PDF'}
            </Button>
          </div>
        </div>

        {/* Projeto selecionado - info */}
        <Card className="mb-6 border-blue-100 bg-blue-50">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-semibold text-blue-800 mb-1">PROJETO SELECIONADO</p>
            <p className="text-sm font-medium text-blue-900">{projetoAtual?.nome_projeto}</p>
            <p className="text-xs text-blue-700 mt-0.5">{projetoAtual?.termo_colaboracao}</p>
            <p className="text-xs text-blue-600 mt-0.5">{projetoAtual?.orgao_parceiro}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Col 1 */}
          <div className="space-y-5">

            {/* Número do Termo */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Número do Termo</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500 font-mono">TC-</span>
                  <Input
                    value={numeroTermo}
                    onChange={e => setNumeroTermo(e.target.value)}
                    className="font-mono"
                    placeholder="68"
                  />
                </div>
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
                  <label className="text-xs text-slate-500 mb-1 block">Representante Legal (se PJ)</label>
                  <Input value={formData.contratado_representante} onChange={e => handleField('contratado_representante', e.target.value)} placeholder="Nome do representante legal" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">CPF do Representante</label>
                  <Input value={formData.contratado_cpf_representante} onChange={e => handleField('contratado_cpf_representante', e.target.value)} placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Endereço Completo *</label>
                  <Textarea value={formData.contratado_endereco} onChange={e => handleField('contratado_endereco', e.target.value)} placeholder="Rua, número, bairro, cidade-UF, CEP" rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Telefone *</label>
                    <Input value={formData.contratado_telefone} onChange={e => handleField('contratado_telefone', e.target.value)} placeholder="(31) 9xxxx-xxxx" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">E-mail *</label>
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
                  <label className="text-xs text-slate-500 mb-1 block">Escopo detalhado *</label>
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
                  <label className="text-xs text-slate-500 mb-1 block">Detalhamento dos valores (opcional)</label>
                  <Textarea value={formData.detalhamento_valores} onChange={e => handleField('detalhamento_valores', e.target.value)} placeholder="ex: R$ 2.500,00 referente à palestra e R$ 1.200,00 referente ao passeio" rows={2} />
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

            {/* Rubrica e CC */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Classificação Orçamentária</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Rubrica vinculada</label>
                  <Select value={formData.rubrica_vinculada} onValueChange={v => handleField('rubrica_vinculada', v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione a rubrica" /></SelectTrigger>
                    <SelectContent>
                      {rubricas.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.rubrica} {r.grupo ? `(${r.grupo})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Centro de custo</label>
                  <Select value={formData.centro_custo} onValueChange={handleCentroCusto}>
                    <SelectTrigger><SelectValue placeholder="Selecione o centro de custo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MHAB">MHAB</SelectItem>
                      <SelectItem value="MIS BH">MIS BH</SelectItem>
                      <SelectItem value="MUMO">MUMO</SelectItem>
                      <SelectItem value="Geral/Transversal">Geral/Transversal</SelectItem>
                      <SelectItem value="Coordenação">Coordenação</SelectItem>
                      <SelectItem value="Comunicação">Comunicação</SelectItem>
                      <SelectItem value="Educação">Educação</SelectItem>
                      <SelectItem value="Produção">Produção</SelectItem>
                      <SelectItem value="Administrativo-financeiro">Administrativo-financeiro</SelectItem>
                      <SelectItem value="Noturno nos Museus">Noturno nos Museus</SelectItem>
                      <SelectItem value="Publicações">Publicações</SelectItem>
                      <SelectItem value="Consultorias">Consultorias</SelectItem>
                      <SelectItem value="Despesas Gerais">Despesas Gerais</SelectItem>
                    </SelectContent>
                  </Select>
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
                    <label className="text-xs text-slate-500 mb-1 block">Data de assinatura *</label>
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
          <Button variant="outline" onClick={() => saveMutation.mutate({ ...formData, numero_termo: `TC-${numeroTermo}`, status: 'rascunho' })}>
            <Check className="w-4 h-4 mr-1" /> Salvar rascunho
          </Button>
          <Button
            className="bg-slate-900 hover:bg-slate-800 text-white px-8"
            onClick={handleGeneratePDF}
            disabled={isGenerating || !formData.contratado_nome || !formData.objeto || !formData.valor_total}
          >
            <Download className="w-4 h-4 mr-1" />
            {isGenerating ? 'Gerando PDF...' : 'Gerar PDF'}
          </Button>
        </div>
      </div>
    </div>
  );
}