import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function UserManagement() {
  const [users, setUsers] = useState([]);

  async function loadUsers() {
    const res = await base44.entities.User.list();
    setUsers(Array.isArray(res) ? res : (res?.data || []));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  // ✅ APROVAR USUÁRIO SEM EMAIL AUTOMÁTICO
  async function approveUser(user) {
    try {
      await base44.entities.User.update(user.id, { status: 'active' });

      toast.success('Usuário aprovado');

      toast.message(
        'Envio automático de email indisponível. Informe manualmente o usuário.',
        { duration: 5000 }
      );

    } catch (e) {
      toast.error('Erro ao aprovar usuário');
    }
  }

  // ✅ CRIAR USUÁRIO SEM createUserWithPassword
  async function createUser(data) {
    try {
      await base44.entities.User.create({
        ...data,
        status: 'active'
      });

      toast.success('Usuário criado');

      toast.message(
        'Senha não definida automaticamente. Oriente o usuário a redefinir.',
        { duration: 5000 }
      );

      loadUsers();

    } catch (e) {
      toast.error('Erro ao criar usuário');
    }
  }

  // ✅ TROCAR SENHA (fallback)
  async function changePassword(userId) {
    toast.message(
      'Alteração de senha indisponível neste plano. Use fluxo de redefinição.',
      { duration: 5000 }
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Usuários</h1>

      {users.map(u => (
        <div key={u.id} className="flex justify-between items-center border p-3 rounded">
          <div>
            <p className="font-medium">{u.email}</p>
            <p className="text-xs text-gray-500">{u.status}</p>
          </div>

          <div className="flex gap-2">
            {u.status !== 'active' && (
              <Button onClick={() => approveUser(u)}>Aprovar</Button>
            )}

            <Button variant="outline" onClick={() => changePassword(u.id)}>
              Alterar senha
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}