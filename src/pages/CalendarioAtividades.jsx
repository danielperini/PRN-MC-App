import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Calendar, RefreshCw, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const MUSEUS = ['Todos', 'MHAB', 'MIS', 'MUMO', 'Externo'];

const MUSEU_COLORS = {
  MHAB: 'bg-purple-500',
  MIS: 'bg-cyan-500',
  MUMO: 'bg-pink-500',
  Externo: 'bg-gray-500',
};

function mapItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      if (!item?.data_iso) return null;

      const date = new Date(item.data_iso);

      return {
        id: `${item.row_index || index}-${index}`,
        nome: item.nome || item.titulo || `Atividade ${index + 1}`,
        descricao: item.resumo_ia || item.sinopse || item.descricao || '',
        sinopse: item.sinopse || item.descricao || '',
        horario: item.horario || '',
        vagas: item.vagas || '',
        inscricao: item.inscricao || item.inscricao_acesso || '',
        link: item.link || item.link_imagens || '',
        museu: item.museu || 'Externo',
        data: item.data || format(date, 'dd/MM/yyyy'),
        _date: date,
        raw: item,
      };
    })
    .filter(Boolean);
}

function CalendarioAtividadesInner() {
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const { data: mirrorData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['agenda-programacao'],
    queryFn: async () => {
      const res = await base44.functions.invoke('syncBaseConhecimento');
      return res?.data || {};
    },
  });

  const todasAtividades = useMemo(() => {
    const grouped = mirrorData?.grouped_by_museum_and_month || {};

    if (filtroMuseu === 'Todos') {
      const meses = grouped?.Todos || {};
      const combinadas = Object.values(meses).flat();
      return mapItems(combinadas).sort((a, b) => a._date.getTime() - b._date.getTime());
    }

    const meses = grouped?.[filtroMuseu] || {};
    const combinadas = Object.values(meses).flat();
    return mapItems(combinadas).sort((a, b) => a._date.getTime() - b._date.getTime());
  }, [mirrorData, filtroMuseu]);

  const atividadesAgrupadasPorMes = useMemo(() => {
    const map = new Map();

    todasAtividades.forEach((atividade) => {
      const key = format(atividade._date, 'yyyy-MM');

      if (!map.has(key)) {
        map.set(key, {
          key,
          label: format(atividade._date, 'MMMM yyyy', { locale: ptBR }),
          museus: {},
        });
      }

      const grupo = map.get(key);

      if (!grupo.museus[atividade.museu]) {
        grupo.museus[atividade.museu] = [];
      }

      grupo.museus[atividade.museu].push(atividade);
    });

    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [todasAtividades]);

  const abrirNovo = () => {
    setForm({
      nome: '',
      data: '',
      museu: 'MIS',
      horario: '',
      vagas: '',
      inscricao: '',
      descricao: '',
      link: '',
    });
    setShowEditor(true);
  };

  const abrirEditar = (item) => {
    setForm({
      ...item.raw,
      nome: item.raw?.nome || item.raw?.titulo || '',
      descricao: item.raw?.sinopse || item.raw?.descricao || '',
      inscricao: item.raw?.inscricao || item.raw?.inscricao_acesso || '',
      link: item.raw?.link || item.raw?.link_imagens || '',
    });
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
      alert(res?.data?.message || 'Salvo e sincronizado com sucesso');
      setShowEditor(false);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        'Erro ao salvar';

      alert(msg);
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

            <Badge>{todasAtividades.length}</Badge>
          </div>
        </div>

        {isLoading ? (
          <div>Carregando...</div>
        ) : (
          <div className="space-y-8">
            {atividadesAgrupadasPorMes.length === 0 ? (
              <div className="border rounded-lg p-6 text-sm text-gray-500">
                Nenhuma atividade encontrada.
              </div>
            ) : (
              atividadesAgrupadasPorMes.map((grupo) => (
                <div key={grupo.key} className="space-y-5">
                  <h2 className="text-2xl font-semibold capitalize">{grupo.label}</h2>

                  {Object.entries(grupo.museus).map(([museu, items]) => (
                    <div key={`${grupo.key}-${museu}`} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${MUSEU_COLORS[museu] || 'bg-gray-400'}`} />
                        <h3 className="text-lg font-semibold">{museu}</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {items.map((a) => (
                          <div key={a.id} className="border rounded-lg p-4 bg-white shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                              <div className="font-semibold leading-tight">{a.nome}</div>
                              <div className={`w-2 h-2 rounded-full ${MUSEU_COLORS[a.museu] || 'bg-gray-400'}`} />
                            </div>

                            <div className="text-xs text-gray-500">
                              {[a.data, a.horario].filter(Boolean).join(' · ')}
                            </div>

                            {a.descricao ? (
                              <div className="text-sm mt-3 text-gray-700">
                                {a.descricao}
                              </div>
                            ) : null}

                            <div className="text-xs text-gray-600 mt-3 space-y-1">
                              {a.vagas ? <div>Vagas: {a.vagas}</div> : null}
                              {a.inscricao ? <div>{a.inscricao}</div> : null}
                            </div>

                            <div className="flex gap-2 mt-4">
                              <Button size="sm" onClick={() => abrirEditar(a)}>
                                Editar
                              </Button>

                              {a.link ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(a.link, '_blank')}
                                >
                                  Saiba mais
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Editar atividade' : 'Nova atividade'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Input
              placeholder="Nome"
              value={form.nome || ''}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />

            <Input
              placeholder="Data"
              value={form.data || ''}
              onChange={(e) => setForm({ ...form, data: e.target.value })}
            />

            <Input
              placeholder="Museu"
              value={form.museu || ''}
              onChange={(e) => setForm({ ...form, museu: e.target.value })}
            />

            <Input
              placeholder="Horário"
              value={form.horario || ''}
              onChange={(e) => setForm({ ...form, horario: e.target.value })}
            />

            <Input
              placeholder="Vagas"
              value={form.vagas || ''}
              onChange={(e) => setForm({ ...form, vagas: e.target.value })}
            />

            <Input
              placeholder="Inscrição"
              value={form.inscricao || ''}
              onChange={(e) => setForm({ ...form, inscricao: e.target.value })}
            />

            <Input
              placeholder="Link"
              value={form.link || ''}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />

            <Input
              placeholder="Descrição"
              value={form.descricao || ''}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button onClick={salvar} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar e sincronizar'}
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
