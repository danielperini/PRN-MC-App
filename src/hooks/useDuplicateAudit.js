import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export function useDuplicateAudit() {
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadDuplicates() {
      try {
        setLoading(true);
        
        // Buscar todos os registros e analisar para duplicidade
        const all = await base44.entities.PurchaseRequest.list('-created_date', 1000);
        
        if (!Array.isArray(all)) return;

        const seen = new Map();
        const duplicatesList = [];

        for (const purchase of all) {
          // Ignorar status cancelados
          if (['CANCELADO', 'RECUSADO'].includes(purchase.status)) continue;

          const key = buildSimpleKey(purchase);
          if (!key) continue;

          if (seen.has(key)) {
            duplicatesList.push({
              id: purchase.id,
              status: purchase.status,
              valor: purchase.valor_solicitado,
              nf: purchase.nf_numero,
              fornecedor: purchase.fornecedor_nome,
              created_date: purchase.created_date,
              created_by: purchase.created_by,
              key,
              conflictsWith: seen.get(key).id
            });
          } else {
            seen.set(key, purchase);
          }
        }

        if (mounted) {
          setDuplicates(duplicatesList);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
          setDuplicates([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDuplicates();

    return () => {
      mounted = false;
    };
  }, []);

  return { duplicates, loading, error };
}

function buildSimpleKey(item) {
  const nf = String(item.nf_numero || '').trim().toUpperCase();
  const doc = String(item.nf_emitente_cpf_cnpj || item.fornecedor_cnpj || '').replace(/\D/g, '');
  
  if (nf && doc) return `NF:${doc}:${nf}`;
  return '';
}