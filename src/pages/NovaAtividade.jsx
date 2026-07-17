import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, PlusCircle, CheckCircle2 } from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';

const CLASSIFICACOES = [
  { value: 'META', label: 'Meta do projeto' },
  { value: 'ROTINA', label: 'Rotina' },
  { value: 'EXTRA', label: 'Atividade extra' },
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Geral'];

// Apenas meses relevantes a partir de fevereiro de 2026
const MESES = [
  'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Metas do 3º e 4º Aditivo (alinhado com METAS_OFICIAIS em metaFinancialMetrics.js)
const METAS_FALLBACK = [
  { id: '1 - Equipe principal', nome: '1 - Equipe principal' },
  { id: '2 - Plano de comunicação', nome: '2 - Plano de comunicação' },
  { id: '3 - Manutenção das exposições', nome: '3 - Manutenção das exposições' },
  { id: '4 - Alteração de núcleos e salas expositivas', nome: '4 - Alteração de núcleos e salas expositivas' },
  { id: '7 - Contratação de educadores', nome: '7 - Contratação de educadores' },
  { id: '8 - Exposição e evento MHAB', nome: '8 - Exposição e evento MHAB' },
  { id: '9 - Exposição e evento MIS', nome: '9 - Exposição e evento MIS' },
  { id: '10 - Mostras de baixa/média complexidade (18 mostras)', nome: '10 - Mostras de baixa/média complexidade (18 mostras)' },
  { id: '11 - Noturno nos Museus (edições 2024, 2025 e 2026)', nome: '11 - Noturno nos Museus (edições 2024, 2025 e 2026)' },
  { id: '11B - Noturno Pampulha (4º Aditivo)', nome: '11B - Noturno Pampulha (4º Aditivo)' },
  { id: '12 - Exposição MHAB (pesquisa e curadoria)', nome: '12 - Exposição MHAB (pesquisa e curadoria)' },
  { id: '13 - Exposição MUMO (pesquisa e curadoria)', nome: '13 - Exposição MUMO (pesquisa e curadoria)' },
  { id: '14 - Acessibilidade', nome: '14 - Acessibilidade' },
  { id: '15 - Inscrição em Leis de Incentivo', nome: '15 - Inscrição em Leis de Incentivo' },
  { id: '16 - Diárias de educadores (101 diárias)', nome: '16 - Diárias de educadores (101 diárias)' },
  { id: '17 - Publicações e catálogos', nome: '17 - Publicações e catálogos' },
  { id: '18 - Custeio das atividades educativas e culturais', nome: '18 - Custeio das atividades educativas e culturais' },
  { id: '20 - Ações educativas e culturais — MHAB, MIS e MUMO (30 ações)', nome: '20 - Ações educativas e culturais — MHAB, MIS e MUMO (30 ações)' },
  { id: '21 - Exposição e evento MUMO', nome: '21 - Exposição e evento MUMO' },
  { id: '22 - Consultoria para execução do projeto', nome: '22 - Consultoria para execução do projeto' },
  { id: '23 - Despesas Gerais', nome: '23 - Despesas Gerais' },
];

const ANO_ATUAL = new Date().getFullYear();
// Default para o mês atual, mas nunca antes de Fevereiro
const _mesIndex = new Date().getMonth(); // 0=Jan
const MES_ATUAL = MESES[Math.max(0, _mesIndex - 1)] || MESES[0]; // -1 pois removemos Janeiro

export default function NovaAtividade() {
  const { user } = useCurrentUser();

  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    classificacao: 'ROTINA',
    meta_id: '',
    meta_codigo: '',
    museu: '',
    mes: MES_ATUAL,
    ano: String(ANO_ATUAL),
    publico_estimado: '',
    data_realizacao: '',
    data_inicio: '',
    data_fim: '',
    meta_quantitativa: '',
    periodo: '',
    observacoes: '',
  });

  const [metas, setMetas] = useState(METAS_FALLBACK);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));
  const setEv = (field) => (e) => set(field)(e.target.value);

  useEffect(() => {
    let mounted = true;

    async function loadMetas() {
      try {
        const list = await base44.entities.ProjectMeta.list('ordem', 500);
        const ativos = (list || [])
          .filter((meta) => {
            if (meta.ativo === false) return false;
            // Apenas metas do 3º e 4º Aditivo (ordem 1 a 25)
            const ordem = Number(meta.ordem);
            return Number.isFinite(ordem) && ordem >= 1 && ordem <= 25;
          })
          .map((meta) => ({
            id: meta.id || meta.nome,
            nome: meta.nome || meta.descricao || meta.id,
            descricao: meta.descricao || '',
          }))
          .filter((meta) => meta.nome);

        if (mounted && ativos.length > 0) {
          setMetas(ativos);
        }
      } catch (error) {
        if (mounted) setMetas(METAS_FALLBACK);
      }
    }

    loadMetas();
    return () => {
      mounted = false;
    };
  }, []);

  function handleMetaChange(value) {
    const meta = metas.find((item) => item.id === value || item.nome === value);
    setForm((prev) => ({
      ...prev,
      meta_id: value,
      meta_codigo: meta?.nome || value,
      classificacao: value && value !== 'Rotina' && value !== 'Extra' ? 'META' : prev.classificacao,
    }));
  }

  function resetForm() {
    setForm({
      titulo: '',
      descricao: '',
      classificacao: 'ROTINA',
      meta_id: '',
      meta_codigo: '',
      museu: '',
      mes: MES_ATUAL,
      ano: String(ANO_ATUAL),
      publico_estimado: '',
      data_realizacao: '',
      data_inicio: '',
      data_fim: '',
      meta_quantitativa: '',
      periodo: '',
      observacoes: '',
    });
  }

  async function handleSubmit() {
    if (!form.titulo.trim()) {
      toast.error('Informe o título da atividade.');
      return;
    }
    if (!form.museu) {
      toast.error('Selecione o museu.');
      return;
    }
    if (form.data_inicio && form.data_fim && form.data_fim < form.data_inicio) {
      toast.error('A data de fim não pode ser anterior à data de início.');
      return;
    }

    const dataInicio = form.data_inicio || form.data_realizacao || null;
    const dataFim = form.data_fim || form.data_inicio || form.data_realizacao || null;
    const dataRealizacao = form.data_realizacao || form.data_inicio || null;

    setSubmitting(true);
    try {
      // Usa createActivityWithAutoReport para garantir vínculo com relatório mensal
      await base44.functions.invoke('createActivityWithAutoReport', {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        classificacao: form.classificacao,
        meta_id: form.meta_id || null,
        meta_codigo: form.meta_codigo || '',
        museu: form.museu,
        mes: form.mes,
        ano: Number(form.ano),
        publico_estimado: form.publico_estimado ? Number(form.publico_estimado) : 0,
        data_realizacao: dataRealizacao,
        data_inicio: dataInicio,
        data_fim: dataFim,
        meta_quantitativa: form.meta_quantitativa.trim() || null,
        periodo: form.periodo.trim() || null,
        observacoes: form.observacoes.trim(),
        user_email: user?.email || '',
        user_name: user?.full_name || user?.email || '',
      });

      setDone(true);
      toast.success('Atividade criada e vinculada ao relatório mensal.');

      // Reset após 2s
      setTimeout(() => {
        setDone(false);
        resetForm();
      }, 2000);
    } catch (err) {
      // Fallback: cria direto no banco se a função falhar
      try {
        await base44.entities.Activity.create({
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim(),
          classificacao: form.classificacao,
          meta_id: form.meta_id || null,
          meta_codigo: form.meta_codigo || '',
          data_realizacao: dataRealizacao,
          data_inicio: dataInicio,
          data_fim: dataFim,
          publico_estimado: form.publico_estimado ? Number(form.publico_estimado) : 0,
          observacoes: form.observacoes.trim(),
        });
        toast.success('Atividade criada (sem vínculo automático com relatório).');
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      } catch (fallbackErr) {
        toast.error('Erro ao criar atividade: ' + (fallbackErr?.message || 'tente novamente.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Nova Atividade</h1>
        <p className="text-sm text-gray-500 mt-1">
          A atividade será automaticamente vinculada ao relatório mensal do museu.
        </p>
      </div>

      {done && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Atividade registrada com sucesso!
        </div>
      )}

      <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input
            placeholder="Ex: Oficina de fotografia para jovens"
            value={form.titulo}
            onChange={setEv('titulo')}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea
            placeholder="Descreva a atividade, objetivo e metodologia..."
            value={form.descricao}
            onChange={setEv('descricao')}
            className="min-h-[100px]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Classificação</Label>
            <Select value={form.classificacao} onValueChange={set('classificacao')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICACOES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Meta vinculada</Label>
            <Select value={form.meta_id} onValueChange={handleMetaChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a meta do projeto..." />
              </SelectTrigger>
              <SelectContent>
                {metas.map((meta) => (
                  <SelectItem key={meta.id || meta.nome} value={meta.id || meta.nome}>
                    {meta.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Museu *</Label>
            <Select value={form.museu} onValueChange={set('museu')}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {MUSEUS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Mês de referência</Label>
            <Select value={form.mes} onValueChange={set('mes')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Data de início</Label>
            <Input
              type="date"
              value={form.data_inicio}
              onChange={setEv('data_inicio')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Data de fim</Label>
            <Input
              type="date"
              value={form.data_fim}
              onChange={setEv('data_fim')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Data de realização</Label>
            <Input
              type="date"
              value={form.data_realizacao}
              onChange={setEv('data_realizacao')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Público estimado</Label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={form.publico_estimado}
              onChange={setEv('publico_estimado')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Período de execução</Label>
            <Input
              placeholder="Ex: Janeiro a Março de 2026"
              value={form.periodo}
              onChange={setEv('periodo')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Meta quantitativa</Label>
            <Input
              placeholder="Ex: 30 ações, 300 exemplares..."
              value={form.meta_quantitativa}
              onChange={setEv('meta_quantitativa')}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea
            placeholder="Informações adicionais, parcerias, imprevistos..."
            value={form.observacoes}
            onChange={setEv('observacoes')}
            className="min-h-[80px]"
          />
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full gap-2 bg-black text-white hover:bg-gray-900"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            {submitting ? 'Criando atividade...' : 'Criar atividade'}
          </Button>
        </div>
      </div>
    </div>
  );
}