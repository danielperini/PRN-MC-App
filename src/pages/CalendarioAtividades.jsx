import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Calendar, RefreshCw, Plus, ExternalLink } from 'lucide-react';

const MUSEUS = ['Todos', 'MHAB', 'MIS', 'MUMO', 'Externo', 'Atuação Geral', 'OUTRO'];

const MUSEU_COLORS = {
  MHAB: 'bg-purple-500',
  MIS: 'bg-cyan-500',
  MUMO: 'bg-pink-500',
  Externo: 'bg-gray-500',
  'Atuação Geral': 'bg-amber-500',
  OUTRO: 'bg-slate-500',
};

function parseDateToISO(dataStr) {
  if (!dataStr) return null;

  if (typeof dataStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dataStr)) {
    return dataStr.slice(0, 10);
  }

  const parts = String(dataStr).split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const parsed = new Date(dataStr);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function normalizeItems(items = []) {
  return items.map((i) => {
    const dataISO = parseDateToISO(i.data_inicio || i.data);

    return {
      id: i.id,
      nome: i.titulo || i.nome_acao || i.nome || '',
      data: i.data || dataISO || '',
      data_iso: dataISO,
      horario: i.horario || '',
      museu: i.museu || i.equipamento || 'Externo',
      sinopse: i.sinopse || i.descricao || '',
      vagas: i.vagas || '',
      inscricao: i.link_inscricao || i.inscricao || '',
      material_divulgacao: i.material_divulgacao || '',
      link_imagens: i.link_imagens || '',
      local: i.local || '',
      raw: i,
    };
  });
}

