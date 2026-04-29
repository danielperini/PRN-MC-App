import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function AtividadesSection({ report, setReport }) {

  const [nova, setNova] = useState({
    nome: '',
    descricao: '',
    publico: '',
  });

  function adicionarAtividade() {
    if (!nova.nome) return;

    const listaAtual = report?.atividades || [];

    // 🔥 FIX: SEMPRE PRESERVAR EXISTENTES
    const novaLista = [
      ...listaAtual,
      {
        ...nova,
        id: Date.now(),
      }
    ];

    setReport({
      ...report,
      atividades: novaLista,
    });

    setNova({
      nome: '',
      descricao: '',
      publico: '',
    });
  }

  function removerAtividade(id) {
    const listaAtual = report?.atividades || [];

    const novaLista = listaAtual.filter(a => a.id !== id);

    setReport({
      ...report,
      atividades: novaLista,
    });
  }

  return (
    <div className="space-y-4">

      {/* LISTA */}
      <div className="space-y-2">
        {(report?.atividades || []).map((a) => (
          <div key={a.id} className="border p-3 rounded">

            <div className="font-semibold">{a.nome}</div>

            <div className="text-sm">{a.descricao}</div>

            <div className="text-xs text-gray-500">
              Público: {a.publico}
            </div>

            <div className="flex justify-end mt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => removerAtividade(a.id)}
              >
                Remover
              </Button>
            </div>

          </div>
        ))}
      </div>

      {/* FORM */}
      <div className="border p-3 rounded space-y-2">

        <Input
          placeholder="Nome da atividade"
          value={nova.nome}
          onChange={(e) => setNova({ ...nova, nome: e.target.value })}
        />

        <Textarea
          placeholder="Descrição"
          value={nova.descricao}
          onChange={(e) => setNova({ ...nova, descricao: e.target.value })}
        />

        <Input
          placeholder="Público"
          value={nova.publico}
          onChange={(e) => setNova({ ...nova, publico: e.target.value })}
        />

        <Button onClick={adicionarAtividade}>
          Adicionar atividade
        </Button>

      </div>

    </div>
  );
}
