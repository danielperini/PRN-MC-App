import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Building2, ArrowRight, CheckCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-black text-base">Museus Centro</span>
          </div>
          <Link to={createPageUrl('Dashboard')}>
            <Button className="bg-black hover:bg-gray-800 text-white gap-2 text-sm">
              Acessar sistema <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-2xl">
          <div className="inline-block bg-gray-100 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full mb-6 tracking-wide uppercase">
            Relatório Mensal Individual · 2026
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold text-black tracking-tight leading-tight mb-5">
            Museu Centro
          </h1>
          <p className="text-gray-500 text-lg leading-relaxed mb-10">
            Plataforma centralizada para registro, acompanhamento e aprovação de relatórios.
          </p>
          <Link to={createPageUrl('Dashboard')}>
            <Button size="lg" className="bg-black hover:bg-gray-800 text-white gap-2 px-8">
              Acessar meu painel <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>



        {/* Status badge */}
        <div className="mt-14 flex items-center gap-2 text-sm text-gray-400">
          <CheckCircle className="w-4 h-4 text-green-500" />
          Sistema ativo · Versão 1.0 · 2026
        </div>
      </main>
    </div>
  );
}