function buildAgendaFromItems(items = []) {
  const result = {};

  items.forEach((item) => {
    if (!item?.data_iso) return;

    const date = new Date(`${item.data_iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return;

    const mes = date.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });

    const museu = item.museu || 'Externo';

    if (!result[mes]) result[mes] = {};
    if (!result[mes][museu]) result[mes][museu] = [];

    result[mes][museu].push(item);
  });

  return result;
}

function CalendarioAtividadesInner() {
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncInfo, setSyncInfo] = useState(null);
  const [syncError, setSyncError] = useState(null);

  const { data: entityData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['agenda-programacao-entity'],
    queryFn: async () => {
      const entity = await base44.entities.Programacao.list('-data_inicio', 1000);
      return Array.isArray(entity) ? entity : [];
    },
  });

  const agenda = useMemo(() => {
    const normalized = normalizeItems(entityData || []);
    return buildAgendaFromItems(normalized);
  }, [entityData]);

  const meses = useMemo(() => {
    return Object.entries(agenda)
      .map(([mes, museus]) => {
        let total = 0;
        let firstDate = null;

        Object.values(museus).forEach((arr) => {
          total += arr.length;

          arr.forEach((item) => {
            if (item.data_iso) {
              if (!firstDate || item.data_iso < firstDate) {
                firstDate = item.data_iso;
              }
            }
          });
        });

        return { mes, museus, total, firstDate };
      })
      .sort((a, b) => (a.firstDate || '').localeCompare(b.firstDate || ''));
  }, [agenda]);

  const totalFiltrado = useMemo(() => {
    return meses.reduce((acc, { museus }) => {
      return (
        acc +
        Object.entries(museus)
          .filter(([m]) => filtroMuseu === 'Todos' || filtroMuseu === m)
          .reduce((sum, [, items]) => sum + items.length, 0)
      );
    }, 0);
  }, [meses, filtroMuseu]);

  const sincronizarAgora = async () => {
    setSyncLoading(true);
    setSyncError(null);
    setSyncInfo(null);

    try {
      const res = await base44.functions.invoke('syncProgramacao');
      const payload = res?.data || res || {};

      setSyncInfo(payload);

      if (payload?.ok === false) {
        setSyncError(payload?.error || 'Falha ao sincronizar programação.');
      }

      await refetch();
    } catch (e) {
      setSyncError(e?.message || 'Erro ao executar syncProgramacao.');
    } finally {
      setSyncLoading(false);
    }
  };

  const abrirNovo = () => {
    setForm({});
    setShowEditor(true);
  };

  const abrirEditar = (item) => {
    setForm(item.raw || item);
    setShowEditor(true);
  };

  const salvar = async () => {
    setSaving(true);

    try {
      const res = await base44.functions.invoke('updateProgramacaoMuseu', {
        data: form,
      });

      const payload = res?.data || res;

      if (payload?.locked) {
        alert('Este mês já está bloqueado para edição');
        return;
      }

      await refetch();
      setShowEditor(false);
    } catch {
      alert('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const debugSheets = syncInfo?.debug_sheets || [];
  const totalEventosSync = syncInfo?.total_eventos || 0;
  const totalProcessados = syncInfo?.total_processados || 0;
  const totalErros = syncInfo?.total_erros || 0;
  const entityCount = Array.isArray(entityData) ? entityData.length : 0;

  return (
    <div className="w-full py-6">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6" />
            <h1 className="text-3xl font-bold">Programação</h1>
          </div>

          <div className="flex gap-2 flex-wrap">
            {MUSEUS.map((m) => (
              <Button
                key={m}
                size="sm"
                variant={filtroMuseu === m ? 'default' : 'outline'}
                onClick={() => setFiltroMuseu(m)}
              >
                {m}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>

            <Button onClick={sincronizarAgora} disabled={syncLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${syncLoading ? 'animate-spin' : ''}`} />
              {syncLoading ? 'Sincronizando...' : 'Atualizar da planilha'}
            </Button>

            <Button onClick={abrirNovo}>
              <Plus className="w-4 h-4 mr-2" />
              Nova atividade
            </Button>

            <Badge>{totalFiltrado}</Badge>
          </div>
        </div>

        {(syncError || syncInfo) && (
          <div className="mb-6 border rounded-lg p-4 bg-slate-50 text-sm space-y-3">
            <div className="font-semibold">Diagnóstico da sincronização</div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="border rounded p-3 bg-white">
                <div className="text-xs text-gray-500">Eventos no sync</div>
                <div className="text-lg font-semibold">{totalEventosSync}</div>
              </div>

              <div className="border rounded p-3 bg-white">
                <div className="text-xs text-gray-500">Processados</div>
                <div className="text-lg font-semibold">{totalProcessados}</div>
              </div>

              <div className="border rounded p-3 bg-white">
                <div className="text-xs text-gray-500">Erros no sync</div>
                <div className="text-lg font-semibold">{totalErros}</div>
              </div>

              <div className="border rounded p-3 bg-white">
                <div className="text-xs text-gray-500">Registros em Programacao</div>
                <div className="text-lg font-semibold">{entityCount}</div>
              </div>
            </div>

            {syncError && (
              <div className="border rounded p-3 bg-red-50 text-red-700">
                <strong>Erro do syncProgramacao:</strong> {syncError}
              </div>
            )}

            {syncInfo?.stage_errors && (
              <pre className="border rounded p-3 bg-white overflow-auto text-xs whitespace-pre-wrap">
                {JSON.stringify(syncInfo.stage_errors, null, 2)}
              </pre>
            )}

            {debugSheets.length > 0 && (
              <div className="overflow-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-3">Aba</th>
                      <th className="py-2 pr-3">Header</th>
                      <th className="py-2 pr-3">Linha inicial</th>
                      <th className="py-2 pr-3">Linhas válidas</th>
                      <th className="py-2 pr-3">Eventos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debugSheets.map((sheet, idx) => (
                      <tr key={`${sheet.sheetName || 'sheet'}-${idx}`} className="border-b">
                        <td className="py-2 pr-3">{sheet.sheetName || '—'}</td>
                        <td className="py-2 pr-3">
                          {sheet.ignored ? 'ignorada' : sheet.headerDetected ? 'detectado' : 'fallback'}
                        </td>
                        <td className="py-2 pr-3">{sheet.dataStartIndex ?? '—'}</td>
                        <td className="py-2 pr-3">{sheet.rowsValidas ?? '—'}</td>
                        <td className="py-2 pr-3">{sheet.eventosExtraidos ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <div>Carregando...</div>
        ) : totalFiltrado === 0 ? (
          <div className="border p-6 text-gray-500">
            Nenhuma atividade encontrada.
          </div>
        ) : (
          <div className="space-y-10">
            {meses.map(({ mes, museus }) => {
              const gruposFiltrados = Object.entries(museus).filter(
                ([m]) => filtroMuseu === 'Todos' || filtroMuseu === m
              );

              if (gruposFiltrados.length === 0) return null;

              return (
                <div key={mes} className="space-y-6">
                  <h2 className="text-2xl font-semibold capitalize">{mes}</h2>

                  {gruposFiltrados.map(([museu, items]) => (
                    <div key={museu} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${MUSEU_COLORS[museu] || 'bg-gray-500'}`} />
                        <h3 className="text-lg font-semibold">{museu}</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {items.map((a, idx) => (
                          <div
                            key={a.id || idx}
                            className="border rounded-lg p-4 bg-white shadow-sm cursor-pointer"
                            onClick={() => abrirEditar(a)}
                          >
                            <div className="flex justify-between mb-2">
                              <div className="font-semibold">{a.nome}</div>
                              <div className={`w-2 h-2 rounded-full ${MUSEU_COLORS[a.museu] || 'bg-gray-500'}`} />
                            </div>

                            <div className="text-xs text-gray-500">
                              {a.data} {a.horario ? `· ${a.horario}` : ''}
                            </div>

                            {a.local && (
                              <div className="text-xs text-gray-500 mt-1">
                                {a.local}
                              </div>
                            )}

                            <div className="text-sm mt-3 text-gray-700">
                              {a.sinopse}
                            </div>

                            <div className="text-xs mt-3 space-y-1">
                              {a.vagas && <div>Vagas: {a.vagas}</div>}
                            </div>

                            <div className="flex gap-2 mt-3 flex-wrap">
                              {a.inscricao && (
                                <a
                                  href={a.inscricao}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button size="sm" variant="outline">
                                    Saiba mais <ExternalLink className="w-3 h-3 ml-1" />
                                  </Button>
                                </a>
                              )}

                              {a.material_divulgacao && (
                                <a
                                  href={a.material_divulgacao}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button size="sm" variant="secondary">
                                    Material divulgação
                                  </Button>
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar atividade</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              placeholder="Nome"
              value={form.nome || form.titulo || form.nome_acao || ''}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
            <Input
              placeholder="Data"
              value={form.data || form.data_inicio || ''}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />
            <Input
              placeholder="Museu"
              value={form.museu || form.equipamento || ''}
              onChange={(e) => setForm({ ...form, museu: e.target.value })}
            />
            <Input
              placeholder="Horário"
              value={form.horario || ''}
              onChange={(e) => setForm({ ...form, horario: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button onClick={salvar} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CalendarioAtividades() {
  return (
    <RequireAuth>
      <CalendarioAtividadesInner />
    </RequireAuth>
  );
}
