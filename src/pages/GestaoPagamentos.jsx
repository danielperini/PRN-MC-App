import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CreditCard, Upload, CheckCircle2, Loader2, ExternalLink,
  Search, SlidersHorizontal, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { toastMessages } from '@/lib/toastMessages';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import RequireAuth from '@/components/auth/RequireAuth';

const META_LABELS = {
  'MC3A-20': 'Ações Educativas',
  'MC3A-21': 'Exposição MUMO',
  'MC3A-22': 'Consultorias',
  'MC3A-EXTRA': 'Meta Extra',
};

function PagamentoItemRow({ purchase, budgetLines, selected, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const budgetLine = budgetLines.find(l => l.id === purchase.budgetline_id);
  const valorFinal = purchase.valor_aprovado_admin || purchase.valor_solicitado || 0;

  return (
    <div className={`border rounded-xl transition-colors ${selected ? 'border-black bg-gray-50' : 'border-gray-100 hover:border-gray-200'}`}>
      <div className="p-4 flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-2 mb-1">
                <Badge className="bg-green-100 text-green-800 text-xs font-medium">APROVADO ADMIN</Badge>
                {purchase.meta_id && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{META_LABELS[purchase.meta_id]}</span>
                )}
                {purchase.centro_custo && (
                  <span className="text-xs border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">{purchase.centro_custo}</span>
                )}
              </div>
              <p className="font-medium text-black text-sm">{purchase.descricao_item}</p>
              <div className="flex flex-wrap gap-3 mt-1">
                {purchase.fornecedor_nome && <span className="text-xs text-gray-500">{purchase.fornecedor_nome}</span>}
                {budgetLine && <span className="text-xs text-gray-400">[{budgetLine.codigo}]</span>}
                {purchase.meio_pagamento && <span className="text-xs text-gray-400">{purchase.meio_pagamento}</span>}
              </div>
              {purchase.aprov_admin_data && (
                <p className="text-xs text-gray-400 mt-1">Aprovado em {purchase.aprov_admin_data} por {purchase.aprov_admin_nome}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-right">
                <p className="font-bold text-black">R$ {valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                {purchase.comprovante_url && (
                  <a href={purchase.comprovante_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end mt-1">
                    <ExternalLink className="w-3 h-3" />NF/Comprovante
                  </a>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          {expanded && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-3 border-t border-gray-100">
              {purchase.categoria && <div><span className="text-gray-400">Categoria</span><p className="font-medium text-gray-700">{purchase.categoria}</p></div>}
              {purchase.qtd && <div><span className="text-gray-400">Qtd</span><p className="font-medium text-gray-700">{purchase.qtd} {purchase.unidade}</p></div>}
              {purchase.detalhe_pagamento && <div><span className="text-gray-400">Dados pgto</span><p className="font-medium text-gray-700 truncate">{purchase.detalhe_pagamento}</p></div>}
              {budgetLine && <div><span className="text-gray-400">Rubrica</span><p className="font-medium text-gray-700">{budgetLine.descricao?.substring(0, 40)}</p></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PagamentoLoteDialog({ open, onClose, selectedPurchases, onSuccess }) {
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0]);
  const [comprovanteFile, setComprovanteFile] = useState(null);
  const [comprovanteUrl, setComprovanteUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalValor = selectedPurchases.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    const res = await base44.integrations.Core.UploadFile({ file });
    setComprovanteUrl(res.file_url);
    setUploading(false);
    toastMessages.fileUploadSuccess();
  };

  const handleConfirm = async () => {
    if (!comprovanteUrl) {
      toastMessages.warning('Anexe o comprovante ou NF antes de confirmar.');
      return;
    }
    setSaving(true);
    let erros = 0;
    for (const p of selectedPurchases) {
      try {
        await base44.functions.invoke('purchaseActions', {
          action: 'marcar_pago',
          purchaseId: p.id,
          comprovante_url: comprovanteUrl,
          data_pagamento: dataPagamento,
        });
      } catch {
        erros++;
      }
    }
    setSaving(false);
    if (erros === 0) {
      toastMessages.paymentSuccess(`${selectedPurchases.length} solicitação(ões) marcada(s) como pago.`);
      onSuccess();
      onClose();
    } else {
      toastMessages.error(`${erros} erro(s) ao processar. Verifique e tente novamente.`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Confirmar Pagamento em Lote
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Resumo */}
          <div className="bg-green-50 border border-green-100 rounded-xl p-4">
            <p className="text-sm font-semibold text-green-800 mb-2">{selectedPurchases.length} solicitação(ões) selecionada(s)</p>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {selectedPurchases.map(p => (
                <div key={p.id} className="flex justify-between text-xs text-green-700">
                  <span className="truncate flex-1 mr-2">{p.descricao_item}</span>
                  <span className="font-medium flex-shrink-0">R$ {(p.valor_aprovado_admin || p.valor_solicitado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-green-200 mt-2 pt-2 flex justify-between text-sm font-bold text-green-800">
              <span>Total</span>
              <span>R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Data de pagamento */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">Data de Pagamento</label>
            <Input
              type="date"
              value={dataPagamento}
              onChange={e => setDataPagamento(e.target.value)}
            />
          </div>

          {/* Upload comprovante */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1.5 block">
              Comprovante / NF <span className="text-red-500">*</span>
            </label>
            {comprovanteUrl ? (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <a href={comprovanteUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-green-700 hover:underline truncate flex-1">
                  Arquivo enviado — clique para visualizar
                </a>
                <Button variant="ghost" size="sm" className="text-xs text-gray-500" onClick={() => { setComprovanteUrl(''); setComprovanteFile(null); }}>
                  Trocar
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors">
                {uploading ? (
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                ) : (
                  <Upload className="w-6 h-6 text-gray-400" />
                )}
                <span className="text-sm text-gray-500">{uploading ? 'Enviando...' : 'Clique para anexar comprovante ou NF'}</span>
                <span className="text-xs text-gray-400">PDF, imagem ou qualquer formato</span>
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={e => { setComprovanteFile(e.target.files[0]); handleUpload(e.target.files[0]); }}
                />
              </label>
            )}
            {!comprovanteUrl && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />Obrigatório para confirmar o pagamento
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            className="bg-black hover:bg-gray-800 text-white"
            onClick={handleConfirm}
            disabled={!comprovanteUrl || saving || uploading}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Confirmar Pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GestaoPagamentosInner() {
   const queryClient = useQueryClient();
   const [search, setSearch] = useState('');
   const [selected, setSelected] = useState([]);
   const [dialogOpen, setDialogOpen] = useState(false);
   const [currentUser, setCurrentUser] = useState(null);

   useEffect(() => {
     base44.auth.me().then((u) => setCurrentUser(u)).catch(() => setCurrentUser(null));
   }, []);

   const isCoordenador = ['admin', 'ADMIN', 'COORDENADOR', 'COORD_COMUNICACAO', 'COORD_ADMINISTRATIVA', 'COORD_PRODUCAO'].includes(currentUser?.role);

   const { data: purchases = [], isLoading } = useQuery({
     queryKey: ['purchases_aprovados_admin', currentUser?.email, isCoordenador],
     queryFn: async () => {
       const allPurchases = await base44.entities.PurchaseRequest.filter({ status: 'APROVADO_ADMIN' }, '-created_date', 500);
       if (isCoordenador) return allPurchases;
       const userEmail = currentUser?.email?.toLowerCase();
       return allPurchases.filter(p => {
         const isTeamPayment = p?.team_payment_id || String(p?.tipo_origem || '').toLowerCase().includes('equipe');
         const ownerEmails = [p?.created_by, p?.user_email, p?.requester_email].map(e => String(e || '').toLowerCase()).filter(Boolean);
         return !isTeamPayment && (ownerEmails.includes(userEmail) || p?.created_by?.toLowerCase() === userEmail);
       });
     },
     enabled: !!currentUser
   });

  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budget_lines_pgto'],
    queryFn: () => base44.entities.BudgetLine.list(),
  });

  const filtered = purchases.filter(p =>
    !search ||
    p.descricao_item?.toLowerCase().includes(search.toLowerCase()) ||
    p.fornecedor_nome?.toLowerCase().includes(search.toLowerCase()) ||
    p.centro_custo?.toLowerCase().includes(search.toLowerCase())
  );

  const allIds = filtered.map(p => p.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.includes(id));

  const toggleAll = () => {
    setSelected(allSelected ? [] : allIds);
  };

  const toggleOne = (id) => {
    setSelected(sel => sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id]);
  };

  const selectedPurchases = purchases.filter(p => selected.includes(p.id));
  const totalSelecionado = selectedPurchases.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);
  const totalGeral = filtered.reduce((sum, p) => sum + (p.valor_aprovado_admin || p.valor_solicitado || 0), 0);

  return (
    <div className="max-w-5xl mx-auto py-4 md:py-6 px-4 md:px-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Gestão de Pagamentos</h1>
            <p className="text-sm text-gray-500">Solicitações aprovadas aguardando pagamento</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4">
          <p className="text-xs text-green-700 font-medium uppercase tracking-wide">Aguardando Pagamento</p>
          <p className="text-2xl font-bold text-green-800 mt-1">{filtered.length}</p>
          <p className="text-xs text-green-600 mt-0.5">R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs text-blue-700 font-medium uppercase tracking-wide">Selecionados</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{selected.length}</p>
          <p className="text-xs text-blue-600 mt-0.5">R$ {totalSelecionado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="col-span-2 md:col-span-1 bg-black rounded-xl p-4 flex items-center justify-center">
          <Button
            className="w-full bg-white text-black hover:bg-gray-100 font-semibold"
            disabled={selected.length === 0}
            onClick={() => setDialogOpen(true)}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Marcar {selected.length > 0 ? `${selected.length} ` : ''}como PAGO
          </Button>
        </div>
      </div>

      {/* Filtros e seleção */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por item, fornecedor ou centro de custo..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} id="select-all" />
          <label htmlFor="select-all" className="text-sm text-gray-600 cursor-pointer whitespace-nowrap">
            Selecionar todos ({filtered.length})
          </label>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-100 rounded-2xl">
          <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Nenhuma solicitação aguardando pagamento</p>
          <p className="text-sm text-gray-300 mt-1">Todas as aprovadas já foram pagas ou não há aprovações administrativas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <PagamentoItemRow
              key={p.id}
              purchase={p}
              budgetLines={budgetLines}
              selected={selected.includes(p.id)}
              onToggle={() => toggleOne(p.id)}
            />
          ))}
        </div>
      )}

      {/* Dialog de confirmação */}
      <PagamentoLoteDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        selectedPurchases={selectedPurchases}
        onSuccess={() => {
          setSelected([]);
          queryClient.invalidateQueries({ queryKey: ['purchases_aprovados_admin'] });
        }}
      />
    </div>
  );
}

export default function GestaoPagamentos() {
  return (
    <RequireAuth>
      <GestaoPagamentosInner />
    </RequireAuth>
  );
}