import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Pencil, Trash2, LinkIcon, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';

function ComprasInner() {
  const [purchases, setPurchases] = useState([]);
  const [menuOpenId, setMenuOpenId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const data = await base44.entities.PurchaseRequest.list('-created_date', 200);
    setPurchases(data || []);
  }

  async function handleApprove(p) {
    await base44.functions.invoke('purchaseActions', {
      action: 'aprovar',
      purchaseId: p.id
    });
    await load();
  }

  async function handleReject(p) {
    await base44.functions.invoke('purchaseActions', {
      action: 'reprovar',
      purchaseId: p.id
    });
    await load();
  }

  async function handleReturn(p) {
    await base44.functions.invoke('purchaseActions', {
      action: 'devolver',
      purchaseId: p.id
    });
    await load();
  }

  async function handleDelete(id) {
    if (!confirm('Deletar solicitação?')) return;
    await base44.functions.invoke('purchaseActions', {
      action: 'deletar',
      purchaseId: id
    });
    await base44.entities.PurchaseRequest.delete(id);
    await load();
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Compras</h1>

      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">Descrição</th>
            <th className="p-2">Status</th>
            <th className="p-2">Ações</th>
          </tr>
        </thead>

        <tbody>
          {purchases.map((p) => {
            const pendente = String(p.status || '').toUpperCase() === 'SOLICITADO';
            const open = menuOpenId === p.id;

            return (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.descricao_item}</td>
                <td className="p-2 text-center">{p.status}</td>

                <td className="p-2 relative">
                  <div className="flex justify-center gap-2">

                    {/* LÁPIS */}
                    <button
                      onClick={() => setMenuOpenId(open ? null : p.id)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <Pencil size={16} />
                    </button>

                    {/* LIXEIRA */}
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-1 hover:bg-red-100 text-red-600 rounded"
                    >
                      <Trash2 size={16} />
                    </button>

                    {/* MENU */}
                    {open && (
                      <div className="absolute right-0 top-8 bg-white border shadow-lg rounded w-44 z-50">

                        <a
                          href={`/Compras?solicitacao=${p.id}`}
                          target="_blank"
                          className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50"
                        >
                          <LinkIcon size={14} />
                          Acessar
                        </a>

                        {pendente && (
                          <>
                            <button
                              onClick={() => {
                                setMenuOpenId(null);
                                handleApprove(p);
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-xs text-green-700 hover:bg-green-50 w-full"
                            >
                              <CheckCircle2 size={14} />
                              Aprovar
                            </button>

                            <button
                              onClick={() => {
                                setMenuOpenId(null);
                                handleReturn(p);
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 w-full"
                            >
                              <RotateCcw size={14} />
                              Devolver
                            </button>

                            <button
                              onClick={() => {
                                setMenuOpenId(null);
                                handleReject(p);
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-xs text-red-700 hover:bg-red-50 w-full"
                            >
                              <XCircle size={14} />
                              Reprovar
                            </button>
                          </>
                        )}
                      </div>
                    )}

                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Compras() {
  return <ComprasInner />;
}
