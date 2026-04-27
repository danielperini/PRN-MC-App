import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, AlertCircle, CheckCircle2, Send, Plus, Trash2, SplitSquareHorizontal, BookOpen } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const MUSEUS_RATEIO = ['MHAB', 'MIS', 'MUMO'];

const DEFAULT_RATEIO = MUSEUS_RATEIO.map(m => ({ museu: m, valor: '' }));

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const [rubricas, setRubricas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const ia = intake.resultado_ia || {};

  // Rateamento
  const [dividirEntreMuseus, setDividirEntreMuseus] = useState(false);
  const [rateio, setRateio] = useState(DEFAULT_RATEIO);

  const [form, setForm] = useState({
    nf_numero: ia.nf_numero || '',
    nf_valor_total: ia.nf_valor_total || '',
    nf_data_emissao: ia.nf_data_emissao || '',
    nf_emitente_nome: ia.nf_emitente_nome || '',
    nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
    nf_destinatario_nome: ia.nf_destinatario_nome || '',
    descricao_servico: ia.descricao_servico || '',
    municipio: ia.municipio || '',
    competencia: ia.competencia || '',
    centro_custo: intake.centro_custo || '',
    rubrica_id: intake.rubrica_id_sugerida || '',
    file_name_final: intake.file_name_final || intake.file_name_original,
    meta_id: '',
    categoria: '',
    tipo_gasto: 'Serviço',
    budgetline_id: '',
  });

  const [budgetLines, setBudgetLines] = useState([]);

  useEffect(() => {
    async function loadRubricas() {
      try {
        const list = await base44.entities.Rubrica.list('', 200);
        setRubricas((list || []).filter(r => r.ativo !== false));
      } catch (e) {
        console.error(e);
      }
    }
    async function loadBudgetLines() {
      try {
        const list = await base44.entities.BudgetLine.list('', 200);
        setBudgetLines((list || []).filter(b => b.ativo !== false));
      } catch (e) {
        console.error(e);
      }
    }
    loadRubricas();
    loadBudgetLines();
  }, []);

  // Converter valor (suporta pt-BR "1.234,56" e US "1234.56")
  function parseValorBR(v) {
    const s = String(v || '0').trim().replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
      return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(s.replace(',', '.')) || 0;
  }

  // Reconstruir nome padronizado com valores atuais
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

  // Atualiza nome automaticamente ao editar número, fornecedor ou valor
  useEffect(() => {
    setForm(f => ({ ...f, file_name_final: buildNomePadronizado() }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.nf_numero, form.nf_emitente_nome, form.nf_valor_total]);

  // Calcular totais do rateio
  const valorTotal = parseValorBR(form.nf_valor_total);
  const totalRateado = rateio.reduce((sum, r) => sum + (parseFloat(r.valor) || 0), 0);
  const diferencaRateio = Math.abs(valorTotal - totalRateado);
  const rateioValido = dividirEntreMuseus ? diferencaRateio < 0.01 && rateio.some(r => parseFloat(r.valor) > 0) : true;

  function handleRateioValor(museu, valor) {
    setRateio(prev => prev.map(r => r.museu === museu ? { ...r, valor } : r));
  }

  function distribuirIgualmente() {
    const museusSelecionados = rateio.filter(r => r.museu);
    const valorPorMuseu = (valorTotal / museusSelecionados.length).toFixed(2);
    setRateio(MUSEUS_RATEIO.map(m => ({ museu: m, valor: valorPorMuseu })));
  }

  function getRateioPayload() {
    if (!dividirEntreMuseus) return null;
    return rateio
      .filter(r => parseFloat(r.valor) > 0)
      .map(r => ({ museu: r.museu, valor: parseFloat(r.valor) }));
  }

  async function handleSalvarRascunho() {
    setSaving(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'RASCUNHO',
        resultado_ia: { ...ia, ...form, rateio_museus: getRateioPayload(), dividir_entre_museus: dividirEntreMuseus },
        centro_custo: form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id,
        file_name_final: form.file_name_final,
        revisado_pelo_usuario: true,
      });
      toast({ title: 'Rascunho salvo com sucesso.' });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao salvar rascunho', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function atualizarRubrica(rubricaId, valorDebito) {
    const rubrica = await base44.entities.Rubrica.get(rubricaId);
    if (!rubrica) return;
    
    // Usa valor_total primeiro, depois valor_rubrica como fallback
    const valorTotal = rubrica.valor_total || rubrica.valor_rubrica || 0;
    const utilizado = (rubrica.valor_utilizado || 0) + valorDebito;
    const comprometido = rubrica.saldo_comprometido || 0;
    const saldo = valorTotal - utilizado - comprometido;
    const percentual = valorTotal > 0 ? (utilizado / valorTotal) * 100 : 0;
    
    await base44.entities.Rubrica.update(rubricaId, {
      valor_utilizado: utilizado,
      saldo_comprometido: comprometido,
      saldo: saldo,
      percentual_utilizado: percentual,
    });
  }

  async function debitarRubricas(rateioPayload) {
    // Agrupa débitos por rubrica_id para evitar escritas concorrentes
    const debitosPorRubrica = {};

    for (const item of rateioPayload) {
      // Busca se existe uma RubricaMuseuConfig específica para este museu
      const configs = await base44.entities.RubricaMuseuConfig.filter({
        rubrica_id: form.rubrica_id,
        museu: item.museu,
      });

      // Usa a rubrica_id da config (sempre igual a form.rubrica_id neste caso)
      // mas respeita o divisor se configurado
      const rubricaAlvo = (configs && configs.length > 0)
        ? configs[0].rubrica_id
        : form.rubrica_id;

      debitosPorRubrica[rubricaAlvo] = (debitosPorRubrica[rubricaAlvo] || 0) + item.valor;
    }

    for (const [rubricaId, valorTotal] of Object.entries(debitosPorRubrica)) {
      try {
        await atualizarRubrica(rubricaId, valorTotal);
      } catch (e) {
        console.error(`Erro ao debitar rubrica ${rubricaId}:`, e);
      }
    }
  }

  async function debitarRubricaSimples(valor) {
    // Sem rateio: debita o valor total na rubrica selecionada
    try {
      const rubrica = await base44.entities.Rubrica.get(form.rubrica_id);
      if (rubrica) {
        const valorTotal = rubrica.valor_total || rubrica.valor_rubrica || 0;
        const utilizado = (rubrica.valor_utilizado || 0) + valor;
        const comprometido = rubrica.saldo_comprometido || 0;
        const saldo = valorTotal - utilizado - comprometido;
        const percentual = valorTotal > 0 ? (utilizado / valorTotal) * 100 : 0;
        
        await base44.entities.Rubrica.update(rubrica.id, {
          valor_utilizado: utilizado,
          saldo_comprometido: comprometido,
          saldo: saldo,
          percentual_utilizado: percentual,
        });
      }
    } catch (e) {
      console.error('Erro ao debitar rubrica:', e);
    }
  }

  async function handleEnviarAprovacao() {
    if (!form.meta_id) {
      toast({ title: 'Selecione a meta antes de enviar.', variant: 'destructive' });
      return;
    }
    if (!form.categoria) {
      toast({ title: 'Selecione a categoria antes de enviar.', variant: 'destructive' });
      return;
    }
    if (!form.budgetline_id) {
      toast({ title: 'Selecione a linha orçamentária antes de enviar.', variant: 'destructive' });
      return;
    }
    if (!form.centro_custo && !dividirEntreMuseus) {
      toast({ title: 'Selecione o centro de custo antes de enviar.', variant: 'destructive' });
      return;
    }
    if (dividirEntreMuseus && !rateioValido) {
      toast({ title: `A soma do rateio (R$ ${totalRateado.toFixed(2)}) deve ser igual ao valor total (R$ ${valorTotal.toFixed(2)}).`, variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const rateioPayload = getRateioPayload();
      const observacoesRateio = rateioPayload
        ? `Rateio entre museus: ${rateioPayload.map(r => `${r.museu}: R$ ${r.valor.toFixed(2)}`).join(', ')}.`
        : '';

      const pr = await base44.entities.PurchaseRequest.create({
        descricao_item: form.descricao_servico || form.nf_emitente_nome,
        fornecedor_nome: form.nf_emitente_nome,
        fornecedor_cnpj: form.nf_emitente_cpf_cnpj,
        valor_solicitado: valorTotal,
        meta_id: form.meta_id,
        categoria: form.categoria,
        tipo_gasto: form.tipo_gasto,
        budgetline_id: form.budgetline_id,
        centro_custo: dividirEntreMuseus ? 'Rateado' : form.centro_custo,
        rubrica_id: form.rubrica_id,
        status: 'SOLICITADO',
        observacoes: `Criado via Entrada Única de Documentos. NF ${form.nf_numero} - ${form.nf_emitente_nome}. Arquivo: ${form.file_name_final}. ${observacoesRateio}`.trim(),
      });

      await base44.entities.Attachment.create({
        report_id: '',
        file_name: form.file_name_final,
        file_type: intake.mime_type,
        file_url: intake.arquivo_original_url,
        description: `NF ${form.nf_numero} - ${form.nf_emitente_nome}`,
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
      });

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: pr.id,
        centro_custo: dividirEntreMuseus ? 'Rateado' : form.centro_custo,
        rubrica_id_sugerida: form.rubrica_id,
        file_name_final: form.file_name_final,
        resultado_ia: { ...ia, ...form, rateio_museus: rateioPayload, dividir_entre_museus: dividirEntreMuseus },
        revisado_pelo_usuario: true,
      });

      // Debitar valores na(s) rubrica(s) correspondente(s)
      if (dividirEntreMuseus && rateioPayload && rateioPayload.length > 0) {
        await debitarRubricas(rateioPayload);
      } else {
        await debitarRubricaSimples(valorTotal);
      }

      toast({
        title: 'Documento enviado e rubrica atualizada.',
        description: observacoesRateio || `R$ ${valorTotal.toFixed(2)} debitado da rubrica selecionada.`,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao enviar', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              Conferência de Nota Fiscal
            </DialogTitle>
            <a href="/GuiaNotaFiscal" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="text-xs h-8">
                <BookOpen className="w-3 h-3 mr-1" />
                Ver guia
              </Button>
            </a>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status IA */}
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Documento analisado. Revise as informações antes de enviar.
          </div>

          {/* Inconsistências — remove falsos positivos de "data futura" */}
          {(() => {
            const hoje = new Date();
            const errosFiltrados = (intake.erros_validacao || []).filter(e => {
              const txt = String(e).toLowerCase();
              if (txt.includes('futura') || txt.includes('future')) {
                const match = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                if (match) {
                  const dataDoc = new Date(`${match[3]}-${match[2]}-${match[1]}`);
                  if (dataDoc <= hoje) return false;
                }
              }
              return true;
            });
            return errosFiltrados.length > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
                <p className="font-medium flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Inconsistências detectadas:</p>
                {errosFiltrados.map((e, i) => <p key={i}>• {e}</p>)}
              </div>
            ) : null;
          })()}

          {/* Nome do arquivo */}
          <div className="space-y-1">
            <Label>Nome padronizado do arquivo</Label>
            <Input value={form.file_name_final} onChange={e => setForm(f => ({ ...f, file_name_final: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Número da NF</Label>
              <Input value={form.nf_numero} onChange={e => setForm(f => ({ ...f, nf_numero: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Valor Total (R$)</Label>
              <Input value={form.nf_valor_total} onChange={e => setForm(f => ({ ...f, nf_valor_total: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Data de Emissão</Label>
              <Input type="date" value={form.nf_data_emissao} onChange={e => setForm(f => ({ ...f, nf_data_emissao: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Competência</Label>
              <Input value={form.competencia} onChange={e => setForm(f => ({ ...f, competencia: e.target.value }))} placeholder="Ex: Março/2026" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Fornecedor / Emitente</Label>
            <Input value={form.nf_emitente_nome} onChange={e => setForm(f => ({ ...f, nf_emitente_nome: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>CNPJ / CPF do Emitente</Label>
              <Input value={form.nf_emitente_cpf_cnpj} onChange={e => setForm(f => ({ ...f, nf_emitente_cpf_cnpj: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Município</Label>
              <Input value={form.municipio} onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Descrição do Serviço / Item</Label>
            <Input value={form.descricao_servico} onChange={e => setForm(f => ({ ...f, descricao_servico: e.target.value }))} />
          </div>

          {/* Meta ID */}
          <div className="space-y-1">
            <Label>Meta do 3º Aditivo <span className="text-red-500">*</span></Label>
            <Select value={form.meta_id} onValueChange={v => setForm(f => ({ ...f, meta_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar meta" /></SelectTrigger>
              <SelectContent>
                {['MC3A-20', 'MC3A-21', 'MC3A-22', 'MC3A-23', 'MC3A-24', 'MC3A-25', 'MC3A-EXTRA'].map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Categoria */}
          <div className="space-y-1">
            <Label>Categoria <span className="text-red-500">*</span></Label>
            <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar categoria" /></SelectTrigger>
              <SelectContent>
                {['Serviços (equipe/coordenação)', 'Serviços (comunicação: designer, foto, vídeo, imprensa, redes)', 'Serviços (produção/infraestrutura/expografia)', 'Serviços (eventos/atrações/artistas)', 'Serviços (segurança/limpeza)', 'Logística (transporte/vans)', 'Alimentação (lanche/café/coffeebreak)', 'Consultoria / Formação / Acessibilidade', 'Materiais de consumo', 'Outros'].map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de Gasto */}
          <div className="space-y-1">
            <Label>Tipo de Gasto <span className="text-red-500">*</span></Label>
            <Select value={form.tipo_gasto} onValueChange={v => setForm(f => ({ ...f, tipo_gasto: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Produto">Produto</SelectItem>
                <SelectItem value="Serviço">Serviço</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Rubrica */}
          <div className="space-y-1">
            <Label>Rubrica Orçamentária <span className="text-red-500">*</span></Label>
            <Select value={form.budgetline_id} onValueChange={v => setForm(f => ({ ...f, budgetline_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar linha orçamentária" /></SelectTrigger>
              <SelectContent>
                {budgetLines.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.nome || b.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rubrica Direta (alternativa) */}
          <div className="space-y-1">
            <Label>Rubrica Direta (opcional)</Label>
            <Select value={form.rubrica_id} onValueChange={v => setForm(f => ({ ...f, rubrica_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar rubrica" /></SelectTrigger>
              <SelectContent>
                {rubricas.map(r => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.rubrica || r.nome || r.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {intake.rubrica_justificativa && (
              <p className="text-xs text-slate-500 italic mt-1">
                💡 Sugestão IA: {intake.rubrica_justificativa}
              </p>
            )}
          </div>

          {/* ─── RATEAMENTO ─── */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SplitSquareHorizontal className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">Rateamento da Rubrica</span>
              </div>
            </div>

            {/* Opção: Geral ou dividido */}
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rateio_tipo"
                  checked={!dividirEntreMuseus}
                  onChange={() => setDividirEntreMuseus(false)}
                  className="accent-slate-700"
                />
                <span className="text-slate-700">Pago pela verba geral (sem rateio entre museus)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rateio_tipo"
                  checked={dividirEntreMuseus}
                  onChange={() => setDividirEntreMuseus(true)}
                  className="accent-slate-700"
                />
                <span className="text-slate-700">Dividir entre museus</span>
              </label>
            </div>

            {/* Se não dividir: centro de custo simples */}
            {!dividirEntreMuseus && (
              <div className="space-y-1">
                <Label>Centro de Custo <span className="text-red-500">*</span></Label>
                <Select value={form.centro_custo} onValueChange={v => setForm(f => ({ ...f, centro_custo: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {CENTROS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Se dividir: tabela de rateio */}
            {dividirEntreMuseus && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">Informe o valor de cada museu. A soma deve ser igual ao valor total da NF.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={distribuirIgualmente}
                    className="text-xs h-7"
                  >
                    Dividir igualmente
                  </Button>
                </div>

                <div className="space-y-2">
                  {rateio.map(r => (
                    <div key={r.museu} className="flex items-center gap-3">
                      <span className="w-16 text-sm font-medium text-slate-700 flex-shrink-0">{r.museu}</span>
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0,00"
                          value={r.valor}
                          onChange={e => handleRateioValor(r.museu, e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totalizador */}
                <div className={`flex justify-between items-center text-sm font-medium px-1 py-2 rounded-lg border ${rateioValido ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <span>Total rateado:</span>
                  <span>R$ {totalRateado.toFixed(2)} {valorTotal > 0 && `/ R$ ${valorTotal.toFixed(2)}`}</span>
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

          {/* Aviso financeiro */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
            ⚡ Ao enviar, o valor será debitado imediatamente da(s) rubrica(s) correspondente(s), atualizando o valor realizado e o saldo disponível.
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button variant="outline" onClick={handleSalvarRascunho} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Rascunho
            </Button>
            <Button
              onClick={handleEnviarAprovacao}
              disabled={sending || !form.meta_id || !form.categoria || !form.budgetline_id || (!dividirEntreMuseus && !form.centro_custo) || (dividirEntreMuseus && !rateioValido)}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar para Aprovação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}