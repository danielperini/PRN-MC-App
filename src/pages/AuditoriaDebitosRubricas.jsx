import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  RefreshCw,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  ArrowRightLeft,
  AlertTriangle,
  ExternalLink,
  FileText,
  Receipt,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const STATUS_DEBITA = new Set(['PAGO', 'APROVADO_ADMIN', 'APROVADO_COORD']);
const money = v => Math.round((Number(v) || 0) * 100) / 100;
const pv = p =>
  money(p?.valor_pago || p?.valor_aprovado_admin || p?.nf_valor_total || p?.valor_total || p?.valor_aprovado || p?.valor_solicitado || 0);
const fmt = v =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function debita(p) {
  if (!STATUS_DEBITA.has(String(p?.status || '').toUpperCase())) return false;
  if (p?.incluir_no_somatorio === false) return false;
  if (p?.duplicada_financeira) return false;
  return true;
}

async function fetchTudo() {
  // 1. Todas as rubricas
  const rubricas = [];
  let skip = 0;
  while (true) {
    const batch = await base44.entities.Rubrica.list('-created_date', 500, skip).catch(() => []);
    if (!batch?.length) break;
    rubricas.push(...batch);
    if (batch.length < 500) break;
    skip += 500;
  }

  // 2. Todas as PAs vinculadas a rubrica
  const pas = [];
  skip = 0;
  while (true) {
    const batch = await base44.entities.PurchaseRequest.filter(
      { rubrica_id: { $exists: true, $ne: '' } },
      '-updated_date',
      500,
      skip
    ).catch(() => []);
    if (!batch?.length) break;
    pas.push(...batch);
    if (batch.length < 500) break;
    skip += 500;
  }

  return { rubricas, pas };
}

function buildGrupos(rubricas, pas) {
  const mapaRub = new Map(rubricas.map(r => [r.id, r]));
  const grupos = new Map(); // rubrica_id -> { rubrica, debitantes: [] }
  for (const p of pas) {
    if (!debita(p)) continue;
    const r = mapaRub.get(p.rubrica_id);
    if (!r) continue;
    if (!grupos.has(p.rubrica_id)) {
      grupos.set(p.rubrica_id, {
        rubrica_id: p.rubrica_id,
        rubrica: r,
        debitantes: [],
        valor_debitado: 0,
      });
    }
    const g = grupos.get(p.rubrica_id);
    g.debitantes.push(p);
    g.valor_debitado = money(g.valor_debitado + pv(p));
  }
  return [...grupos.values()].sort((a, b) => b.valor_debitado - a.valor_debitado);
}

