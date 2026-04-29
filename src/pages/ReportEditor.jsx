import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function ReportEditor({ reportId }) {

  const [report, setReport] = useState(null);
  const [atividade, setAtividade] = useState({
    nome: '',
    descricao: '',
    publico: '',
  });

  /* ================= LOAD ================= */

  useEffect(() => {
    async function load() {
      const r = await base44.entities.Report.get(reportId);
      setReport(r);
    }
    load();
  }, [reportId]);

  /* ================= FIX PRINCIPAL ================= */

  async function salvarAtividade() {
    if (!atividade.nome) return;

    const listaAtual = report?.atividades || [];

    // 🔥 FIX: NÃO sobrescrever — adicionar
    const novaLista = [
      ...listaAtual,
      {
        ...atividade,
        id: Date.now(),
      }
    ];

    const atualizado = await base44.entities.Report.update(reportId, {
      atividades: novaLista
    });

    setReport(atualizado);

    setAtividade({
      nome: '',
      descricao: '',
      publico: '',
    });
  }

  /* ================= UI ================= */

  return (
    <div className="p-4 space-y-4">

      <h2 className="text-xl font-bold">Atividades</h2>

      {/* LISTA */}
      <div className="space-y-2">
        {(report?.atividades || []).map((a) => (
          <div key={a.id} className="border p-2 rounded">
            <div className="font-semibold">{a.nome}</div>
            <div className="text-sm">{a.descricao}</div>
            <div className="text-xs text-gray-500">Público: {a.publico}</div>
          </div>
        ))}
      </div>

      {/* FORM */}
      <div className="border p-3 rounded space-y-2">
        <Input
          placeholder="Nome da atividade"
          value={atividade.nome}
          onChange={(e) => setAtividade({ ...atividade, nome: e.target.value })}
        />

        <Textarea
          placeholder="Descrição"
          value={atividade.descricao}
          onChange={(e) => setAtividade({ ...atividade, descricao: e.target.value })}
        />

        <Input
          placeholder="Público"
          value={atividade.publico}
          onChange={(e) => setAtividade({ ...atividade, publico: e.target.value })}
        />

        <Button onClick={salvarAtividade}>
          Adicionar atividade
        </Button>
      </div>

    </div>
  );
}
