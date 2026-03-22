import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Sparkles,
  Link2,
  Undo2,
  ExternalLink,
  FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';

function ChecklistItem({ ok, label, href }) {
  return (
    <div className={`flex justify-between text-xs ${ok ? 'text-green-700' : 'text-red-700'}`}>
      <span>{label}</span>
      {ok ? 'OK' : 'Pendente'}
    </div>
  );
}

export default function AprovacoesFila({
  purchases,
  budgetLines,
  onRefresh,
  currentUser,
}) {

  const [loading, setLoading] = useState({});
  const [comentarios, setComentarios] = useState({});
  const [teamPayments, setTeamPayments] = useState({});

  const isCoordenador = ['ADMIN','admin','COORDENADOR'].includes(currentUser?.role);

  const pendentes = purchases.filter(p => p.status === 'SOLICITADO');

  const getBudgetLine = (p) =>
    budgetLines.find(b =>
      b.id === p.budgetline_id ||
      b.id === p.budget_line_id
    );

  const isTeam = (p) =>
    p.origem === 'TEAM_PAYMENT' || !!p.team_payment_id;

  useEffect(() => {
    const load = async () => {
      const map = {};
      for (const p of purchases) {
        if (p.team_payment_id) {
          try {
            map[p.id] = await base44.entities.TeamPayment.get(p.team_payment_id);
          } catch {}
        }
      }
      setTeamPayments(map);
    };
    load();
  }, [purchases]);

  const handleApprove = async (purchase) => {

    const tp = teamPayments[purchase.id];

    if (isTeam(purchase) && tp && tp.nf_valida === false) {
      toast.error('NF inválida. Não pode aprovar.');
      return;
    }

    setLoading(l => ({...l,[purchase.id]:true}));

    try {
      await base44.functions.invoke('purchaseActions', {
        purchaseId: purchase.id,
        action: 'aprovar'
      });

      toast.success('Aprovado');
      onRefresh?.();

    } catch(e){
      toast.error(e.message);
    }

    setLoading(l => ({...l,[purchase.id]:false}));
  };

  return (
    <div className="space-y-4">

      {pendentes.map(p => {

        const tp = teamPayments[p.id];
        const budgetLine = getBudgetLine(p);

        return (
          <div key={p.id} className="border p-4 rounded-xl space-y-3">

            <div className="flex justify-between">

              <div>

                <div className="flex gap-2">

                  {isTeam(p) && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                      👤 Equipe
                    </span>
                  )}

                </div>

                <p className="font-semibold">{p.descricao_item}</p>

                {isTeam(p) && tp && (
                  <p className="text-xs text-purple-700">
                    Parcela {tp.numero_parcela} • {tp.mes_referencia}/{tp.ano}
                  </p>
                )}

              </div>

              <p className="font-bold">
                R$ {Number(p.valor_solicitado || 0).toFixed(2)}
              </p>

            </div>

            <Textarea
              placeholder="Comentário"
              value={comentarios[p.id] || ''}
              onChange={e => setComentarios({...comentarios,[p.id]:e.target.value})}
            />

            <div className="flex gap-2">

              <Button
                onClick={()=>handleApprove(p)}
                disabled={loading[p.id]}
              >
                {loading[p.id] ? <Loader2 className="animate-spin w-4 h-4"/> : <CheckCircle className="w-4 h-4 mr-1"/>}
                Aprovar
              </Button>

              <Button variant="outline">
                <XCircle className="w-4 h-4 mr-1"/>
                Recusar
              </Button>

            </div>

          </div>
        );
      })}

    </div>
  );
}
