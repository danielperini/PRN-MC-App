import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { getRubricasOficiais3Aditivo, TOTAL_OFICIAL_3_ADITIVO } from '@/lib/rubricasOficiais3Aditivo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// ─── Constantes ───────────────────────────────────────────────────────────────
const TOTAL_ESPERADO = 1320000;

const RUBRICAS_SUSPEITAS = [
  { match: 'diárias de educador', valor: 5050, motivo: 'Não consta no documento oficial do 3º Aditivo' },
  { match: 'educador(a)', valor: 9000, motivo: 'Não consta no documento oficial do 3º Aditivo' },
  { match: 'infraestrutura mhab', valor: 4000, motivo: 'Não consta como item separado — suspeita de duplicidade com Infraestrutura MIS/MUMO/MHAB' },
  { match: 'consultoria de programação cultural', valor: 7500, motivo: 'Não consta no documento oficial — suspeita de duplicidade' },
  { match: 'ações educativas', valor: 9000, motivo: 'Rubrica genérica — suspeita de duplicidade com Ações Educativo-culturais' },
  { match: 'ações culturais', valor: 9000, motivo: 'Rubrica genérica — suspeita de duplicidade com Ações Educativo-culturais' },
];

const EXCESSOS_CONHECIDOS = [
  { rubrica: 'Apresentações', excesso: 7000, descricao: 'Apresentações – excesso R$ 7.000,00 sobre o previsto' },
  { rubrica: 'Consultorias', excesso: 3100, descricao: 'Consultorias – excesso R$ 3.100,00 sobre o previsto' },
  { match_rubrica: 'material', match_meta: 'despesas gerais', excesso: 2250, descricao: 'Material de escritório – excesso R$ 2.250,00 sobre o previsto' },
  { rubrica: 'Peça em destaque MHAB', excesso: 2.62, descricao: 'Peça em destaque MHAB – excesso R$ 2,62 sobre o previsto' },
];

// Mapeamento de vínculos de meta conforme documento oficial
const VINCULOS_META_OFICIAIS = [
  { match: 'coordenador de comunicação', meta_correta: '1 - Contratação da equipe principal, incluindo os coordenadores da Comissão de Programação' },
  { match: 'manutenção mis', meta_correta: '3 - Realizar manutenção de rotina em exposições' },
  { match: 'mostra baixa complexidade mis', meta_correta: '10 - 18 pequenas mostras de baixa ou média complexidade' },
  { match: 'mostra média complexidade mhab', meta_correta: '10 - 18 pequenas mostras de baixa ou média complexidade' },
  { match: 'diárias mis', meta_correta: '16 - 101 Diárias' },
  { match: 'diárias mumo', meta_correta: '16 - 101 Diárias' },
  { match: 'diárias mhab', meta_correta: '16 - 101 Diárias' },
  { match: 'pesquisa e texto mhab', meta_correta: '17 - Publicações' },
  { match: 'ações educativo-culturais mis', meta_correta: '20 - Realizar 30 (trinta) ações educativas e ou culturais' },
  { match: 'ações educativo-culturais mumo', meta_correta: '20 - Realizar 30 (trinta) ações educativas e ou culturais' },
  { match: 'ações educativo-culturais mhab', meta_correta: '20 - Realizar 30 (trinta) ações educativas e ou culturais' },
  { match: 'transporte', meta_correta: '23 - Despesas Gerais' },
  { match: 'material escritório', meta_correta: '23 - Despesas Gerais' },
  { match: 'assessoria jurídica', meta_correta: '23 - Despesas Gerais' },
  { match: 'energia elétrica', meta_correta: '23 - Despesas Gerais' },
  { match: 'contador', meta_correta: '23 - Despesas Gerais' },
];

