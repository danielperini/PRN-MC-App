import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Perfil() {
  const [password, setPassword] = useState('');

  const handleChangePassword = async () => {
    toast.message(
      'Alteração de senha indisponível neste plano. Use recuperação de senha.',
      { duration: 5000 }
    );
  };

  return (
    <div className="p-6 max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Meu Perfil</h1>

      <input
        type="password"
        placeholder="Nova senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full border p-2 rounded"
      />

      <Button onClick={handleChangePassword}>
        Alterar senha
      </Button>
    </div>
  );
}
