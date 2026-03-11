import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Edit, RotateCcw } from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';

function HelpManagementInner() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const queryClient = useQueryClient();

  const { data: helpTexts = [] } = useQuery({
    queryKey: ['help-texts'],
    queryFn: () => base44.entities.HelpText.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.HelpText.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['help-texts'] });
      setEditingId(null);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async ({ id, componentKey, label, componentType, context }) => {
      const res = await base44.functions.invoke('regenerateHelpText', {
        componentKey,
        label,
        componentType,
        contextDescription: context,
      });
      return res.data;
    },
    onSuccess: ({ help_text_ptbr }, variables) => {
      updateMutation.mutate({
        id: variables.id,
        data: {
          help_text_ptbr,
          last_generated_at: new Date().toISOString(),
          manually_edited: false,
        },
      });
    },
  });

  const filteredTexts = helpTexts.filter(h => {
    const matchesSearch = !searchTerm || h.label?.toLowerCase().includes(searchTerm.toLowerCase()) || h.component_key?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !filterType || h.component_type === filterType;
    return matchesSearch && matchesType;
  });

  const componentTypes = [
    'button', 'field', 'filter', 'tab', 'graph', 'card', 'menu_item',
    'table_action', 'workflow_action', 'indicator', 'upload', 'map_widget', 'sidebar_item', 'other'
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Gerenciador de Ajuda Contextual</h1>
          <p className="text-slate-600">
            Gerencie, edite e regenere textos de ajuda para toda a aplicação.
          </p>
        </div>

        <div className="flex gap-4 mb-6 flex-wrap">
          <Input
            placeholder="Buscar por label ou chave..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todos os tipos</SelectItem>
              {componentTypes.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Componente</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Label</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Tipo</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Texto de Ajuda</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredTexts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-8 text-center text-slate-500">
                      Nenhum texto de ajuda encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredTexts.map(help => (
                    <tr key={help.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-slate-700">{help.component_key}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 font-medium">{help.label}</td>
                      <td className="px-6 py-4">
                        <Badge variant="outline">{help.component_type}</Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                        {help.help_text_ptbr}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {!help.active && <Badge variant="destructive">Inativo</Badge>}
                          {help.manually_edited && <Badge className="bg-blue-100 text-blue-900">Editado</Badge>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingId(help.id);
                                  setEditText(help.help_text_ptbr);
                                }}
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Editar
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Editar texto de ajuda: {help.label}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <label className="text-sm font-medium text-slate-900">Chave</label>
                                  <Input value={help.component_key} disabled className="mt-1" />
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-slate-900">Texto de Ajuda</label>
                                  <Textarea
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    className="mt-1 h-32"
                                  />
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    variant="outline"
                                    onClick={() => setEditingId(null)}
                                  >
                                    Cancelar
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      updateMutation.mutate({
                                        id: help.id,
                                        data: {
                                          help_text_ptbr: editText,
                                          manually_edited: true,
                                        },
                                      });
                                    }}
                                  >
                                    Salvar
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              regenerateMutation.mutate({
                                id: help.id,
                                componentKey: help.component_key,
                                label: help.label,
                                componentType: help.component_type,
                                context: help.context_description,
                              });
                            }}
                            disabled={regenerateMutation.isPending}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-sm text-slate-600">
          Mostrando {filteredTexts.length} de {helpTexts.length} textos de ajuda
        </div>
      </div>
    </div>
  );
}

export default function HelpManagement() {
  return <RequireAuth><HelpManagementInner /></RequireAuth>;
}