import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, AlertTriangle, Loader2 } from 'lucide-react';

export default function DuplicateReportsModal({ open, onClose }) {
  const { data: allReports = [], isLoading } = useQuery({
    queryKey: ['all-reports-duplicates'],
    queryFn: () => base44.entities.Report.list('-created_date', 500),
    enabled: open,
  });

  const duplicates = React.useMemo(() => {
    const groups = {};
    allReports.forEach(r => {
      const key = `${r.created_by}__${r.mes_referencia}__${r.ano}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.values(groups).filter(g => g.length > 1);
  }, [allReports]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-orange-500" />
            Relatórios Duplicados
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Analisando relatórios...
          </div>
        ) : duplicates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Copy className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">Nenhum duplicado encontrado</p>
            <p className="text-sm mt-1 text-gray-400">Todos os relatórios parecem únicos por autor e período.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {duplicates.length} grupo{duplicates.length > 1 ? 's' : ''} com relatórios duplicados encontrado{duplicates.length > 1 ? 's' : ''}.
            </p>
            {duplicates.map((group, idx) => (
              <div key={idx} className="border border-orange-200 rounded-xl overflow-hidden">
                <div className="bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-800">
                  {group[0].author_name || group[0].created_by} — {group[0].mes_referencia} {group[0].ano} ({group.length} relatórios)
                </div>
                <div className="divide-y divide-gray-100">
                  {group.map(r => (
                    <div key={r.id} className="px-4 py-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-mono text-xs text-gray-400 mr-2">{r.id.slice(0, 8)}…</span>
                        <Badge className={
                          r.status === 'APPROVED' ? 'bg-black text-white' :
                          r.status === 'SUBMITTED' || r.status === 'IN_REVIEW' ? 'bg-gray-800 text-white' :
                          'bg-gray-100 text-gray-700'
                        }>
                          {r.status}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-400">
                        {r.created_date ? new Date(r.created_date).toLocaleDateString('pt-BR') : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}