import React from 'react';
import RequireAuth from '../components/auth/RequireAuth';
import UserPermissionsManager from '../components/admin/UserPermissionsManager';

function UserManagementInner() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black tracking-tight">Gestão de Usuários</h1>
          <p className="text-gray-500 mt-1">Gerencie papéis e permissões dos membros da plataforma</p>
        </div>
        <UserPermissionsManager />
      </div>
    </div>
  );
}

export default function UserManagement() {
  return <RequireAuth><UserManagementInner /></RequireAuth>;
}