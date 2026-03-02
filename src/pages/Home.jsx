import React from 'react';
import { FileText, Users, Building2 } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-black rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-black tracking-tight">
                Museus Centro
              </h1>
              <p className="text-sm text-gray-500">
                Relatório Mensal Individual 2026
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-light text-black mb-4">
            Sistema de Relatórios
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Plataforma para gestão de relatórios mensais dos profissionais 
            vinculados aos museus do Centro Cultural.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-8 border border-gray-100 rounded-2xl hover:border-gray-200 transition-colors">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center mb-6">
              <FileText className="w-5 h-5 text-black" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">
              Relatórios Mensais
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Registre atividades, oportunidades e avaliações de cada mês 
              de forma estruturada.
            </p>
          </div>

          <div className="p-8 border border-gray-100 rounded-2xl hover:border-gray-200 transition-colors">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center mb-6">
              <Users className="w-5 h-5 text-black" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">
              Workflow de Aprovação
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Fluxo completo de submissão, revisão e aprovação com 
              rastreabilidade total.
            </p>
          </div>

          <div className="p-8 border border-gray-100 rounded-2xl hover:border-gray-200 transition-colors">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center mb-6">
              <Building2 className="w-5 h-5 text-black" />
            </div>
            <h3 className="text-lg font-medium text-black mb-2">
              Multi-Museu
            </h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Suporte para múltiplos museus com gestão centralizada 
              pelo coordenador.
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="mt-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-600">
              Sistema em construção — Etapa 1 concluída
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}