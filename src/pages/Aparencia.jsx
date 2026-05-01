import React from 'react';
import { Palette, Shield, ShieldCheck } from 'lucide-react';
import ThemeSelector from '@/components/theme/ThemeSelector';
import RemoverDuplicadosPanel from '@/components/admin/RemoverDuplicadosPanel';
import IntegridadePanel from '@/components/admin/IntegridadePanel.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Aparencia() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Palette className="w-6 h-6" style={{ color: 'var(--cor-primaria)' }} />
          Aparência e Manutenção
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Personalize o visual do sistema e gerencie a integridade dos dados.
        </p>
      </div>

      {/* Card de tema */}
      <Card className="border border-gray-200">
        <CardContent className="p-6">
          <ThemeSelector />
        </CardContent>
      </Card>

      {/* Card de verificação de integridade */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-800">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            Verificar Integridade do Sistema — Versão 1.0 Estável
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Verifica banco de dados, usuários, relatórios, compras, rubricas, arquivos, duplicatas e logs.
          </p>
        </CardHeader>
        <CardContent className="pt-0 px-6 pb-6">
          <IntegridadePanel />
        </CardContent>
      </Card>

      {/* Card de duplicados */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2 text-gray-800">
            <Shield className="w-4 h-4 text-red-500" />
            Ferramenta Administrativa — Relatórios Duplicados
          </CardTitle>
          <p className="text-xs text-gray-500 mt-1">
            Apenas administradores e coordenadores devem usar esta função. Faz backup automático antes de remover.
          </p>
        </CardHeader>
        <CardContent className="pt-0 px-6 pb-6">
          <RemoverDuplicadosPanel />
        </CardContent>
      </Card>
    </div>
  );
}