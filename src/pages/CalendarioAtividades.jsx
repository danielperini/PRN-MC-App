import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Calendar, RefreshCw, Plus } from 'lucide-react';

const MUSEUS = ['Todos', 'MHAB', 'MIS', 'MUMO', 'Externo'];

const MUSEU_COLORS = {
  MHAB: 'bg-purple-500',
  MIS: 'bg-cyan-500',
  MUMO: 'bg-pink-500',
  Externo: 'bg-gray-500',
};

function parseDateToISO(dataStr) {
  if (!dataStr) return null;

  const parts = dataStr.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

function normalizeFromEntity(items = []) {
  return items.map((i) => {
    const data_iso = parseDateToISO(i.data);

    return {
      nome: i.nome_acao || '',
      data: i.data || '',
      data_iso,
      horario: i.horario || '',
      museu: i.equipamento || 'Externo',
      sinopse: i.sinopse || '',
      vagas: i.vagas || '',
      inscricao: i.inscricao || '',
      link_imagens: i.link_imagens || '',
      raw: i,
    };
  });
}

function buildAgendaFromItems(items = []) {
  const result = {};

  items.forEach((item) => {
    if (!item?.data_iso) return;

    const date = new Date(item.data_iso);
    if (isNaN(date.getTime())) return;

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

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['agenda-programacao'],
    queryFn: async () => {
      const sync = await base44.functions.invoke('syncBaseConhecimento');

      // 🔥 fallback real na entity
      const entity = await base44.entities.Programacao.list({
        limit: 1000,
      });

      return {
        sync: sync?.data || {},
        entity: entity || [],
      };
    },
  });

  const agenda = useMemo(() => {
    const sync = data?.sync || {};

    // prioridade 1
    if (sync?.agenda) return sync.agenda;

    if (sync?.grouped_by_museum_and_month) {
      return sync.grouped_by_museum_and_month;
    }

    if (sync?.items) {
      return buildAgendaFromItems(sync.items);
    }

    // 🔥 fallback final (resolve seu problema)
    if (data?.entity?.length) {
      const normalized = normalizeFromEntity(data.entity);
      return buildAgendaFromItems(normalized);
    }

    return {};
  }, [data]);

  const meses = useMemo(() => {
    return Object.entries(agenda)
      .map(([mes, museus]) => {
        let total = 0;

        Object.values(museus).forEach((arr) => {
          total += arr.length;
        });

        return { mes, museus, total };
      })
      .sort((a, b) => a.mes.localeCompare(b.mes));
  }, [agenda]);

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

      if (res?.data?.locked) {
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
            <Button onClick={() => refetch()}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>

            <Button onClick={abrirNovo}>
              <Plus className="w-4 h-4 mr-2" />
              Nova atividade
            </Button>

            <Badge>
              {meses.reduce((acc, m) => acc + m.total, 0)}
            </Badge>
          </div>
        </div>

        {isLoading ? (
          <div>Carregando...</div>
        ) : meses.length === 0 ? (
          <div className="border p-6 text-gray-500">
            Nenhuma atividade encontrada.
          </div>
        ) : (
          <div className="space-y-10">

            {meses.map(({ mes, museus }) => (
              <div key={mes} className="space-y-6">

                <h2 className="text-2xl font-semibold capitalize">
                  {mes}
                </h2>

                {Object.entries(museus)
                  .filter(([m]) => filtroMuseu === 'Todos' || filtroMuseu === m)
                  .map(([museu, items]) => (
                    <div key={museu} className="space-y-3">

                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${MUSEU_COLORS[museu]}`} />
                        <h3 className="text-lg font-semibold">{museu}</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

                        {items.map((a, idx) => (
                          <div key={idx} className="border rounded-lg p-4 bg-white shadow-sm">

                            <div className="flex justify-between mb-2">
                              <div className="font-semibold">{a.nome}</div>
                              <div className={`w-2 h-2 rounded-full ${MUSEU_COLORS[a.museu]}`} />
                            </div>

                            <div className="text-xs text-gray-500">
                              {a.data} {a.horario ? `· ${a.horario}` : ''}
                            </div>

                            <div className="text-sm mt-3 text-gray-700">
                              {a.sinopse}
                            </div>

                            <div className="text-xs mt-3 space-y-1">
                              {a.vagas && <div>Vagas: {a.vagas}</div>}
                              {a.inscricao && <div>{a.inscricao}</div>}
                            </div>

                          </div>
                        ))}

                      </div>

                    </div>
                  ))}

              </div>
            ))}

          </div>
        )}
      </div>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar atividade</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">

            <Input placeholder="Nome" value={form.nome || ''} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <Input placeholder="Data" value={form.data || ''} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            <Input placeholder="Museu" value={form.museu || ''} onChange={(e) => setForm({ ...form, museu: e.target.value })} />
            <Input placeholder="Horário" value={form.horario || ''} onChange={(e) => setForm({ ...form, horario: e.target.value })} />

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
