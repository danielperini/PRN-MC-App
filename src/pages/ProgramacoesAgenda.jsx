import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { Calendar, MapPin, Users, Clock, FileText, Download, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_CONFIG = {
  PLANEJADA: { label: 'Planejada', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  CONFIRMADA: { label: 'Confirmada', color: 'bg-green-100 text-green-800 border-green-300' },
  EM_ANDAMENTO: { label: 'Em Andamento', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  REALIZADA: { label: 'Realizada', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  CANCELADA: { label: 'Cancelada', color: 'bg-red-100 text-red-800 border-red-300' },
};

function ProgramacoesAgendaInner() {
  const { user: currentUser } = useCurrentUser();
  const [expandedId, setExpandedId] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('CONFIRMADA');
  const [filtroMuseu, setFiltroMuseu] = useState('Todos');

  // Buscar todas as programações
  const { data: programacoes = [], isLoading } = useQuery({
    queryKey: ['programacoes'],
    queryFn: () => base44.entities.Programacao.list('-data_inicio', 200),
  });

  // Buscar atividades vinculadas
  const { data: atividades = [] } = useQuery({
    queryKey: ['activities-programacao'],
    queryFn: () => base44.entities.Activity.list('-data_realizacao', 500),
  });

  // Montar dados completos
  const programacoesCompletas = useMemo(() => {
    return programacoes.map(prog => {
      const ativ = atividades.find(a => a.id === prog.activity_id);
      return {
        ...prog,
        atividade: ativ || null,
      };
    });
  }, [programacoes, atividades]);

  // Aplicar filtros
  const programacoesFiltradas = useMemo(() => {
    return programacoesCompletas.filter(p => {
      if (filtroStatus !== 'Todos' && p.status !== filtroStatus) return false;
      if (filtroMuseu !== 'Todos' && p.museu !== filtroMuseu) return false;
      return true;
    });
  }, [programacoesCompletas, filtroStatus, filtroMuseu]);

  // Agrupar por mês
  const programacoesAgrupadas = useMemo(() => {
    const grupos = {};
    programacoesFiltradas.forEach(prog => {
      try {
        const data = parseISO(prog.data_inicio);
        const chave = format(data, 'yyyy-MM');
        if (!grupos[chave]) grupos[chave] = [];
        grupos[chave].push(prog);
      } catch (e) {
        // data inválida
      }
    });
    return grupos;
  }, [programacoesFiltradas]);

  const museus = [...new Set(programacoesCompletas.map(p => p.museu).filter(Boolean))];

  const handleExportarProgramacao = (prog) => {
    const conteudo = `
PROGRAMAÇÃO: ${prog.titulo}
${prog.descricao ? `Descrição: ${prog.descricao}\n` : ''}
Data: ${format(parseISO(prog.data_inicio), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
Local: ${prog.local || 'Não especificado'}
Responsável: ${prog.responsavel || 'Não especificado'}
Museu: ${prog.museu || 'Não especificado'}
Equipe: ${prog.equipe || 'Não especificado'}
Status: ${STATUS_CONFIG[prog.status]?.label || prog.status}
Capacidade: ${prog.capacidade || 'Não especificada'}
Público Esperado: ${prog.publico_esperado || 'Não especificado'}
Acessibilidade: ${prog.acessibilidade || 'Não'}

MATERIAL DE DIVULGAÇÃO:
${prog.material_divulgacao?.length ? prog.material_divulgacao.map(m => `- ${m.tipo}: ${m.descricao}`).join('\n') : 'Nenhum material registrado'}

CONTATOS IMPORTANTES:
${prog.contatos_importantes?.length ? prog.contatos_importantes.map(c => `- ${c.nome} (${c.cargo}): ${c.telefone || c.email}`).join('\n') : 'Nenhum contato registrado'}

OBSERVAÇÕES:
${prog.observacoes || 'Nenhuma observação'}
    `;
    
    const blob = new Blob([conteudo], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `programacao_${prog.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-white py-6 md:py-10">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="w-8 h-8 text-black" />
            <h1 className="text-3xl font-bold text-black">Programações da Agenda</h1>
          </div>
          <p className="text-gray-600 text-sm">Resumo de todas as programações cadastradas com informações de divulgação e contatos</p>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 flex-wrap">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os Status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroMuseu} onValueChange={setFiltroMuseu}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Museu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos os Museus</SelectItem>
              {museus.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="outline" className="px-3 py-1 text-xs">
            {programacoesFiltradas.length} programação(ões)
          </Badge>
        </div>

        {/* Conteúdo */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-400">Carregando programações...</div>
        ) : Object.keys(programacoesAgrupadas).length === 0 ? (
          <Card className="p-8 text-center border-gray-200">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Nenhuma programação encontrada</p>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(programacoesAgrupadas)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([mes, progs]) => (
                <div key={mes}>
                  {/* Cabeçalho do mês */}
                  <h2 className="text-lg font-semibold text-black mb-4 pb-2 border-b border-gray-200">
                    {format(parseISO(`${mes}-01`), "MMMM 'de' yyyy", { locale: ptBR }).toUpperCase()}
                  </h2>

                  {/* Programações do mês */}
                  <div className="space-y-3">
                    {progs.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio)).map(prog => {
                      const isExpanded = expandedId === prog.id;
                      const statusConfig = STATUS_CONFIG[prog.status] || STATUS_CONFIG.PLANEJADA;

                      return (
                        <Card key={prog.id} className="border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                          {/* Card Resumido */}
                          <div
                            onClick={() => setExpandedId(isExpanded ? null : prog.id)}
                            className="p-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  <h3 className="font-semibold text-black text-base">{prog.titulo}</h3>
                                  <Badge className={`${statusConfig.color} border text-xs font-medium`}>
                                    {statusConfig.label}
                                  </Badge>
                                  {prog.museu && (
                                    <Badge variant="outline" className="text-xs">{prog.museu}</Badge>
                                  )}
                                </div>

                                {/* Informações resumidas */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 flex-shrink-0" />
                                    <span>
                                      {format(parseISO(prog.data_inicio), "d 'de' MMM, HH:mm", { locale: ptBR })}
                                      {prog.data_fim ? ` até ${format(parseISO(prog.data_fim), "HH:mm")}` : ''}
                                    </span>
                                  </div>
                                  {prog.local && (
                                    <div className="flex items-center gap-2">
                                      <MapPin className="w-4 h-4 flex-shrink-0" />
                                      <span className="truncate">{prog.local}</span>
                                    </div>
                                  )}
                                  {prog.publico_esperado && (
                                    <div className="flex items-center gap-2">
                                      <Users className="w-4 h-4 flex-shrink-0" />
                                      <span>{prog.publico_esperado} pessoas esperadas</span>
                                    </div>
                                  )}
                                  {prog.responsavel && (
                                    <div className="text-xs text-gray-500">
                                      Responsável: <span className="font-medium text-gray-700">{prog.responsavel}</span>
                                    </div>
                                  )}
                                </div>

                                {/* Descrição curta */}
                                {prog.descricao && (
                                  <p className="text-xs text-gray-600 line-clamp-2">{prog.descricao}</p>
                                )}
                              </div>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedId(isExpanded ? null : prog.id);
                                }}
                              >
                                <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </Button>
                            </div>
                          </div>

                          {/* Detalhes Expandidos */}
                          {isExpanded && (
                            <div className="border-t border-gray-200 p-4 bg-gray-50/50">
                              {/* Descrição completa */}
                              {prog.descricao && (
                                <div className="mb-4">
                                  <p className="text-xs font-semibold text-gray-700 mb-1">Descrição</p>
                                  <p className="text-sm text-gray-600 leading-relaxed">{prog.descricao}</p>
                                </div>
                              )}

                              {/* Informações adicionais */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-sm">
                                <div>
                                  <p className="text-xs font-semibold text-gray-700 mb-1">Capacidade do Local</p>
                                  <p className="text-gray-600">{prog.capacidade || 'Não especificada'} pessoas</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-700 mb-1">Equipe</p>
                                  <p className="text-gray-600">{prog.equipe || 'Não especificada'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-700 mb-1">Acessibilidade</p>
                                  <p className="text-gray-600">{prog.acessibilidade || 'Não'}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-gray-700 mb-1">Classificação</p>
                                  <Badge className="w-fit text-xs">
                                    {prog.classificacao || 'N/A'}
                                  </Badge>
                                </div>
                              </div>

                              {/* Material de divulgação */}
                              {prog.material_divulgacao?.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-xs font-semibold text-gray-700 mb-2">📢 Material de Divulgação</p>
                                  <div className="space-y-2">
                                    {prog.material_divulgacao.map((mat, idx) => (
                                      <div key={idx} className="p-2 bg-white border border-gray-200 rounded text-xs">
                                        <p className="font-medium text-gray-800">{mat.tipo}</p>
                                        <p className="text-gray-600">{mat.descricao}</p>
                                        {mat.url_arquivo && (
                                          <a href={mat.url_arquivo} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                                            Abrir arquivo
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Contatos importantes */}
                              {prog.contatos_importantes?.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-xs font-semibold text-gray-700 mb-2">📞 Contatos Importantes</p>
                                  <div className="space-y-2">
                                    {prog.contatos_importantes.map((contato, idx) => (
                                      <div key={idx} className="p-2 bg-white border border-gray-200 rounded text-xs">
                                        <p className="font-medium text-gray-800">{contato.nome}</p>
                                        <p className="text-gray-600">{contato.cargo}</p>
                                        <div className="flex gap-2 mt-1 flex-wrap">
                                          {contato.telefone && <span className="text-blue-600">{contato.telefone}</span>}
                                          {contato.email && <span className="text-blue-600">{contato.email}</span>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Observações */}
                              {prog.observacoes && (
                                <div className="mb-4">
                                  <p className="text-xs font-semibold text-gray-700 mb-1">Observações</p>
                                  <p className="text-sm text-gray-600 leading-relaxed">{prog.observacoes}</p>
                                </div>
                              )}

                              {/* Botão de exportar */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleExportarProgramacao(prog)}
                                className="gap-2"
                              >
                                <Download className="w-4 h-4" />
                                Exportar Programação
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