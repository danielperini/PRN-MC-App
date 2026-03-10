import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Check, X, AlertTriangle, TrendingDown, DollarSign, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

const fmt = (v) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const EMPTY_LINE = {
  codigo: '', natureza_codigo: '', natureza_nome: '',
  descricao: '', unidade: 'un', qtd: 1, periodo_meses: 1,
  valor_unit_medio: 0, valor_total_previsto: 0, saldo_inicial: 0,
  saldo_comprometido: 0, ativo: true,
};

function RubricaRow({ line, onSaved, onCancel, isNew = false }) {
  const [form, setForm] = useState({ ...line });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saldo_disponivel = (form.saldo_inicial || 0) - (form.saldo_comprometido || 0);

  const handleSave = async () => {
    if (!form.codigo || !form.descricao) {
      toast.error('Código e descrição são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await base44.entities.BudgetLine.create({
          ...form,
          saldo_inicial: parseFloat(form.saldo_inicial) || 0,
          saldo_comprometido: parseFloat(form.saldo_comprometido) || 0,
          valor_total_previsto: parseFloat(form.valor_total_previsto) || 0,
          valor_unit_medio: parseFloat(form.valor_unit_medio) || 0,
          qtd: parseFloat(form.qtd) || 1,
          periodo_meses: parseFloat(form.periodo_meses) || 1,
        });
        toast.success('Rubrica criada!');
      } else {
        await base44.entities.BudgetLine.update(line.id, {
          ...form,
          saldo_inicial: parseFloat(form.saldo_inicial) || 0,
          saldo_comprometido: parseFloat(form.saldo_comprometido) || 0,
          valor_total_previsto: parseFloat(form.valor_total_previsto) || 0,
        });
        toast.success('Rubrica atualizada!');
      }
      onSaved();
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    }
    setSaving(false);
  };

  return (
    <tr className="border-b border-blue-50 bg-blue-50/30">
      <td className="py-2 px-2">
        <Input value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="3A-001" className="h-7 text-xs w-24" />
      </td>
      <td className="py-2 px-2">
        <Input value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Descrição da rubrica" className="h-7 text-xs w-full min-w-40" />
      </td>
      <td className="py-2 px-2">
        <Input value={form.natureza_nome} onChange={e => set('natureza_nome', e.target.value)} placeholder="Natureza" className="h-7 text-xs w-32" />
      </td>
      <td className="py-2 px-2">
        <Input type="number" step="0.01" value={form.saldo_inicial} onChange={e => set('saldo_inicial', e.target.value)} className="h-7 text-xs w-28" />
      </td>
      <td className="py-2 px-2">
        <Input type="number" step="0.01" value={form.saldo_comprometido} onChange={e => set('saldo_comprometido', e.target.value)} className="h-7 text-xs w-28" />
      </td>
      <td className={`py-2 px-2 text-xs font-semibold ${saldo_disponivel < 0 ? 'text-red-600' : 'text-green-700'}`}>
        {fmt(saldo_disponivel)}
      </td>
      <td className="py-2 px-2">
        <div className="flex gap-1">
          <Button size="icon" className="h-7 w-7 bg-black text-white" onClick={handleSave} disabled={saving}>
            <Check className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-7 w-7" onClick={onCancel}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default function RubricaManager({ budgetLines, purchases = [] }) {
  const [editingId, setEditingId] = useState(null);
  const [addingNew, setAddingNew] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedRubrica, setSelectedRubrica] = useState(null);
  const queryClient = useQueryClient();

  const refresh = () => {
    queryClient.invalidateQueries(['budget-lines']);
    setEditingId(null);
    setAddingNew(false);
  };

  const totalInicial = budgetLines.reduce((s, l) => s + (l.saldo_inicial || 0), 0);
  const totalComprometido = budgetLines.reduce((s, l) => s + (l.saldo_comprometido || 0), 0);
  const totalDisponivel = totalInicial - totalComprometido;

  // Calculate pago from purchases (consumo real)
  const totalPago = purchases.filter(p => p.status === 'PAGO').reduce((s, p) => s + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
  
  // Calculate aprovado (comprometido + aguardando pagamento)
  const totalAprovado = purchases
    .filter(p => ['APROVADO_ADMIN', 'PAGO'].includes(p.status))
    .reduce((s, p) => s + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);

  // Saldo original (inicial sem comprometimento)
  const totalSaldoOriginal = totalInicial;
  
  // Saldo disponível real (inicial - aprovado)
  const totalSaldoDisponivel = totalInicial - totalAprovado;

  return (
    <div className="space-y-6">
      {/* Saldo Geral */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Saldo Total', value: fmt(totalInicial), icon: DollarSign, color: 'text-gray-800', bg: 'bg-gray-50' },
          { label: 'Comprometido', value: fmt(totalComprometido), icon: TrendingDown, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Pago', value: fmt(totalPago), icon: Check, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Disponível', value: fmt(totalDisponivel), icon: TrendingUp, color: totalDisponivel < 0 ? 'text-red-700' : 'text-green-700', bg: totalDisponivel < 0 ? 'bg-red-50' : 'bg-green-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`p-4 rounded-xl border border-gray-200 ${bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-gray-500 font-medium">{label}</span>
            </div>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Barra geral */}
      <div className="p-4 border border-gray-100 rounded-xl bg-white">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Utilização geral do orçamento</span>
          <span>{totalInicial > 0 ? ((totalComprometido / totalInicial) * 100).toFixed(1) : 0}% comprometido</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all"
            style={{ width: `${totalInicial > 0 ? Math.min((totalComprometido / totalInicial) * 100, 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Tabela de rubricas */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">Rubricas Orçamentárias</h3>
          <Button size="sm" className="bg-black text-white h-8 gap-1" onClick={() => { setAddingNew(true); setEditingId(null); }}>
            <Plus className="w-3.5 h-3.5" />Nova Rubrica
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left py-2 px-2 font-medium text-gray-500">Código</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Descrição</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500 hidden md:table-cell">Natureza</th>
                <th className="text-right py-2 px-2 font-medium text-gray-500">Saldo Inicial</th>
                <th className="text-right py-2 px-2 font-medium text-gray-500">Comprometido</th>
                <th className="text-right py-2 px-2 font-medium text-gray-500">Disponível</th>
                <th className="text-center py-2 px-2 font-medium text-gray-500">Status</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {addingNew && (
                <RubricaRow
                  line={EMPTY_LINE}
                  isNew
                  onSaved={refresh}
                  onCancel={() => setAddingNew(false)}
                />
              )}
              {budgetLines.map(line => {
                const saldo_disponivel = (line.saldo_inicial || 0) - (line.saldo_comprometido || 0);
                const pct = line.saldo_inicial > 0 ? ((line.saldo_comprometido || 0) / line.saldo_inicial) * 100 : 0;

                if (editingId === line.id) {
                  return (
                    <RubricaRow
                      key={line.id}
                      line={line}
                      onSaved={refresh}
                      onCancel={() => setEditingId(null)}
                    />
                  );
                }

                return (
                  <tr key={line.id} className="border-b border-gray-50 hover:bg-gray-50 group">
                    <td className="py-2.5 px-2 font-mono text-gray-500">{line.codigo}</td>
                    <td className="py-2.5 px-2 text-gray-800 font-medium max-w-xs">
                      <span className="line-clamp-1">{line.descricao}</span>
                    </td>
                    <td className="py-2.5 px-2 text-gray-500 hidden md:table-cell">
                      <span className="line-clamp-1">{line.natureza_nome || line.natureza_codigo || '—'}</span>
                    </td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{fmt(line.saldo_inicial)}</td>
                    <td className="py-2.5 px-2 text-right text-amber-600">{fmt(line.saldo_comprometido)}</td>
                    <td className={`py-2.5 px-2 text-right font-semibold ${saldo_disponivel < 0 ? 'text-red-600' : saldo_disponivel < (line.saldo_inicial * 0.1) ? 'text-amber-600' : 'text-green-600'}`}>
                      {fmt(saldo_disponivel)}
                      {pct > 0 && (
                        <div className="mt-0.5 h-1 bg-gray-100 rounded-full overflow-hidden w-16 ml-auto">
                          <div className={`h-full rounded-full ${pct > 90 ? 'bg-red-400' : pct > 70 ? 'bg-amber-400' : 'bg-green-400'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <Badge variant="outline" className={`text-[10px] ${line.ativo !== false ? 'text-green-700 border-green-200' : 'text-gray-400 border-gray-200'}`}>
                        {line.ativo !== false ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={() => { setEditingId(line.id); setAddingNew(false); }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {budgetLines.length === 0 && !addingNew && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-400 text-xs">
                    Nenhuma rubrica cadastrada. Clique em "Nova Rubrica" para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}