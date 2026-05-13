import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X, Plus } from 'lucide-react';
import { toast } from 'sonner';

const GRUPOS_PADRAO = ['Equipe e gestão', 'Manutenção e operação', 'Despesas gerais'];
const METAS_PADRAO = ['MC3A-20', 'MC3A-21', 'MC3A-22', 'MC3A-23', 'MC3A-24', 'MC3A-25', 'MC3A-EXTRA'];

export default function EditRubricaDialog({ isOpen, onClose, rubrica = null }) {
  const [formData, setFormData] = useState({
    rubrica: '', grupo: '', meta: '', descricao: '',
    numero_parcelas_unidades: '', valor_rubrica: '', observacao_uso: '', ativo: true,
  });
  const [grupos, setGrupos] = useState(GRUPOS_PADRAO);
  const [metas, setMetas] = useState(METAS_PADRAO);
  const [novoGrupo, setNovoGrupo] = useState('');
  const [novaMeta, setNovaMeta] = useState('');
  const [mostrarNovoGrupo, setMostrarNovoGrupo] = useState(false);
  const [mostrarNovaMeta, setMostrarNovaMeta] = useState(false);
  const queryClient = useQueryClient();

  // Carrega grupos/metas existentes das rubricas já cadastradas
  useEffect(() => {
    base44.entities.Rubrica.list('ordem_exibicao', 500).then(data => {
      const gruposExistentes = [...new Set([
        ...GRUPOS_PADRAO,
        ...(data || []).map(r => r.grupo).filter(Boolean),
      ])];
      const metasExistentes = [...new Set([
        ...METAS_PADRAO,
        ...(data || []).map(r => r.meta).filter(Boolean),
      ])];
      setGrupos(gruposExistentes);
      setMetas(metasExistentes);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (rubrica) {
      setFormData({
        rubrica: rubrica.rubrica || '',
        grupo: rubrica.grupo || '',
        meta: rubrica.meta || '',
        descricao: rubrica.descricao || rubrica.observacao_uso || '',
        numero_parcelas_unidades: rubrica.numero_parcelas_unidades || '',
        valor_rubrica: rubrica.valor_rubrica || '',
        observacao_uso: rubrica.observacao_uso || '',
        ativo: rubrica.ativo !== false,
      });
    }
  }, [rubrica]);

  function setField(key, value) {
    setFormData(f => ({ ...f, [key]: value }));
  }

  function adicionarGrupo() {
    if (!novoGrupo.trim()) return;
    setGrupos(g => [...new Set([...g, novoGrupo.trim()])]);
    setField('grupo', novoGrupo.trim());
    setNovoGrupo('');
    setMostrarNovoGrupo(false);
  }

  function adicionarMeta() {
    if (!novaMeta.trim()) return;
    setMetas(m => [...new Set([...m, novaMeta.trim()])]);
    setField('meta', novaMeta.trim());
    setNovaMeta('');
    setMostrarNovaMeta(false);
  }

  const handleSave = async () => {
    if (!formData.grupo || !formData.rubrica || !formData.valor_rubrica) {
      toast.error('Preencha os campos obrigatórios: Grupo, Nome e Valor');
      return;
    }

    const valor = parseFloat(String(formData.valor_rubrica).replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
      toast.error('Informe um valor válido.');
      return;
    }

    try {
      if (rubrica?.id) {
        await base44.entities.Rubrica.update(rubrica.id, {
          rubrica: formData.rubrica,
          grupo: formData.grupo,
          meta: formData.meta,
          descricao: formData.descricao,
          numero_parcelas_unidades: formData.numero_parcelas_unidades,
          valor_rubrica: valor,
          valor_total: valor,
          observacao_uso: formData.descricao || formData.observacao_uso,
          ativo: formData.ativo,
        });
        toast.success('Rubrica atualizada!');
      } else {
        await base44.entities.Rubrica.create({
          rubrica: formData.rubrica,
          grupo: formData.grupo,
          meta: formData.meta,
          descricao: formData.descricao,
          numero_parcelas_unidades: formData.numero_parcelas_unidades,
          valor_rubrica: valor,
          valor_total: valor,
          valor_utilizado: 0,
          saldo: valor,
          saldo_real: valor,
          percentual_utilizado: 0,
          observacao_uso: formData.descricao || formData.observacao_uso,
          ativo: formData.ativo,
          ordem_exibicao: 999,
        });
        toast.success('Rubrica criada!');
      }

      queryClient.invalidateQueries({ queryKey: ['rubricas'] });
      onClose();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-black">
            {rubrica?.id ? 'Editar Rubrica' : 'Nova Rubrica'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nome */}
        <div>
          <label className="text-sm font-semibold text-black block mb-1">Nome *</label>
          <Input value={formData.rubrica} onChange={e => setField('rubrica', e.target.value)} placeholder="Ex: Designer Gráfico" />
        </div>

        {/* Grupo */}
        <div>
          <label className="text-sm font-semibold text-black block mb-1">Grupo *</label>
          <div className="flex gap-2">
            <select
              value={formData.grupo}
              onChange={e => setField('grupo', e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="">Selecione um grupo</option>
              {grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <Button type="button" size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => setMostrarNovoGrupo(v => !v)}>
              <Plus className="w-3.5 h-3.5" /> Novo
            </Button>
          </div>
          {mostrarNovoGrupo && (
            <div className="flex gap-2 mt-2">
              <Input placeholder="Nome do novo grupo" value={novoGrupo} onChange={e => setNovoGrupo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adicionarGrupo()} />
              <Button type="button" size="sm" className="bg-black text-white" onClick={adicionarGrupo}>Adicionar</Button>
            </div>
          )}
        </div>

        {/* Meta */}
        <div>
          <label className="text-sm font-semibold text-black block mb-1">Meta vinculada</label>
          <div className="flex gap-2">
            <select
              value={formData.meta}
              onChange={e => setField('meta', e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="">Nenhuma</option>
              {metas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <Button type="button" size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => setMostrarNovaMeta(v => !v)}>
              <Plus className="w-3.5 h-3.5" /> Nova
            </Button>
          </div>
          {mostrarNovaMeta && (
            <div className="flex gap-2 mt-2">
              <Input placeholder="Código ou nome da nova meta" value={novaMeta} onChange={e => setNovaMeta(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && adicionarMeta()} />
              <Button type="button" size="sm" className="bg-black text-white" onClick={adicionarMeta}>Adicionar</Button>
            </div>
          )}
        </div>

        {/* Valor */}
        <div>
          <label className="text-sm font-semibold text-black block mb-1">Valor (R$) *</label>
          <Input type="number" step="0.01" min="0" value={formData.valor_rubrica}
            onChange={e => setField('valor_rubrica', e.target.value)} placeholder="0,00" />
        </div>

        {/* Nº Parcelas */}
        <div>
          <label className="text-sm font-semibold text-black block mb-1">Nº Parcelas / Unidades</label>
          <Input value={formData.numero_parcelas_unidades}
            onChange={e => setField('numero_parcelas_unidades', e.target.value)} placeholder="Ex: 10 meses" />
        </div>

        {/* Descrição */}
        <div>
          <label className="text-sm font-semibold text-black block mb-1">Descrição</label>
          <Textarea rows={2} value={formData.descricao} onChange={e => setField('descricao', e.target.value)}
            placeholder="Observações sobre uso e alocação..." />
        </div>

        {/* Ativo */}
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={formData.ativo} onChange={e => setField('ativo', e.target.checked)} className="w-4 h-4" />
          <label className="text-sm text-black">Rubrica ativa</label>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-black hover:bg-gray-800 text-white" onClick={handleSave}>
            {rubrica?.id ? 'Atualizar' : 'Criar Rubrica'}
          </Button>
        </div>
      </div>
    </div>
  );
}