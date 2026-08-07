import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  AlertCircle,
  FileWarning,
  HelpCircle,
  X,
  CheckCheck,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const fmtBRL = (v) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(Number(v || 0));

function SeveridadeBadge({ severidade, tipo }) {
  const map = {
    alta: 'bg-red-100 text-red-700 border-red-200',
    media: 'bg-amber-100 text-amber-700 border-amber-200',
    baixa: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  const label =
    tipo === 'duplicata' ? 'Duplicata' : tipo === 'campo_vazio' ? 'Campo vazio' : 'Inconsistência';
  const cls = map[tipo === 'duplicata' ? 'alta' : severidade] || map.baixa;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function ItemAchado({ achado, selecionado, onToggle, expanded, onToggleExpand }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-start gap-3 p-3">
        <input
          type="checkbox"
          checked={selecionado}
          onChange={onToggle}
          className="mt-1 h-4 w-4 cursor-pointer accent-black"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeveridadeBadge severidade={achado.severidade} tipo={achado.tipo === 'duplicata' ? 'duplicata' : achado.tipo} />
            <span className="truncate text-sm font-medium text-gray-900">
              {achado.fornecedor_nome || '—'}
            </span>
            {achado.nf_numero && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                NF {achado.nf_numero}
              </span>
            )}
            <span className="text-xs font-semibold text-gray-700">{fmtBRL(achado.valor)}</span>
          </div>
          {achado.descricao_item && (
            <p className="mt-1 truncate text-xs text-gray-500">{achado.descricao_item}</p>
          )}
          <p className="mt-1 text-xs text-gray-600">
            <span className="font-medium">Campo:</span> <code className="rounded bg-gray-100 px-1 text-gray-700">{achado.campo}</code>
            {achado.valor_sugerido && achado.tipo !== 'duplicata' && (
              <>
                {' '}→ <span className="text-gray-700">sugestão: <strong className="text-gray-900">{achado.valor_sugerido}</strong></span>
              </>
            )}
          </p>
        </div>
        <button
          onClick={onToggleExpand}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          title={expanded ? 'Recolher' : 'Expandir'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-700">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Valor atual</p>
              <p className="mt-0.5 break-words">{achado.valor_atual || '(vazio)'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Sugestão</p>
              <p className="mt-0.5 break-words font-medium text-gray-900">
                {achado.valor_sugerido || achado.tipo === 'duplicata' ? String(achado.valor_sugerido) : '—'}
              </p>
            </div>
          </div>
          {achado.justificativa && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">Justificativa</p>
              <p className="mt-0.5 leading-relaxed">{achado.justificativa}</p>
            </div>
          )}
          {achado.tipo === 'duplicata' && achado.campos_extras && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
              <p className="text-[10px] font-medium text-amber-700">Alterações adicionais sugeridas:</p>
              <ul className="mt-1 space-y-0.5">
                {Object.entries(achado.campos_extras).map(([k, v]) => (
                  <li key={k} className="text-[11px] text-amber-800">
                    <code>{k}</code>: {v.atual || '(vazio)'} → <strong>{String(v.sugerido)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SecaoColapsavel({ titulo, icone: Icon, cor, items, selecionados, onToggleItem, expandidos, onToggleExpand, onToggleTodos }) {
  const [aberto, setAberto] = useState(true);
  const todosSelecionados = items.length > 0 && items.every((it) => selecionados.has(it.id));
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {aberto ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${cor}`}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="font-semibold text-gray-900">{titulo}</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {items.length}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleTodos(); }}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            todosSelecionados
              ? 'border-black bg-black text-white'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
        </button>
      </button>
      {aberto && (
        <div className="space-y-2 border-t border-gray-100 p-3">
          {items.map((it) => (
            <ItemAchado
              key={`${it.tipo}-${it.id}-${it.campo}`}
              achado={it}
              selecionado={selecionados.has(`${it.id}|${it.campo}`)}
              onToggle={() => onToggleItem(it)}
              expanded={expandidos.has(`${it.id}|${it.campo}`)}
              onToggleExpand={() => onToggleExpand(it)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PainelAuditoriaIASolicitacoes({ purchases, rubricas, onDone }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [selecionados, setSelecionados] = useState(new Set());
  const [expandidos, setExpandidos] = useState(new Set());

  const totalPurchases = purchases?.length || 0;

  const key = (it) => `${it.id}|${it.campo}`;

  function toggleItem(it) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      const k = key(it);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleExpand(it) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      const k = key(it);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleTodosDaSecao(items) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      const todos = items.every((it) => next.has(key(it)));
      items.forEach((it) => {
        if (todos) next.delete(key(it));
        else next.add(key(it));
      });
      return next;
    });
  }

  async function executarAuditoria() {
    if (totalPurchases === 0) {
      toast.info('Nenhuma solicitação para auditar.');
      return;
    }
    setLoading(true);
    setResultado(null);
    setSelecionados(new Set());
    setExpandidos(new Set());
    setOpen(true);
    try {
      const res = await base44.functions.invoke('auditarSolicitacoesIA', {
        purchases,
        batch_limit: 50,
      });
      const data = res?.data || res || {};
      if (data?.success === false) throw new Error(data?.error || 'Falha na auditoria');
      setResultado({
        duplicatas: Array.isArray(data.duplicatas) ? data.duplicatas : [],
        camposIncompletos: Array.isArray(data.camposIncompletos) ? data.camposIncompletos : [],
        inconsistencias: Array.isArray(data.inconsistencias) ? data.inconsistencias : [],
        total_analisado: data.total_analisado || totalPurchases,
      });
      toast.success(
        `Auditoria concluída: ${(data.duplicatas || []).length} duplicatas, ${(data.camposIncompletos || []).length} campos incompletos, ${(data.inconsistencias || []).length} inconsistências.`
      );
    } catch (e) {
      console.error('Erro auditoria IA:', e);
      toast.error('Erro ao executar auditoria: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function aplicarSelecionados() {
    if (selecionados.size === 0) {
      toast.info('Selecione ao menos uma correção.');
      return;
    }
    setAplicando(true);
    let corrigidos = 0;
    let ignorados = 0;
    let duplicatasMarcadas = 0;
    const erros = [];

    // Montar mapa de achados para aplicar
    const todos = [
      ...(resultado?.duplicatas || []),
      ...(resultado?.camposIncompletos || []),
      ...(resultado?.inconsistencias || []),
    ];
    const mapa = new Map();
    todos.forEach((it) => mapa.set(key(it), it));

    const aAplicar = Array.from(selecionados).map((k) => mapa.get(k)).filter(Boolean);

    // Agrupar por id para updates do mesmo registro
    const updatesPorId = new Map();
    for (const it of aAplicar) {
      const id = it.id;
      if (!id) continue;
      if (!updatesPorId.has(id)) updatesPorId.set(id, {});
      const upd = updatesPorId.get(id);

      if (it.tipo === 'duplicata') {
        upd.duplicada_financeira = true;
        upd.incluir_no_somatorio = false;
        upd.duplicata_de = it.original_id || null;
        duplicatasMarcadas++;
      } else {
        const campo = it.campo;
        const sug = it.valor_sugerido;
        if (!campo || !sug) {
          ignorados++;
          continue;
        }
        // Validar tipos esperados
        if (campo === 'rubrica_id') upd.rubrica_id = sug;
        else if (campo === 'meta_id') upd.meta_id = sug;
        else if (campo === 'centro_custo') upd.centro_custo = sug;
        else if (campo === 'fornecedor_cnpj' || campo === 'nf_emitente_cpf_cnpj') upd[campo] = sug;
        else if (campo === 'valor_solicitado') upd[campo] = Number(sug) || 0;
        else upd[campo] = sug;
      }
    }

    for (const [id, payload] of updatesPorId.entries()) {
      if (Object.keys(payload).length === 0) {
        ignorados++;
        continue;
      }
      try {
        await base44.entities.PurchaseRequest.update(id, payload);
        corrigidos++;
      } catch (e) {
        console.warn('Erro ao atualizar', id, e);
        erros.push(id);
      }
    }

    setAplicando(false);
    const msgErros = erros.length ? `, ${erros.length} erro(s)` : '';
    toast.success(
      `${corrigidos} correções aplicadas, ${duplicatasMarcadas} duplicata(s) marcada(s), ${ignorados} ignorada(s)${msgErros}.`
    );
    setSelecionados(new Set());
    setOpen(false);
    setResultado(null);
    if (typeof onDone === 'function') {
      try { await onDone(); } catch {}
    }
  }

  const counts = useMemo(() => ({
    dup: resultado?.duplicatas?.length || 0,
    cam: resultado?.camposIncompletos?.length || 0,
    inc: resultado?.inconsistencias?.length || 0,
  }), [resultado]);

  const totalAchados = counts.dup + counts.cam + counts.inc;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-2 border-black text-black hover:bg-black hover:text-white"
        onClick={executarAuditoria}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? 'Auditando...' : '🔍 Auditoria IA'}
      </Button>

      <Dialog open={open} onOpenChange={(v) => {
        if (aplicando) return;
        setOpen(v);
        if (!v) { setResultado(null); setSelecionados(new Set()); }
      }}>
        <DialogContent className="max-w-4xl p-0 [&>button]:hidden">
          <DialogHeader className="border-b border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <DialogTitle className="text-base">Auditoria IA de Solicitações</DialogTitle>
                  <DialogDescription className="text-xs">
                    {resultado
                      ? `${totalAchados} achados em ${resultado.total_analisado} solicitações analisadas`
                      : 'Analisando duplicatas, campos incompletos e inconsistências...'}
                  </DialogDescription>
                </div>
              </div>
              <button
                onClick={() => { setOpen(false); setResultado(null); setSelecionados(new Set()); }}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                disabled={aplicando}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto p-4">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Loader2 className="h-8 w-8 animate-spin text-gray-700" />
                <p className="text-sm text-gray-500">Enviando {totalPurchases} solicitações para análise...</p>
              </div>
            )}
            {!loading && resultado && totalAchados === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <CheckCheck className="h-10 w-10 text-green-500" />
                <p className="text-sm font-medium text-gray-900">Nenhum problema encontrado!</p>
                <p className="text-xs text-gray-500">Todas as {resultado.total_analisado} solicitações passaram na auditoria.</p>
              </div>
            )}
            {!loading && resultado && totalAchados > 0 && (
              <div className="space-y-3">
                <SecaoColapsavel
                  titulo="Duplicatas Encontradas"
                  icone={Copy}
                  cor="bg-red-100 text-red-600"
                  items={resultado.duplicatas}
                  selecionados={selecionados}
                  onToggleItem={toggleItem}
                  expandidos={expandidos}
                  onToggleExpand={toggleExpand}
                  onToggleTodos={() => toggleTodosDaSecao(resultado.duplicatas)}
                />
                <SecaoColapsavel
                  titulo="Campos Incompletos"
                  icone={FileWarning}
                  cor="bg-amber-100 text-amber-600"
                  items={resultado.camposIncompletos}
                  selecionados={selecionados}
                  onToggleItem={toggleItem}
                  expandidos={expandidos}
                  onToggleExpand={toggleExpand}
                  onToggleTodos={() => toggleTodosDaSecao(resultado.camposIncompletos)}
                />
                <SecaoColapsavel
                  titulo="Inconsistências Semânticas"
                  icone={HelpCircle}
                  cor="bg-gray-100 text-gray-600"
                  items={resultado.inconsistencias}
                  selecionados={selecionados}
                  onToggleItem={toggleItem}
                  expandidos={expandidos}
                  onToggleExpand={toggleExpand}
                  onToggleTodos={() => toggleTodosDaSecao(resultado.inconsistencias)}
                />
              </div>
            )}
            {!loading && !resultado && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <AlertCircle className="h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">Falha ao carregar resultados.</p>
              </div>
            )}
          </div>

          {resultado && totalAchados > 0 && (
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-200 bg-white p-4">
              <p className="text-xs text-gray-600">
                <span className="font-semibold text-gray-900">{selecionados.size}</span> de {totalAchados} correções selecionadas
              </p>
              <Button
                onClick={aplicarSelecionados}
                disabled={aplicando || selecionados.size === 0}
                className="gap-2 bg-black text-white hover:bg-gray-800"
              >
                {aplicando && <Loader2 className="h-4 w-4 animate-spin" />}
                {aplicando
                  ? 'Aplicando...'
                  : `Aplicar ${selecionados.size} correção(ões) selecionada(s)`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}