export default function AuditoriaDebitosRubricas() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [filtroCentro, setFiltroCentro] = useState('all');
  const [expandido, setExpandido] = useState(new Set());
  const [selecionados, setSelecionados] = useState(new Set());
  const [destinoId, setDestinoId] = useState('');
  const [movendo, setMovendo] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['auditoria-debitos-rubricas'],
    queryFn: fetchTudo,
    staleTime: 30 * 1000,
  });

  const grupos = useMemo(() => {
    if (!data) return [];
    let g = buildGrupos(data.rubricas, data.pas);
    if (filtroCentro !== 'all') {
      g = g.filter(x => String(x.rubrica?.centro_custo || '').toLowerCase() === filtroCentro.toLowerCase());
    }
    if (busca.trim()) {
      const q = busca.toLowerCase();
      g = g.filter(x =>
        String(x.rubrica?.rubrica || x.rubrica?.nome || '').toLowerCase().includes(q) ||
        String(x.rubrica?.grupo || '').toLowerCase().includes(q)
      );
    }
    return g;
  }, [data, filtroCentro, busca]);

  const centros = useMemo(() => {
    if (!data) return [];
    const set = new Set();
    data.rubricas.forEach(r => r.centro_custo && set.add(r.centro_custo));
    return [...set].sort();
  }, [data]);

  const resumo = useMemo(() => {
    if (!data) return { total: 0, debitado: 0, divergente: 0 };
    const all = buildGrupos(data.rubricas, data.pas);
    let divergente = 0;
    let debitado = 0;
    for (const g of all) {
      const dbVal = money(g.rubrica?.valor_utilizado);
      if (Math.abs(dbVal - g.valor_debitado) >= 0.01) divergente++;
      debitado += g.valor_debitado;
    }
    return { total: all.length, debitado, divergente };
  }, [data]);

  function toggleExpande(id) {
    setExpandido(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleSel(id) {
    setSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function marcarTodosGrupo(grupo) {
    setSelecionados(prev => {
      const n = new Set(prev);
      const todos = grupo.debitantes.every(p => n.has(p.id));
      if (todos) grupo.debitantes.forEach(p => n.delete(p.id));
      else grupo.debitantes.forEach(p => n.add(p.id));
      return n;
    });
  }

  async function moverSelecionados() {
    if (!destinoId) {
      toast.error('Selecione a rubrica de destino.');
      return;
    }
    if (selecionados.size === 0) {
      toast.error('Nenhum item selecionado.');
      return;
    }
    const ids = [...selecionados];
    setMovendo(true);
    try {
      // Bulk update PA.rubrica_id
      await base44.entities.PurchaseRequest.bulkUpdate(
        ids.map(id => ({ id, rubrica_id: destinoId }))
      );

      // Recalcular rubricas afetadas (origem + destino)
      const origensIds = new Set();
      for (const p of data.pas) {
        if (ids.includes(p.id)) origensIds.add(p.rubrica_id);
      }
      const afetadas = [...new Set([...origensIds, destinoId])];
      const todasRub = data.rubricas.filter(r => afetadas.includes(r.id));

      for (const r of todasRub) {
        const aprovados = data.pas.filter(
          p =>
            p.rubrica_id === r.id &&
            debita(p) &&
            (destinoId === r.id ? true : !ids.includes(p.id))
        );
        // Para destino: precisamos somar também os recém movidos
        let utiliz = aprovados.reduce((s, p) => s + pv(p), 0);
        if (r.id === destinoId) {
          const movidos = data.pas.filter(p => ids.includes(p.id) && debita(p));
          utiliz = money(utiliz + movidos.reduce((s, p) => s + pv(p), 0));
        }
        const totalRub = money(r.valor_rubrica || r.valor_total);
        const saldo = money(totalRub - utiliz);
        const pct = totalRub > 0 ? Number(((utiliz / totalRub) * 100).toFixed(2)) : 0;
        await base44.entities.Rubrica.update(r.id, {
          valor_utilizado: utiliz,
          saldo,
          saldo_real: saldo,
          percentual_utilizado: pct,
        });
      }

      toast.success(`${ids.length} item(ns) movidos para a rubrica de destino.`);
      setSelecionados(new Set());
      setDestinoId('');
      await qc.invalidateQueries({ queryKey: ['auditoria-debitos-rubricas'] });
      await refetch();
    } catch (e) {
      toast.error('Falha ao mover: ' + String(e?.message || e).slice(0, 120));
    } finally {
      setMovendo(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              <h1 className="text-2xl font-semibold">Auditoria de Débitos por Rubrica</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Liste cada rubrica com seus débitos ativos (solicitações e notas). Selecione múltiplos itens e realoque para outra rubrica.
            </p>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2 self-start">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* Sumário */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card label="Rubricas com débito" value={resumo.total} icon={<Receipt className="w-4 h-4" />} />
          <Card label="Total debitado" value={fmt(resumo.debitado)} icon={<FileText className="w-4 h-4" />} />
          <Card label="Divergentes (DB≠calc)" value={resumo.divergente} tone="warn"
            icon={<AlertTriangle className="w-4 h-4" />} />
          <Card label="Itens selecionados" value={selecionados.size} tone={selecionados.size ? 'accent' : 'info'} />
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filtrar por nome da rubrica ou grupo"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filtroCentro} onValueChange={setFiltroCentro}>
            <SelectTrigger className="sm:w-64">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Centro de custo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os centros</SelectItem>
              {centros.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Lista de rubricas e seus débitos */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : grupos.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-10">
            Nenhuma rubrica com débito ativo para os filtros aplicados.
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map(grupo => {
              const exp = expandido.has(grupo.rubrica_id);
              const dbVal = money(grupo.rubrica?.valor_utilizado);
              const divergente = Math.abs(dbVal - grupo.valor_debitado) >= 0.01;
              const todosSel = grupo.debitantes.length > 0 && grupo.debitantes.every(p => selecionados.has(p.id));
              return (
                <div key={grupo.rubrica_id} className="rounded-xl border bg-card overflow-hidden">
                  <div className="flex items-center gap-3 p-3 md:p-4">
                    <button onClick={() => toggleExpande(grupo.rubrica_id)} className="p-1 hover:bg-muted rounded">
                      {exp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => marcarTodosGrupo(grupo)}
                      className="p-1 hover:bg-muted rounded"
                      title={todosSel ? 'Desmarcar todos' : 'Marcar todos'}
                    >
                      {todosSel ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium truncate">
                          {grupo.rubrica?.rubrica || grupo.rubrica?.nome || 'Rubrica sem nome'}
                        </span>
                        {grupo.rubrica?.centro_custo && (
                          <Badge variant="outline" className="font-normal">{grupo.rubrica.centro_custo}</Badge>
                        )}
                        {divergente && (
                          <Badge variant="destructive" className="font-normal">DB≠calc</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {grupo.rubrica?.grupo || '—'} · {grupo.debitantes.length} débito(s)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{fmt(grupo.valor_debitado)}</div>
                      <div className="text-xs text-muted-foreground">
                        DB: {fmt(dbVal)} · {grupo.rubrica?.valor_rubrica || grupo.rubrica?.valor_total ? `Prev: ${fmt(grupo.rubrica?.valor_rubrica || grupo.rubrica?.valor_total)}` : ''}
                      </div>
                    </div>
                  </div>

                  {exp && (
                    <div className="border-t bg-muted/30">
                      {grupo.debitantes.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">Sem débitos ativos.</div>
                      ) : (
                        <div className="divide-y">
                          {grupo.debitantes.map(p => (
                            <div key={p.id} className="flex items-start gap-3 p-3 hover:bg-muted/40">
                              <button
                                onClick={() => toggleSel(p.id)}
                                className="mt-0.5 p-1 hover:bg-muted rounded"
                              >
                                {selecionados.has(p.id) ? (
                                  <CheckSquare className="w-4 h-4 text-primary" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  NF {p.nf_numero || '—'} · {p.fornecedor_nome || p.nf_emitente_nome || '—'}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {p.descricao_item || '—'}
                                </div>
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  Status: {p.status} · Pag: {p.status_pagamento || '—'}
                                  {p.nf_data_emissao ? ` · Emissão: ${p.nf_data_emissao}` : ''}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold whitespace-nowrap">{fmt(pv(p))}</div>
                                {p.nota_fiscal_url && (
                                  <a
                                    href={p.nota_fiscal_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                                  >
                                    Ver NF <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de Ação Flutuante */}
      {selecionados.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t shadow-lg">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex flex-col sm:flex-row items-center gap-3">
            <div className="text-sm font-medium">{selecionados.size} selecionado(s)</div>
            <div className="flex-1 w-full sm:max-w-md">
              <Select value={destinoId} onValueChange={setDestinoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Mover para rubrica..." />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {(data?.rubricas || [])
                    .slice()
                    .sort((a, b) =>
                      String(a.rubrica || a.nome || '').localeCompare(String(b.rubrica || b.nome || ''))
                    )
                    .map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.rubrica || r.nome || '—'} {r.centro_custo ? `· ${r.centro_custo}` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={moverSelecionados} disabled={movendo || !destinoId} className="gap-2 w-full sm:w-auto">
              {movendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
              Mover
            </Button>
            <Button variant="ghost" onClick={() => setSelecionados(new Set())} disabled={movendo}>
              Limpar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, icon, tone }) {
  const tones = {
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    accent: 'border-primary/30 bg-primary/5 text-primary',
    info: 'border-slate-200 bg-slate-50 text-slate-900',
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone] || tones.info}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}