const CLASSIFICACOES_EXTRA = ['4º ADITIVO', 'LEGADO/ANTERIOR', 'DESDOBRAMENTO INTERNO', 'PENDENTE DE REVISÃO'];

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function normalizeStr(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function matchesSuspeita(rubrica, sus) {
  const nome = normalizeStr(rubrica.rubrica || rubrica.nome || rubrica.item_rubrica || '');
  return nome.includes(normalizeStr(sus.match));
}

export default function AuditoriaNormalizacao3Aditivo() {
  const [rubricas, setRubricas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aplicando, setAplicando] = useState(false);
  const [log, setLog] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [activeTab, setActiveTab] = useState('resumo');

  const oficiais = getRubricasOficiais3Aditivo();
  const nomesOficiais = new Set(oficiais.map(r => normalizeStr(r.rubrica)));

  const addLog = useCallback((msg, tipo = 'info') => {
    setLog(prev => [...prev, { msg, tipo, ts: new Date().toLocaleTimeString('pt-BR') }]);
  }, []);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      try {
        const [rubs, comps] = await Promise.all([
          base44.entities.Rubrica.filter({ origem_recurso: '3º ADITIVO' }),
          base44.entities.PurchaseRequest.filter({ status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] } }, '-created_date', 500),
        ]);
        setRubricas(rubs || []);
        setCompras(comps || []);
      } catch (e) {
        addLog('Erro ao carregar dados: ' + e.message, 'erro');
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  // ─── Análise ──────────────────────────────────────────────────────────────
  const rubricasOficiais3A = rubricas.filter(r => r.origem_recurso === '3º ADITIVO');
  const totalPrevisto = rubricasOficiais3A.reduce((acc, r) => acc + (r.valor_rubrica || r.valor_total || 0), 0);
  const totalRealizado = rubricasOficiais3A.reduce((acc, r) => acc + (r.valor_utilizado || 0), 0);
  const saldo = totalPrevisto - totalRealizado;

  // Rubricas suspeitas (não estão no doc oficial)
  const rubricasSuspeitas = rubricas.filter(r => {
    const nome = normalizeStr(r.rubrica || r.nome || r.item_rubrica || '');
    const eOficial = nomesOficiais.has(nome);
    return !eOficial && r.origem_recurso === '3º ADITIVO';
  });

  // Rubricas com excesso (realizado > previsto)
  const rubricasComExcesso = rubricasOficiais3A.filter(r => {
    const previsto = r.valor_rubrica || r.valor_total || 0;
    const realizado = r.valor_utilizado || 0;
    return realizado > previsto && previsto > 0;
  });

  // Divergências de meta
  const divergenciasMeta = rubricas.filter(r => {
    const nomeNorm = normalizeStr(r.rubrica || r.nome || '');
    for (const vinculo of VINCULOS_META_OFICIAIS) {
      if (nomeNorm.includes(normalizeStr(vinculo.match))) {
        const metaAtual = normalizeStr(r.meta || r.grupo || '');
        const metaCorreta = normalizeStr(vinculo.meta_correta);
        return !metaAtual.includes(metaCorreta.slice(0, 20));
      }
    }
    return false;
  });

  // ─── Ações ────────────────────────────────────────────────────────────────
  async function marcarSuspeitasERemover() {
    setAplicando(true);
    const logEntradas = [];
    let count = 0;

    for (const r of rubricasSuspeitas) {
      try {
        await base44.entities.Rubrica.update(r.id, {
          duplicidade_status: 'suspeita',
          incluir_no_somatorio: false,
          observacao_uso: `[AUDITORIA 3º ADT] Não consta no documento oficial. Marcada como suspeita em ${new Date().toLocaleDateString('pt-BR')}`,
        });
        logEntradas.push({ msg: `Marcada como suspeita: ${r.rubrica || r.nome} (${fmtBRL(r.valor_rubrica)})`, tipo: 'aviso' });
        count++;
      } catch (e) {
        logEntradas.push({ msg: `Erro ao marcar ${r.rubrica}: ${e.message}`, tipo: 'erro' });
      }
    }

    setLog(prev => [...prev, ...logEntradas.map(e => ({ ...e, ts: new Date().toLocaleTimeString('pt-BR') }))]);
    addLog(`${count} rubricas marcadas como suspeitas e removidas do somatório.`, 'sucesso');
    setAplicando(false);
  }

  async function corrigirVinculosMeta() {
    setAplicando(true);
    let count = 0;

    for (const r of rubricas) {
      const nomeNorm = normalizeStr(r.rubrica || r.nome || '');
      for (const vinculo of VINCULOS_META_OFICIAIS) {
        if (nomeNorm.includes(normalizeStr(vinculo.match))) {
          const metaAtual = normalizeStr(r.meta || r.grupo || '');
          const metaCorreta = normalizeStr(vinculo.meta_correta);
          if (!metaAtual.includes(metaCorreta.slice(0, 20))) {
            try {
              await base44.entities.Rubrica.update(r.id, { meta: vinculo.meta_correta, grupo: vinculo.meta_correta.replace(/^\d+\s*-\s*/, '') });
              addLog(`Meta corrigida: "${r.rubrica}" → ${vinculo.meta_correta}`, 'sucesso');
              count++;
            } catch (e) {
              addLog(`Erro ao corrigir meta de ${r.rubrica}: ${e.message}`, 'erro');
            }
          }
          break;
        }
      }
    }
    addLog(`${count} vínculos de meta corrigidos.`, 'sucesso');
    setAplicando(false);
  }

  async function reclassificarExtras() {
    setAplicando(true);
    let count = 0;

    // Rubricas que não têm origem_recurso = '3º ADITIVO' mas têm nomes que sugerem ser extra
    const extras = rubricas.filter(r => r.origem_recurso && r.origem_recurso !== '3º ADITIVO' && !r.origem_recurso);
    for (const r of extras) {
      try {
        await base44.entities.Rubrica.update(r.id, { origem_recurso: 'PENDENTE DE REVISÃO' });
        addLog(`Reclassificada: "${r.rubrica}" → PENDENTE DE REVISÃO`, 'info');
        count++;
      } catch (e) {
        addLog(`Erro ao reclassificar ${r.rubrica}: ${e.message}`, 'erro');
      }
    }
    addLog(`${count} rubricas reclassificadas.`, 'sucesso');
    setAplicando(false);
  }

  async function gerarRelatorioFinal() {
    setAplicando(true);
    addLog('Calculando totais finais...', 'info');

    const rubs3A = rubricas.filter(r => r.origem_recurso === '3º ADITIVO' && r.incluir_no_somatorio !== false);
    const previsto = rubs3A.reduce((acc, r) => acc + (r.valor_rubrica || r.valor_total || 0), 0);
    const realizado = rubs3A.reduce((acc, r) => acc + (r.valor_utilizado || 0), 0);
    const saldoFinal = previsto - realizado;
    const divergencias = [];

    if (Math.round(previsto) !== TOTAL_ESPERADO) {
      divergencias.push(`Total previsto ${fmtBRL(previsto)} ≠ esperado ${fmtBRL(TOTAL_ESPERADO)}`);
    }

    rubricasComExcesso.forEach(r => {
      const excesso = (r.valor_utilizado || 0) - (r.valor_rubrica || 0);
      const nfsVinculadas = compras.filter(c => c.rubrica_id === r.id);
      divergencias.push(`EXCESSO: ${r.rubrica} — ${fmtBRL(excesso)} acima do previsto — ${nfsVinculadas.length} NF(s) vinculada(s)`);
    });

    setResultado({ previsto, realizado, saldo: saldoFinal, divergencias, totalRubricas: rubs3A.length, totalSuspeitas: rubricasSuspeitas.length });
    addLog('Relatório final gerado.', 'sucesso');
    setAplicando(false);
  }

  // ─── Busca compras vinculadas a uma rubrica ───────────────────────────────
  function comprasDeRubrica(rubricaId) {
    return compras.filter(c => c.rubrica_id === rubricaId);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-slate-500">
        <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mr-3" />
        Carregando rubricas e compras...
      </div>
    );
  }

  const tabs = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'suspeitas', label: `Suspeitas (${rubricasSuspeitas.length})` },
    { id: 'excessos', label: `Excessos (${rubricasComExcesso.length})` },
    { id: 'metas', label: `Divergências de Meta (${divergenciasMeta.length})` },
    { id: 'log', label: `Log (${log.length})` },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-slate-900 text-white rounded-xl p-5">
        <h2 className="text-lg font-bold">🔍 Auditoria — Normalização de Rubricas do 3º Aditivo</h2>
        <p className="text-slate-300 text-sm mt-1">Total oficial esperado: <strong className="text-green-400">{fmtBRL(TOTAL_ESPERADO)}</strong></p>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-400">Total previsto (3º Adt)</div>
            <div className={`text-lg font-bold ${Math.round(totalPrevisto) === TOTAL_ESPERADO ? 'text-green-400' : 'text-red-400'}`}>{fmtBRL(totalPrevisto)}</div>
            {Math.round(totalPrevisto) !== TOTAL_ESPERADO && <div className="text-xs text-red-400">Divergência: {fmtBRL(Math.abs(totalPrevisto - TOTAL_ESPERADO))}</div>}
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-400">Total realizado</div>
            <div className="text-lg font-bold text-blue-400">{fmtBRL(totalRealizado)}</div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <div className="text-xs text-slate-400">Saldo disponível</div>
            <div className={`text-lg font-bold ${saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmtBRL(saldo)}</div>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === t.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ABA RESUMO ── */}
      {activeTab === 'resumo' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-slate-500">Rubricas (3º Adt)</div>
                <div className="text-2xl font-bold">{rubricasOficiais3A.length}</div>
                <div className="text-xs text-slate-400">Esperado: {oficiais.length} oficiais</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-slate-500">Suspeitas / fora do doc</div>
                <div className="text-2xl font-bold text-amber-600">{rubricasSuspeitas.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-slate-500">Com excesso</div>
                <div className="text-2xl font-bold text-red-600">{rubricasComExcesso.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-slate-500">Div. de meta</div>
                <div className="text-2xl font-bold text-blue-600">{divergenciasMeta.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Ações */}
          <Card>
            <CardHeader><h3 className="font-semibold text-slate-700">Ações de Normalização</h3></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <Button onClick={marcarSuspeitasERemover} disabled={aplicando || rubricasSuspeitas.length === 0}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-sm">
                  ⚠️ Marcar {rubricasSuspeitas.length} rubricas suspeitas e remover do somatório
                </Button>
                <Button onClick={corrigirVinculosMeta} disabled={aplicando || divergenciasMeta.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm">
                  🔗 Corrigir {divergenciasMeta.length} vínculos de meta
                </Button>
                <Button onClick={reclassificarExtras} disabled={aplicando}
                  variant="outline" className="text-sm">
                  📂 Reclassificar rubricas sem origem definida
                </Button>
                <Button onClick={gerarRelatorioFinal} disabled={aplicando}
                  className="bg-green-700 hover:bg-green-800 text-white text-sm">
                  📊 Gerar relatório final com totais e divergências
                </Button>
              </div>
              {aplicando && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                  Processando...
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resultado final */}
          {resultado && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader><h3 className="font-semibold text-green-800">✅ Resultado da Auditoria</h3></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><span className="text-slate-500">Rubricas no somatório:</span><div className="font-bold">{resultado.totalRubricas}</div></div>
                  <div><span className="text-slate-500">Rubricas suspeitas excluídas:</span><div className="font-bold text-amber-700">{resultado.totalSuspeitas}</div></div>
                  <div><span className="text-slate-500">Total previsto:</span><div className={`font-bold ${Math.round(resultado.previsto) === TOTAL_ESPERADO ? 'text-green-700' : 'text-red-700'}`}>{fmtBRL(resultado.previsto)}</div></div>
                  <div><span className="text-slate-500">Total realizado:</span><div className="font-bold text-blue-700">{fmtBRL(resultado.realizado)}</div></div>
                </div>
                <div><span className="text-slate-500">Saldo:</span><span className={`ml-2 font-bold ${resultado.saldo >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtBRL(resultado.saldo)}</span></div>
                {resultado.divergencias.length > 0 && (
                  <div className="mt-3">
                    <div className="font-semibold text-red-700 mb-1">Divergências ({resultado.divergencias.length}):</div>
                    {resultado.divergencias.map((d, i) => <div key={i} className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-2 py-1 mb-1">{d}</div>)}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── ABA SUSPEITAS ── */}
      {activeTab === 'suspeitas' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Rubricas marcadas como <strong>3º ADITIVO</strong> mas que não constam no documento oficial. Devem ser excluídas do somatório ou reclassificadas.</p>
          {rubricasSuspeitas.length === 0 ? (
            <div className="text-center p-8 text-slate-400">Nenhuma rubrica suspeita encontrada.</div>
          ) : rubricasSuspeitas.map(r => {
            const comprasVinculadas = comprasDeRubrica(r.id);
            const sus = RUBRICAS_SUSPEITAS.find(s => matchesSuspeita(r, s));
            return (
              <Card key={r.id} className="border-amber-200">
                <CardContent className="pt-3 pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800">{r.rubrica || r.nome}</div>
                      <div className="text-xs text-slate-500">{r.meta || r.grupo || '—'} • {r.natureza_despesa || '—'}</div>
                      {sus && <div className="text-xs text-amber-700 mt-1">⚠️ {sus.motivo}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-amber-700">{fmtBRL(r.valor_rubrica || r.valor_total || 0)}</div>
                      <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">{r.duplicidade_status === 'suspeita' ? '✓ Já marcada' : 'Pendente'}</Badge>
                    </div>
                  </div>
                  {comprasVinculadas.length > 0 && (
                    <div className="mt-2 text-xs text-slate-600 border-t pt-2">
                      <strong>{comprasVinculadas.length} compra(s) vinculada(s):</strong> {comprasVinculadas.slice(0, 3).map(c => `${c.descricao_item || ''} (${fmtBRL(c.valor_pago || c.valor_aprovado_admin || c.valor_solicitado)})`).join(' • ')}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── ABA EXCESSOS ── */}
      {activeTab === 'excessos' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Rubricas onde o realizado excede o previsto. <strong>Não alterar automaticamente sem evidência.</strong></p>
          {rubricasComExcesso.length === 0 ? (
            <div className="text-center p-8 text-slate-400">Nenhum excesso detectado.</div>
          ) : rubricasComExcesso.map(r => {
            const previsto = r.valor_rubrica || r.valor_total || 0;
            const realizado = r.valor_utilizado || 0;
            const excesso = realizado - previsto;
            const comprasVinculadas = comprasDeRubrica(r.id);
            const possivelDuplacaoVinculo = comprasVinculadas.filter(c => {
              const outros = compras.filter(x => x.id !== c.id && x.nf_numero === c.nf_numero && c.nf_numero);
              return outros.length > 0;
            });

            return (
              <Card key={r.id} className="border-red-200">
                <CardContent className="pt-3 pb-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800">{r.rubrica || r.nome}</div>
                      <div className="text-xs text-slate-500">{r.meta || r.grupo}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">Previsto: {fmtBRL(previsto)}</div>
                      <div className="text-xs text-slate-500">Realizado: {fmtBRL(realizado)}</div>
                      <div className="font-bold text-red-700">Excesso: {fmtBRL(excesso)}</div>
                    </div>
                  </div>
                  {comprasVinculadas.length > 0 && (
                    <div className="text-xs border-t pt-2 space-y-1">
                      <div className="font-semibold text-slate-600">{comprasVinculadas.length} NF(s) / compra(s) vinculada(s):</div>
                      {comprasVinculadas.slice(0, 5).map(c => (
                        <div key={c.id} className="flex justify-between bg-slate-50 rounded px-2 py-1">
                          <span>{c.nf_numero ? `NF ${c.nf_numero}` : c.descricao_item?.slice(0, 40)}</span>
                          <span className="font-medium">{fmtBRL(c.valor_pago || c.valor_aprovado_admin || c.valor_solicitado)}</span>
                          {c.comprovante_url && <a href={c.comprovante_url} target="_blank" rel="noreferrer" className="text-blue-600 ml-2">Comprovante</a>}
                        </div>
                      ))}
                      {possivelDuplacaoVinculo.length > 0 && (
                        <div className="text-red-600 bg-red-50 rounded px-2 py-1 font-medium">
                          ⚠️ {possivelDuplacaoVinculo.length} NF(s) com possível dupla vinculação (mesmo número em outra rubrica)
                        </div>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                    🔒 Realizado NÃO será alterado automaticamente. Verificar evidências antes de qualquer ajuste.
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── ABA DIVERGÊNCIAS DE META ── */}
      {activeTab === 'metas' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">Rubricas com vínculo de meta diferente do documento oficial.</p>
          {divergenciasMeta.length === 0 ? (
            <div className="text-center p-8 text-slate-400">Nenhuma divergência de meta encontrada.</div>
          ) : divergenciasMeta.map(r => {
            const nomeNorm = normalizeStr(r.rubrica || r.nome || '');
            const vinculo = VINCULOS_META_OFICIAIS.find(v => nomeNorm.includes(normalizeStr(v.match)));
            return (
              <Card key={r.id} className="border-blue-200">
                <CardContent className="pt-3 pb-3">
                  <div className="font-semibold text-slate-800">{r.rubrica || r.nome}</div>
                  <div className="text-xs text-red-600 mt-1">Meta atual: {r.meta || r.grupo || '(não definida)'}</div>
                  {vinculo && <div className="text-xs text-green-700 mt-1">Meta correta: {vinculo.meta_correta}</div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── ABA LOG ── */}
      {activeTab === 'log' && (
        <div className="bg-slate-900 rounded-xl p-4 text-xs font-mono max-h-96 overflow-y-auto space-y-1">
          {log.length === 0 ? (
            <div className="text-slate-500">Nenhuma ação executada ainda.</div>
          ) : log.map((l, i) => (
            <div key={i} className={`${l.tipo === 'erro' ? 'text-red-400' : l.tipo === 'aviso' ? 'text-amber-400' : l.tipo === 'sucesso' ? 'text-green-400' : 'text-slate-300'}`}>
              <span className="text-slate-500">[{l.ts}]</span> {l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}