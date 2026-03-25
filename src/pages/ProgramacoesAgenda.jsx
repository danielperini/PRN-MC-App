import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Calendar, MapPin, Users, Clock, Download, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_CONFIG = {
  ATIVO: { label: 'Ativo', color: 'bg-green-100 text-green-800 border-green-300' },
};

function ProgramacoesAgendaInner() {
  const [expandedId, setExpandedId] = useState(null);
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');

  const { data: programacoes = [], isLoading } = useQuery({
    queryKey: ['programacoes'],
    queryFn: () => base44.entities.Programacao.list('-data', 500),
  });

  const programacoesFiltradas = useMemo(() => {
    return programacoes.filter(p => {
      if (filtroMuseu !== 'Todos' && p.equipamento !== filtroMuseu) return false;
      return true;
    });
  }, [programacoes, filtroMuseu]);

  const museus = [...new Set(programacoes.map(p => p.equipamento).filter(Boolean))];

  const agruparPorMes = useMemo(() => {
    const grupos = {};

    programacoesFiltradas.forEach(prog => {
      const data = prog.data || 'sem-data';

      const mes = data.includes('/')
        ? data.split('/').slice(1).join('/') // MM/YYYY
        : data;

      if (!grupos[mes]) grupos[mes] = [];
      grupos[mes].push(prog);
    });

    return grupos;
  }, [programacoesFiltradas]);

  return (
    <div className="min-h-screen bg-white py-6 md:py-10">
      <div className="max-w-6xl mx-auto px-4 md:px-6">

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-8 h-8 text-black" />
            <h1 className="text-3xl font-bold text-black">Agenda de Programação</h1>
          </div>
        </div>

        <div className="flex gap-3 mb-6 flex-wrap">
          <Select value={filtroMuseu} onValueChange={setFiltroMuseu}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Museu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos</SelectItem>
              {museus.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="outline" className="px-3 py-1 text-xs">
            {programacoesFiltradas.length} atividades
          </Badge>
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando...</div>
        ) : Object.keys(agruparPorMes).length === 0 ? (
          <Card className="p-8 text-center border-gray-200">
            Nenhuma atividade encontrada
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(agruparPorMes).map(([mes, progs]) => (
              <div key={mes}>
                <h2 className="text-lg font-semibold mb-4">{mes}</h2>

                <div className="space-y-3">
                  {progs.map(prog => {
                    const isExpanded = expandedId === prog.id;

                    return (
                      <Card key={prog.id} className="border">

                        <div
                          onClick={() => setExpandedId(isExpanded ? null : prog.id)}
                          className="p-4 cursor-pointer"
                        >
                          <div className="flex justify-between">

                            <div>
                              <h3 className="font-semibold">
                                {prog.nome_acao}
                              </h3>

                              <div className="text-xs text-gray-600 mt-2 flex gap-3 flex-wrap">
                                <span>{prog.data}</span>
                                {prog.horario && <span>{prog.horario}</span>}
                                {prog.local && <span>{prog.local}</span>}
                              </div>
                            </div>

                            <ChevronDown className={`w-5 h-5 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-4 border-t bg-gray-50">

                            {prog.sinopse && (
                              <p className="text-sm mb-3">{prog.sinopse}</p>
                            )}

                            <div className="text-xs text-gray-600 space-y-1">
                              {prog.tipo_atividade && <div>Tipo: {prog.tipo_atividade}</div>}
                              {prog.publico && <div>Público: {prog.publico}</div>}
                              {prog.vagas && <div>Vagas: {prog.vagas}</div>}
                              {prog.inscricao && <div>Inscrição: {prog.inscricao}</div>}
                            </div>

                            <Button
                              size="sm"
                              className="mt-4"
                              onClick={() => window.open(prog.link_imagens || '#')}
                            >
                              Saiba mais
                            </Button>

                          </div>
                        )}

                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProgramacoesAgenda() {
  return <RequireAuth><ProgramacoesAgendaInner /></RequireAuth>;
}
