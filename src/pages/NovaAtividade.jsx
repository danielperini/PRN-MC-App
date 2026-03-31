import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function NovaAtividade() {
  const [form, setForm] = useState({
    titulo: '',
    descricao: ''
  });

  const handleSubmit = async () => {
    try {
      // ❌ NÃO usa createActivityWithAutoReport
      await base44.entities.Activity.create(form);

      toast.success('Atividade criada');

      toast.message(
        'Relatório automático indisponível neste plano.',
        { duration: 4000 }
      );

      setForm({ titulo: '', descricao: '' });

    } catch (e) {
      toast.error('Erro ao criar atividade');
    }
  };

  return (
    <div className="p-6 max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Nova Atividade</h1>

      <input
        placeholder="Título"
        value={form.titulo}
        onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        className="w-full border p-2 rounded"
      />

      <textarea
        placeholder="Descrição"
        value={form.descricao}
        onChange={(e) => setForm({ ...form, descricao: e.target.value })}
        className="w-full border p-2 rounded"
      />

      <Button onClick={handleSubmit}>
        Criar atividade
      </Button>
    </div>
  );
}
