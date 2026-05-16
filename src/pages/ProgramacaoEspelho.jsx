import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Calendar } from 'lucide-react';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

const TIPO_CORES = {
  'Exposição': 'bg-purple-100 text-purple-800',
  'Oficina': 'bg-blue-100 text-blue-800',
  'Palestra': 'bg-green-100 text-green-800',
  'Evento': 'bg-orange-100 text-orange-800',
  'Visita': 'bg-teal-100 text-teal-800',
  'Formação': 'bg-pink-100 text-pink-800',
  'default': 'bg-slate-100 text-slate-800',
};

function getTipoCor(tipo) {
  if (!tipo) return TIPO_CORES.default;
  const key = Object.keys(TIPO_CORES).find(k => tipo.toLowerCase().includes(k.toLowerCase()));
  return key ? TIPO_CORES[key] : TIPO_CORES.default;
}

export default function ProgramacaoEspelho() {
  const [programacoes, setProgramacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mesSelecionado, setMesSelecionado] = useState('');
  const [museuSelecionado, setMuseuSelecionado] = useState('');
  const [anoSelecionado, setAnoSelecionado] = useState('2026');

  useEffect(() => {
    const mesAtual = MESES[new Date().getMonth()];
    setMesSelecionado(mesAtual);
  }, []);

  useEffect(() => {
    if (mesSelecionado) {
      carregarProgramacoes();
    }
  }, [mesSelecionado, museuSelecionado, anoSelecionado]);

  async function carregarProgramacoes() {
    setLoading(true);
    try {
      const filtros = {};
      if (mesSelecionado) filtros.mes = mesSelecionado;
      if (museuSelecionado) filtros.museu = museuSelecionado;
      if (anoSelecionado) filtros.ano = parseInt(anoSelecionado);

      const data = await base44.entities.Programacao.filter(filtros, 'data_inicio', 200);
      setProgramacoes(data || []);
    } catch (err) {
      console.error('Erro ao carregar programações:', err);
      setProgramacoes([]);
    } finally {
      setLoading(false);
    }
  }

  const programacoesFiltradas = programacoes;

  const agrupadoPorMuseu = MUSEUS.reduce((acc, museu) => {
    acc[museu] = programacoesFiltradas.filter(p => p.museu === museu);
    return acc;
  }, {});

  const totalGeral = programacoesFiltradas.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Programação — Espelho da Planilha</h1>
          <p className="text-slate-500 text-sm mt-1">Visualização espelho da programação registrada no sistema</p>
        </div>
        <Button variant="outline" size="sm" onClick={carregarProgramacoes} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={anoSelecionado} onValueChange={setAnoSelecionado}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2025">2025</SelectItem>
            <SelectItem value="2026">2026</SelectItem>
          </SelectContent>
        </Select>

        <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Todos os meses</SelectItem>
            {MESES.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={museuSelecionado} onValueChange={setMuseuSelecionado}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Museu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Todos</SelectItem>
            {MUSEUS.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resumo */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-slate-600">
          <Calendar className="w-4 h-4" />
          <span className="text-sm font-medium">
            {totalGeral} atividade{totalGeral !== 1 ? 's' : ''} encontrada{totalGeral !== 1 ? 's' : ''}
            {mesSelecionado ? ` em ${mesSelecionado}` : ''}
            {anoSelecionado ? ` de ${anoSelecionado}` : ''}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Carregando programação...</span>
        </div>
      ) : totalGeral === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma programação encontrada para os filtros selecionados.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {MUSEUS.map(museu => {
            const itens = agrupadoPorMuseu[museu];
            if (itens.length === 0 && museuSelecionado) return null;
            if (itens.length === 0) return null;

            return (
              <div key={museu}>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-semibold text-slate-800">{museu}</h2>
                  <Badge variant="secondary">{itens.length}</Badge>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Data</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Título / Atividade</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Tipo</th>
                        <th className="text-left px-4 py-3 font-medium text-slate-600">Espaço</th>
                        <th className="text-right px-4 py-3 font-medium text-slate-600">Participantes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {itens.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {item.data_inicio
                              ? new Date(item.data_inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                              : item.data || '—'}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800 max-w-xs">
                            {item.titulo || item.nome || item.atividade || '—'}
                          </td>
                          <td className="px-4 py-3">
                            {item.tipo ? (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getTipoCor(item.tipo)}`}>
                                {item.tipo}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-500">{item.espaco || item.local || '—'}</td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {item.participantes != null ? item.participantes.toLocaleString('pt-BR') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}