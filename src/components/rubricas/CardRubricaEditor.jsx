import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Save, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIAS = {
  manutencao: 'Manutenção de Rotina',
  diarias_educador: 'Diárias de Educador',
  lanches: 'Lanches',
  alimentacao_cartao: 'Alimentação Cartão',
  material: 'Material',
  acoes_educativas: 'Ações Educativas',
  som_luz: 'Som e Luz',
  exposicao: 'Exposição',
  outros: 'Outros',
};

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

export default function CardRubricaEditor({ open, onClose }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('listar'); // 'listar' | 'criar'
  const [saving, setSaving] = useState(false);
  const [editingRubrica, setEditingRubrica] = useState(null);
  const [editValues, setEditValues] = useState({});

  // Novo card
  const [novoCard, setNovoCard] = useState({
    museu: 'MHAB',
    rubrica: '',
    grupo: '',
    categoria_key: 'manutencao',
    valor_rubrica: '',
    valor_utilizado: '',
    ativo: true,
    publica: true,
  });

  const { data: rubricas = [], isLoading } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 500),
    enabled: open,
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: () => base44.entities.RubricaMuseuConfig.list('', 1000),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['rubricas-all'] });
    queryClient.invalidateQueries({ queryKey: ['rubrica-museu-configs'] });
    queryClient.invalidateQueries({ queryKey: ['rubricas-consolidadas'] });
  };

  // Agrupa rubricas por museu via config
  const rubricasPorMuseu = (museu) => {
    const configsMuseu = configs.filter(c => c.museu === museu);
    return configsMuseu.map(c => {
      const r = rubricas.find(r => r.id === c.rubrica_id);
      return r ? { ...r, config: c } : null;
    }).filter(Boolean);
  };

  const handleDelete = async (rubrica, config) => {
    if (!confirm(`Excluir a rubrica "${rubrica.rubrica}"? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      // Deleta config e desativa rubrica
      await base44.entities.RubricaMuseuConfig.delete(config.id);
      await base44.entities.Rubrica.update(rubrica.id, { ativo: false });
      invalidate();
      toast.success('Card removido com sucesso');
    } catch (e) {
      toast.error('Erro ao excluir: ' + e.message);
    }
    setSaving(false);
  };

  const handleEditStart = (rubrica) => {
    setEditingRubrica(rubrica.id);
    setEditValues({
      valor_rubrica: rubrica.valor_rubrica ?? '',
      valor_utilizado: rubrica.valor_utilizado ?? '',
      saldo: rubrica.saldo ?? '',
      observacao_uso: rubrica.observacao_uso ?? '',
      ativo: rubrica.ativo !== false,
    });
  };

  const handleEditSave = async (rubricaId) => {
    setSaving(true);
    try {
      const valor_rubrica = parseFloat(editValues.valor_rubrica) || 0;
      const valor_utilizado = parseFloat(editValues.valor_utilizado) || 0;
      const saldo = editValues.saldo !== '' ? parseFloat(editValues.saldo) : valor_rubrica - valor_utilizado;
      const pct = valor_rubrica > 0 ? parseFloat(((valor_utilizado / valor_rubrica) * 100).toFixed(1)) : 0;
      await base44.entities.Rubrica.update(rubricaId, {
        valor_rubrica,
        valor_utilizado,
        saldo,
        percentual_utilizado: pct,
        observacao_uso: editValues.observacao_uso,
        ativo: editValues.ativo,
      });
      invalidate();
      toast.success('Rubrica atualizada');
      setEditingRubrica(null);
    } catch (e) {
      toast.error('Erro ao salvar');
    }
    setSaving(false);
  };

  const handleCriarCard = async () => {
    if (!novoCard.rubrica.trim()) { toast.error('Informe o nome da rubrica'); return; }
    setSaving(true);
    try {
      const novaRubrica = await base44.entities.Rubrica.create({
        rubrica: novoCard.rubrica.trim(),
        grupo: novoCard.grupo.trim() || novoCard.categoria_key,
        valor_rubrica: parseFloat(novoCard.valor_rubrica) || 0,
        valor_utilizado: parseFloat(novoCard.valor_utilizado) || 0,
        saldo: (parseFloat(novoCard.valor_rubrica) || 0) - (parseFloat(novoCard.valor_utilizado) || 0),
        ativo: novoCard.ativo,
        ordem_exibicao: 99,
      });
      await base44.entities.RubricaMuseuConfig.create({
        rubrica_id: novaRubrica.id,
        museu: novoCard.museu,
        categoria_key: novoCard.categoria_key,
        divisor: 1,
      });
      invalidate();
      toast.success('Card criado com sucesso!');
      setNovoCard({ museu: 'MHAB', rubrica: '', grupo: '', categoria_key: 'manutencao', valor_rubrica: '', valor_utilizado: '', ativo: true, publica: true });
      setTab('listar');
    } catch (e) {
      toast.error('Erro ao criar: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Gerenciar Cards de Rubricas</DialogTitle>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex gap-2 border-b pb-3">
          <button
            onClick={() => setTab('listar')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'listar' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Cards existentes
          </button>
          <button
            onClick={() => setTab('criar')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === 'criar' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            <Plus className="w-3.5 h-3.5" /> Criar novo card
          </button>
        </div>

        <div className="overflow-y-auto flex-1 pr-1">
          {/* === LISTAR === */}
          {tab === 'listar' && (
            <div className="space-y-6">
              {isLoading ? (
                <div className="text-center py-10 text-gray-400 text-sm">Carregando...</div>
              ) : (
                MUSEUS.map(museu => {
                  const items = rubricasPorMuseu(museu);
                  return (
                    <div key={museu}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-bold text-sm text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{museu}</span>
                        <span className="text-xs text-gray-400">{items.length} rubricas</span>
                      </div>
                      {items.length === 0 ? (
                        <p className="text-xs text-gray-400 pl-2">Nenhuma rubrica vinculada.</p>
                      ) : (
                        <div className="space-y-2">
                          {items.map(rubrica => {
                            const isEditing = editingRubrica === rubrica.id;
                            const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            return (
                              <div key={rubrica.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="font-medium text-sm text-gray-900 truncate">
                                      {rubrica.rubrica.replace(/ - (MIS|MUMO|MHAB)$/i, '')}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">
                                      {CATEGORIAS[rubrica.config?.categoria_key] || rubrica.config?.categoria_key}
                                    </Badge>
                                    {!rubrica.ativo && (
                                      <Badge className="text-[10px] px-1.5 bg-red-100 text-red-600 border-red-200 shrink-0">inativa</Badge>
                                    )}
                                  </div>
                                  <div className="flex gap-1 shrink-0">
                                    {!isEditing && (
                                      <>
                                        <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => handleEditStart(rubrica)}>
                                          Editar
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-7 px-2 text-red-600 hover:bg-red-50 border-red-200" onClick={() => handleDelete(rubrica, rubrica.config)} disabled={saving}>
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {!isEditing && (
                                  <div className="flex gap-4 text-xs text-gray-500 mt-1">
                                    <span>Orçado: <b className="text-gray-800">{fmt(rubrica.valor_rubrica)}</b></span>
                                    <span>Utilizado: <b className="text-amber-600">{fmt(rubrica.valor_utilizado)}</b></span>
                                    <span>Saldo: <b className={rubrica.saldo < 0 ? 'text-red-600' : 'text-green-600'}>{fmt(rubrica.saldo)}</b></span>
                                  </div>
                                )}

                                {isEditing && (
                                  <div className="mt-2 space-y-3">
                                    <div className="grid grid-cols-3 gap-2">
                                      <div>
                                        <Label className="text-[11px] text-gray-500">Valor Orçado (R$)</Label>
                                        <Input type="number" step="0.01" value={editValues.valor_rubrica}
                                          onChange={e => setEditValues(p => ({ ...p, valor_rubrica: e.target.value }))}
                                          className="h-7 text-xs mt-0.5" />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] text-gray-500">Valor Utilizado (R$)</Label>
                                        <Input type="number" step="0.01" value={editValues.valor_utilizado}
                                          onChange={e => setEditValues(p => ({ ...p, valor_utilizado: e.target.value }))}
                                          className="h-7 text-xs mt-0.5" />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] text-gray-500">Saldo Manual (R$)</Label>
                                        <Input type="number" step="0.01" value={editValues.saldo}
                                          onChange={e => setEditValues(p => ({ ...p, saldo: e.target.value }))}
                                          className="h-7 text-xs mt-0.5" placeholder="Auto" />
                                      </div>
                                    </div>
                                    <div>
                                      <Label className="text-[11px] text-gray-500">Observação</Label>
                                      <Input value={editValues.observacao_uso}
                                        onChange={e => setEditValues(p => ({ ...p, observacao_uso: e.target.value }))}
                                        className="h-7 text-xs mt-0.5" placeholder="Observação de uso..." />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Switch checked={editValues.ativo} onCheckedChange={v => setEditValues(p => ({ ...p, ativo: v }))} />
                                      <Label className="text-xs text-gray-600">Card ativo/visível</Label>
                                    </div>
                                    <div className="flex gap-2 justify-end">
                                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditingRubrica(null)}>Cancelar</Button>
                                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => handleEditSave(rubrica.id)} disabled={saving}>
                                        <Save className="w-3 h-3 mr-1" />Salvar
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* === CRIAR === */}
          {tab === 'criar' && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-gray-500">Crie um novo card de rubrica e defina a qual museu e categoria ele pertence. Cards marcados como <b>públicos</b> serão exibidos automaticamente nos dashboards.</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-600">Museu *</Label>
                  <Select value={novoCard.museu} onValueChange={v => setNovoCard(p => ({ ...p, museu: v }))}>
                    <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Categoria *</Label>
                  <Select value={novoCard.categoria_key} onValueChange={v => setNovoCard(p => ({ ...p, categoria_key: v }))}>
                    <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIAS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-600">Nome da Rubrica *</Label>
                <Input value={novoCard.rubrica} onChange={e => setNovoCard(p => ({ ...p, rubrica: e.target.value }))}
                  className="h-8 text-sm mt-1" placeholder="Ex: Material de Consumo" />
              </div>

              <div>
                <Label className="text-xs text-gray-600">Grupo/Subcategoria</Label>
                <Input value={novoCard.grupo} onChange={e => setNovoCard(p => ({ ...p, grupo: e.target.value }))}
                  className="h-8 text-sm mt-1" placeholder="Ex: Materiais e Insumos" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-600">Valor Orçado (R$)</Label>
                  <Input type="number" step="0.01" value={novoCard.valor_rubrica}
                    onChange={e => setNovoCard(p => ({ ...p, valor_rubrica: e.target.value }))}
                    className="h-8 text-sm mt-1" placeholder="0,00" />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Valor já Utilizado (R$)</Label>
                  <Input type="number" step="0.01" value={novoCard.valor_utilizado}
                    onChange={e => setNovoCard(p => ({ ...p, valor_utilizado: e.target.value }))}
                    className="h-8 text-sm mt-1" placeholder="0,00" />
                </div>
              </div>

              <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center gap-2">
                  <Switch checked={novoCard.ativo} onCheckedChange={v => setNovoCard(p => ({ ...p, ativo: v }))} />
                  <Label className="text-xs text-gray-700">Card <b>ativo</b> (visível nos dashboards)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={novoCard.publica} onCheckedChange={v => setNovoCard(p => ({ ...p, publica: v }))} />
                  <div className="flex items-center gap-1">
                    {novoCard.publica ? <Eye className="w-3.5 h-3.5 text-green-600" /> : <EyeOff className="w-3.5 h-3.5 text-gray-400" />}
                    <Label className="text-xs text-gray-700">
                      <b>Publicar automaticamente</b> — rubrica autorizada a aparecer nos cards públicos dos museus
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setTab('listar')}>Cancelar</Button>
                <Button size="sm" className="bg-gray-900 hover:bg-gray-800" onClick={handleCriarCard} disabled={saving}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {saving ? 'Criando...' : 'Criar Card'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}