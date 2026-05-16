import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import ReportEditorCore from './ReportEditor';

function shouldOpenEditor() {
  const params = new URLSearchParams(window.location.search);
  const hasId = Boolean(params.get('id') || params.get('reportId'));
  const novo = String(params.get('novo') || params.get('new') || '').toLowerCase();
  const explicitNew = ['1', 'true', 'sim', 'yes'].includes(novo);
  return hasId || explicitNew;
}

export default function ReportEditorGuard() {
  if (shouldOpenEditor()) return <ReportEditorCore />;

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-4 py-10">
      <Card className="w-full rounded-3xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white">
          <FileText className="h-7 w-7" />
        </div>

        <h1 className="text-2xl font-semibold text-black">Editor de relatório</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-gray-500">
          Para evitar rascunhos em branco, o sistema não cria relatórios automaticamente ao abrir esta página. Abra um relatório existente pela lista ou clique em “Novo Relatório”.
        </p>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/Relatorios">
            <Button variant="outline" className="gap-2 rounded-xl">
              <ArrowLeft className="h-4 w-4" />
              Ver relatórios existentes
            </Button>
          </Link>

          <Link to="/ReportEditor?novo=1">
            <Button className="gap-2 rounded-xl bg-black text-white hover:bg-gray-900">
              <Plus className="h-4 w-4" />
              Novo Relatório
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
