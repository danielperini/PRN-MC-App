import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Check, X, DollarSign, TrendingDown, TrendingUp, Target, Download } from 'lucide-react';
import { toast } from 'sonner';
import EditRubricaDialog from '@/components/compras/EditRubricaDialog';
import ImportarRubricasAtualizadas from '@/components/compras/ImportarRubricasAtualizadas';

const fmt = (v) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const EMPTY_LINE = {
  codigo: '', natureza_codigo: '', natureza_nome: '',
  descricao: '', unidade: 'un', qtd: 1, periodo_meses: 1,
  numero_parcelas: 1, valor_unit_medio: 0, valor_total_previsto: 0,
  valor_parcela: 0, saldo_inicial: 0, saldo_comprometido: 0, ativo: true,
};

const UNIT_OPTIONS = ['mês', 'un', 'diária', 'hora', 'kg', 'serviço', 'km', 'evento'];

const META_LABELS = {
  'MC3A-20': 'MC3A-20 — Ações Educativas',
  'MC3A-21': 'MC3A-21 — Exposição / Produção Cultural',
  'MC3A-22': 'MC3A-22 — Comunicação e Divulgação',
  'MC3A-23': 'MC3A-23 — Noturno nos Museus',
  'MC3A-24': 'MC3A-24 — Emenda Parlamentar',
  'MC3A-25': 'MC3A-25 — Outras Ações',
  'MC3A-EXTRA': 'MC3A-EXTRA — Ações Extras',
};

function AddRubricaForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_LINE });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valorParcela = form.numero_parcelas > 0 ? (form.valor_total_previsto || 0) / form.numero_parcelas : 0;

  const handleSave = async () => {
    if (!form.codigo || !form.descricao) { toast.error('Código e descrição são obrigatórios.'); return; }
    setSaving(true);
    try {
      await base44.entities.BudgetLine.create({
        ...form,
        saldo_inicial: parseFloat(form.saldo_inicial) || 0,
        saldo_comprometido: parseFloat(form.saldo_comprometido) || 0,
        valor_total_previsto: parseFloat(form.valor_total_previsto) || 0,
        valor_unit_medio: parseFloat(form.valor_unit_medio) || 0,
        qtd: parseFloat(form.qtd) || 1,
        periodo_meses: parseFloat(form.periodo_meses) || 1,
        numero_parcelas: parseFloat(form.numero_parcelas) || 1,
        valor_parcela: valorParcela,
      });
      toast.success('Rubrica criada!');
      onSaved();
    } catch (e) { toast.error('Erro ao salvar: ' + e.message); }
    setSaving(false);
  };

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
      <h4 className="text-sm font-semibold text-blue-800">Nova Rubrica</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Código *</label>
          <Input value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="3A-001" className="h-8 text-xs" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-gray-500 mb-1 block">Descrição *</label>
          <Input value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Descrição da rubrica" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Natureza</label>
          <Input value={form.natureza_nome} onChange={e => set('natureza_nome', e.target.value)} placeholder="Nome natureza" className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Saldo Inicial (R$)</label>
          <Input type="number" step="0.01" value={form.saldo_inicial} onChange={e => set('saldo_inicial', e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Valor Total Previsto</label>
          <Input type="number" step="0.01" value={form.valor_total_previsto} onChange={e => set('valor_total_previsto', e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Parcelas</label>
          <Input type="number" min="1" value={form.numero_parcelas} onChange={e => set('numero_parcelas', e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Unidade</label>
          <select value={form.unidade} onChange={e => set('unidade', e.target.value)} className="h-8 text-xs border border-gray-300 rounded px-2 w-full">
            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1" />Cancelar</Button>
        <Button size="sm" className="bg-black text-white" onClick={handleSave} disabled={saving}>
          <Check className="w-3.5 h-3.5 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  );
}

function RubricaCard({ line, purchases, onEdit }) {
  // Valor utilizado: soma de compras aprovadas/pagas vinculadas a esta rubrica
  const purchasesForLine = purchases.filter(p => p.budgetline_id === line.id);
  const valorUtilizado = purchasesForLine
    .filter(p => ['APROVADO_ADMIN', 'PAGO'].includes(p.status))
    .reduce((s, p) => s + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
  const valorPago = purchasesForLine
    .filter(p => p.status === 'PAGO')
    .reduce((s, p) => s + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);

  const valorPrevisto = line.saldo_inicial || line.valor_total_previsto || 0;
  const saldo = valorPrevisto - valorUtilizado;
  const pct = valorPrevisto > 0 ? Math.min((valorUtilizado / valorPrevisto) * 100, 100) : 0;

  // Metas vinculadas (únicas)
  const metasVinculadas = [...new Set(purchasesForLine.map(p => p.meta_id).filter(Boolean))];

  const saldoColor = saldo < 0 ? 'text-red-600' : saldo < valorPrevisto * 0.1 ? 'text-amber-600' : 'text-green-600';
  const barColor = pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-amber-400' : 'bg-green-400';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{line.codigo}</span>
            <Badge variant="outline" className={`text-[10px] ${line.ativo !== false ? 'text-green-700 border-green-200' : 'text-gray-400 border-gray-200'}`}>
              {line.ativo !== false ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>
          <h3 className="font-semibold text-gray-900 text-sm leading-snug">{line.descricao}</h3>
          {(line.natureza_nome || line.natureza_codigo) && (
            <p className="text-xs text-gray-400 mt-0.5">{line.natureza_nome || line.natureza_codigo}</p>
          )}
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => onEdit(line)}>
          <Pencil className="w-3.5 h-3.5 text-gray-400" />
        </Button>
      </div>

      {/* Valores */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <DollarSign className="w-3 h-3 text-gray-400" />
            <span className="text-[10px] text-gray-500 font-medium">Previsto</span>
          </div>
          <p className="text-sm font-bold text-gray-800">{fmt(valorPrevisto)}</p>
        </div>
        <div className="text-center p-2 bg-amber-50 rounded-lg">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingDown className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] text-amber-600 font-medium">Utilizado</span>
          </div>
          <p className="text-sm font-bold text-amber-700">{fmt(valorUtilizado)}</p>
          {valorPago > 0 && valorPago !== valorUtilizado && (
            <p className="text-[9px] text-gray-400 mt-0.5">pago: {fmt(valorPago)}</p>
          )}
        </div>
        <div className={`text-center p-2 rounded-lg ${saldo < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className={`w-3 h-3 ${saldo < 0 ? 'text-red-500' : 'text-green-500'}`} />
            <span className={`text-[10px] font-medium ${saldo < 0 ? 'text-red-600' : 'text-green-600'}`}>Saldo</span>
          </div>
          <p className={`text-sm font-bold ${saldoColor}`}>{fmt(saldo)}</p>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>{pct.toFixed(1)}% utilizado</span>
          <span>{line.numero_parcelas || 1} parcela(s) · {line.unidade || 'un'}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Metas vinculadas */}
      {metasVinculadas.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
          <Target className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
          {metasVinculadas.map(meta => (
            <span key={meta} className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 rounded px-1.5 py-0.5">
              {meta}
            </span>
          ))}
        </div>
      )}

      {purchasesForLine.length > 0 && (
        <p className="text-[10px] text-gray-400 mt-2">{purchasesForLine.length} solicitação(ões) vinculada(s)</p>
      )}
    </div>
  );
}

export default function RubricaManager({ budgetLines, purchases = [] }) {
  const [addingNew, setAddingNew] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries(['budget-lines']);
    setAddingNew(false);
  };

  // Totais gerais
  const totalPrevisto = budgetLines.reduce((s, l) => s + (l.saldo_inicial || l.valor_total_previsto || 0), 0);
  const totalUtilizado = budgetLines.reduce((s, l) => {
    return s + purchases
      .filter(p => p.budgetline_id === l.id && ['APROVADO_ADMIN', 'PAGO'].includes(p.status))
      .reduce((ss, p) => ss + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
  }, 0);
  const totalSaldo = totalPrevisto - totalUtilizado;

  return (
    <div className="space-y-6">
      {/* Cards de totais */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500 font-medium">Total Previsto</span>
          </div>
          <p className="break-words text-lg font-bold leading-tight text-gray-800 tabular-nums">{fmt(totalPrevisto)}</p>
        </div>
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-amber-600 font-medium">Total Utilizado</span>
          </div>
          <p className="break-words text-lg font-bold leading-tight text-amber-700 tabular-nums">{fmt(totalUtilizado)}</p>
        </div>
        <div className={`p-4 rounded-xl border ${totalSaldo < 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className={`w-4 h-4 ${totalSaldo < 0 ? 'text-red-600' : 'text-green-600'}`} />
            <span className={`text-xs font-medium ${totalSaldo < 0 ? 'text-red-600' : 'text-green-600'}`}>Saldo Disponível</span>
          </div>
          <p className={`break-words text-lg font-bold leading-tight tabular-nums ${totalSaldo < 0 ? 'text-red-700' : 'text-green-700'}`}>{fmt(totalSaldo)}</p>
        </div>
      </div>

      {/* Header + botões */}
       <div className="flex items-center justify-between gap-3 flex-wrap">
         <h3 className="text-sm font-semibold text-gray-800">
           {budgetLines.length} Rubrica(s) Orçamentária(s)
         </h3>
         <div className="flex gap-2">
           <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setShowImportDialog(true)}>
             <Download className="w-3.5 h-3.5" />Importar Atualizadas
           </Button>
           <Button size="sm" className="bg-black text-white h-8 gap-1" onClick={() => setAddingNew(true)}>
             <Plus className="w-3.5 h-3.5" />Nova Rubrica
           </Button>
         </div>
       </div>

      {addingNew && (
        <AddRubricaForm onSaved={refresh} onCancel={() => setAddingNew(false)} />
      )}

      {/* Cards de rubricas */}
      {budgetLines.length === 0 && !addingNew ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
          <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Nenhuma rubrica cadastrada.</p>
          <Button className="mt-4 bg-black text-white" onClick={() => setAddingNew(true)}>
            <Plus className="w-4 h-4 mr-2" />Nova Rubrica
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {budgetLines.map(line => (
            <RubricaCard
              key={line.id}
              line={line}
              purchases={purchases}
              onEdit={(l) => { setSelectedRubrica(l); setEditDialogOpen(true); }}
            />
          ))}
        </div>
      )}

      <EditRubricaDialog
        rubrica={selectedRubrica}
        isOpen={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); setSelectedRubrica(null); }}
        onSuccess={() => {
          queryClient.invalidateQueries(['budget-lines']);
          setEditDialogOpen(false);
          setSelectedRubrica(null);
        }}
      />

      <ImportarRubricasAtualizadas
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onSuccess={() => {
          setShowImportDialog(false);
          queryClient.invalidateQueries(['budget-lines']);
        }}
      />
    </div>
  );
}
