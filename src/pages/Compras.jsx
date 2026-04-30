import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(p) {
  return (
    p?.valor_pago ||
    p?.valor_aprovado_admin ||
    p?.valor_aprovado ||
    p?.valor_final ||
    p?.valor_solicitado ||
    p?.valor_total ||
    p?.valor ||
    p?.rubrica_debitada_valor ||
    0
  );
}

export default function Compras() {
  const [purchases, setPurchases] = useState([]);

  async function load() {
    const data = await base44.entities.PurchaseRequest.list('-created_date', 200);
    setPurchases(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  // 🔥 APROVAR COM FALLBACK
  async function handleApprovePurchase(purchase) {
    if (!purchase?.id) return;

    if (!purchase?.rubrica_id) {
      toast.error('Não é possível aprovar sem rubrica.');
      return;
    }

    try {
      try {
        // 🔁 Tenta backend (se existir)
        const response = await base44.functions.invoke('purchaseActions', {
          purchaseId: purchase.id,
          action: 'aprovar'
        });

        const result = response?.data || response;

        if (!result?.success) {
          throw new Error('Backend não disponível');
        }

      } catch (err) {
        // 🔥 FALLBACK FRONTEND
        console.warn('Fallback frontend ativado');

        const rubrica = await base44.entities.Rubrica.get(purchase.rubrica_id);

        if (!rubrica) {
          throw new Error('Rubrica não encontrada');
        }

        const valor = getPurchaseValue(purchase);

        const jaDebitado = !!purchase.rubrica_debitada_em;

        if (!jaDebitado) {
          const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
          const utilizadoAtual = toNumber(rubrica.valor_utilizado);

          const novoUtilizado = utilizadoAtual + valor;
          const saldo = total - novoUtilizado;
          const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

          await base44.entities.Rubrica.update(rubrica.id, {
            valor_utilizado: novoUtilizado,
            saldo,
            saldo_real: saldo,
            percentual_utilizado: percentual
          });

          await base44.entities.PurchaseRequest.update(purchase.id, {
            rubrica_debitada_em: new Date().toISOString(),
            rubrica_debitada_valor: valor,
            financeiro_lancado_em: new Date().toISOString()
          });
        }
      }

      // 🔁 Atualiza status sempre
      await base44.entities.PurchaseRequest.update(purchase.id, {
        status: 'APROVADO_COORD'
      });

      toast.success('Aprovado com sucesso');
      await load();

    } catch (e) {
      toast.error('Erro ao aprovar: ' + (e?.message || e));
    }
  }

  return (
    <div className="p-4 space-y-4">

      <h1 className="text-xl font-bold">Solicitações</h1>

      <div className="space-y-2">
        {purchases.map((p) => (
          <div key={p.id} className="border p-3 rounded flex justify-between items-center">

            <div>
              <p className="font-semibold">{p.descricao_item}</p>
              <p className="text-sm text-gray-500">
                {p.status} — R$ {getPurchaseValue(p).toLocaleString('pt-BR')}
              </p>
            </div>

            <button
              onClick={() => handleApprovePurchase(p)}
              className="bg-green-600 text-white px-3 py-1 rounded"
            >
              Aprovar
            </button>

          </div>
        ))}
      </div>

    </div>
  );
}
