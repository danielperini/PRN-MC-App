/**
 * PainelAuditoriaRelatorio
 * Exibido após a etapa 'auditoria_factual' no GeracaoCompletaDialog.
 * Seções: ✅ Fatos Confirmados, ⚠️ Pendências, 🔴 Divergências, 📋 Fontes
 */
import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, FileText, ChevronDown, ChevronUp, Shield, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function SectionToggle({ icon: Icon, title, count, colorClass, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-xl border ${colorClass} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/70 hover:bg-white/90 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-semibold">{title}</span>
          {count != null && (
            <span className="text-xs bg-white border rounded-full px-2 py-0.5 font-medium">{count}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4 pt-2 space-y-2">{children}</div>}
    </div>
  );
}

function ConfidenceBadge({ score }) {
  if (score === undefined || score === null) return null;
  const color = score >= 90 ? 'bg-green-100 text-green-700 border-green-200'
    : score >= 70 ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
    : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] border rounded-full px-1.5 py-0.5 font-medium ${color}`}>
      <Shield className="w-2.5 h-2.5" />
      {score}%
    </span>
  );
}

export default function PainelAuditoriaRelatorio({ auditoria, cronograma = [], onMarcarTodasRevisadas, exportarBloqueado }) {
  const [divergenciasRevisadas, setDivergenciasRevisadas] = useState({});

  if (!auditoria) return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 text-center">
      Aguardando dados de auditoria...
    </div>
  );

  const {
    fatos_confirmados = [],
    pendencias = [],
    divergencias = [],
    fontes_utilizadas = [],
    score_qualidade = 0,
  } = auditoria;

  const divergenciasCriticasAbertas = divergencias.filter(d => d.critica && !d.revisada && !divergenciasRevisadas[d.tipo + d.descricao]);
  const podeExportar = divergenciasCriticasAbertas.length === 0;

  function marcarDivergenciaRevisada(key) {
    setDivergenciasRevisadas(s => ({ ...s, [key]: true }));
  }

  function marcarTodas() {
    const novas = {};
    for (const d of divergencias) {
      novas[d.tipo + d.descricao] = true;
    }
    setDivergenciasRevisadas(novas);
    onMarcarTodasRevisadas?.();
  }

  const scoreColor = score_qualidade >= 80 ? 'text-green-700' : score_qualidade >= 50 ? 'text-yellow-700' : 'text-red-700';
  const scoreBg = score_qualidade >= 80 ? 'bg-green-50 border-green-200' : score_qualidade >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';

  return (
    <div className="space-y-3">
      {/* Header de qualidade */}
      <div className={`rounded-xl border p-4 ${scoreBg}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Painel de Auditoria Documental</p>
            <p className="text-xs text-slate-500 mt-0.5">Revise os itens antes de liberar a exportação para PDF/DOCX</p>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${scoreColor}`}>{score_qualidade}%</p>
            <p className="text-xs text-slate-500">score de qualidade</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-[11px] bg-white border border-green-200 text-green-700 px-2 py-0.5 rounded-full font-medium">{fatos_confirmados.length} fatos confirmados</span>
          <span className="text-[11px] bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-medium">{pendencias.length} pendências</span>
          <span className={`text-[11px] bg-white border rounded-full px-2 py-0.5 font-medium ${divergencias.length > 0 ? 'border-red-200 text-red-700' : 'border-green-200 text-green-700'}`}>{divergencias.length} divergências</span>
        </div>
      </div>

      {/* Bloqueio de exportação */}
      {!podeExportar && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">Exportação bloqueada</p>
            <p className="text-xs text-red-700 mt-0.5">{divergenciasCriticasAbertas.length} divergência(s) crítica(s) não revisada(s). Revise ou aceite os itens abaixo para liberar.</p>
          </div>
          <Button size="sm" onClick={marcarTodas} className="text-xs bg-red-600 hover:bg-red-700 text-white flex-shrink-0">
            <RefreshCw className="w-3 h-3 mr-1" />
            Aceitar todas
          </Button>
        </div>
      )}
      {podeExportar && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <p className="text-sm font-medium text-green-800">Sem divergências críticas em aberto. Exportação liberada.</p>
        </div>
      )}

      {/* ✅ Fatos Confirmados */}
      <SectionToggle icon={CheckCircle2} title="Fatos Confirmados" count={fatos_confirmados.length} colorClass="border-green-200" defaultOpen={false}>
        {fatos_confirmados.length === 0 && <p className="text-xs text-slate-400">Nenhum fato confirmado registrado.</p>}
        {fatos_confirmados.map((f, i) => (
          <div key={i} className="flex items-start gap-2 py-1.5 border-b border-green-100 last:border-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-700">{f.afirmacao}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-slate-400">Fonte: {f.fonte}</span>
                <ConfidenceBadge score={f.confidence} />
                <span className="text-[10px] text-slate-400">Nível {f.nivel}</span>
              </div>
            </div>
          </div>
        ))}
      </SectionToggle>

      {/* ⚠️ Pendências */}
      <SectionToggle icon={AlertTriangle} title="Pendências" count={pendencias.length} colorClass="border-amber-200" defaultOpen={pendencias.length > 0}>
        {pendencias.length === 0 && <p className="text-xs text-slate-400">Nenhuma pendência identificada.</p>}
        {pendencias.map((p, i) => (
          <div key={i} className="flex items-start gap-2 py-1.5 border-b border-amber-100 last:border-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 flex-1">{p.descricao}</p>
            {p.resolvida && <Badge className="text-[9px] bg-green-100 text-green-700 border-green-200 flex-shrink-0">Resolvida</Badge>}
          </div>
        ))}
      </SectionToggle>

      {/* 🔴 Divergências */}
      <SectionToggle icon={AlertCircle} title="Divergências" count={divergencias.length} colorClass="border-red-200" defaultOpen={divergencias.length > 0}>
        {divergencias.length === 0 && <p className="text-xs text-slate-400">Nenhuma divergência detectada. ✅</p>}
        {divergencias.map((d, i) => {
          const key = d.tipo + d.descricao;
          const revisada = d.revisada || divergenciasRevisadas[key];
          return (
            <div key={i} className={`py-2 border-b border-red-100 last:border-0 ${revisada ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${d.critica ? 'text-red-600' : 'text-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{d.tipo}</span>
                    {d.critica && !revisada && <Badge className="text-[9px] bg-red-100 text-red-700 border-red-200">Crítica</Badge>}
                    {revisada && <Badge className="text-[9px] bg-green-100 text-green-700 border-green-200">Revisada ✓</Badge>}
                    {d.score != null && d.score < 70 && <ConfidenceBadge score={d.score} />}
                  </div>
                  <p className="text-xs text-slate-700 mt-1">{d.descricao}</p>
                </div>
                {!revisada && (
                  <button
                    onClick={() => marcarDivergenciaRevisada(key)}
                    className="text-[10px] text-slate-500 hover:text-green-700 border border-slate-200 hover:border-green-300 px-2 py-0.5 rounded-full flex-shrink-0 transition-colors"
                  >
                    Aceitar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </SectionToggle>

      {/* Metas com score de confiança */}
      {cronograma.length > 0 && (
        <SectionToggle icon={Shield} title="Confiança por Meta" count={cronograma.length} colorClass="border-indigo-200" defaultOpen={false}>
          <div className="space-y-1.5">
            {cronograma.map((m, i) => {
              const score = m.meta_confidence ?? 100;
              return (
                <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-indigo-50 last:border-0">
                  <p className="text-xs text-slate-700 flex-1 truncate">{m.meta_nome}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ConfidenceBadge score={score} />
                    <span className={`text-[10px] font-medium ${m.status_meta === 'Realizada Integralmente' ? 'text-green-600' : m.status_meta === 'Realizada Parcialmente' ? 'text-amber-600' : 'text-red-600'}`}>
                      {m.percentual_execucao || 0}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionToggle>
      )}

      {/* 📋 Fontes */}
      <SectionToggle icon={FileText} title="Fontes Utilizadas" count={fontes_utilizadas.length} colorClass="border-slate-200" defaultOpen={false}>
        <div className="space-y-1.5">
          {fontes_utilizadas.map((f, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
              <div>
                <span className="text-xs font-medium text-slate-700">{f.entidade}</span>
                <p className="text-[10px] text-slate-400">{f.descricao}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className="text-xs font-bold text-slate-600">{f.quantidade}</span>
                <p className="text-[10px] text-slate-400">{f.periodo}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionToggle>
    </div>
  );
}