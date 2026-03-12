import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { MapPin, ArrowRight } from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';

const museus = [
  {
    sigla: 'MHAB',
    nome: 'MHAB',
    nomeFormal: 'Museu Histórico Abílio Barreto',
    descricao: 'Patrimônio, memória e história urbana de Belo Horizonte',
    foco: 'História, Educação Patrimonial, Comunidade',
    cor: 'from-amber-600 to-amber-700',
  },
  {
    sigla: 'MIS',
    nome: 'MIS',
    nomeFormal: 'Museu de Imagens e do Som',
    descricao: 'Fotografia, cinema, audiovisual e comunicação visual',
    foco: 'Cinema, Fotografia, Audiovisual',
    cor: 'from-red-600 to-red-700',
  },
  {
    sigla: 'MUMO',
    nome: 'MUMO',
    nomeFormal: 'Museu de Moda',
    descricao: 'Moda, design, têxtil e economia criativa',
    foco: 'Moda, Design, Criatividade',
    cor: 'from-purple-600 to-purple-700',
  },
];

function MuseusNoMapaInner() {
   return (
     <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 py-24 text-center">
          <div className="inline-block mb-6">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20 hover:border-white/40 transition-all">
              <MapPin className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-white/80">Inteligência Territorial</span>
            </div>
          </div>

          <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 tracking-tight leading-tight">
            Museus Centro
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400">
              No Mapa
            </span>
          </h1>

          <p className="text-lg text-slate-200 max-w-3xl mx-auto mb-8 leading-relaxed">
            Visualize oportunidades territoriais, públicos estratégicos e parcerias potenciais.
            Três mapas gráficos interativos para cada unidade: radial, rede e calor editorial.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            <div className="px-4 py-2 bg-white/10 rounded-full text-sm text-slate-300 border border-white/20">
              ✨ 3 Museus
            </div>
            <div className="px-4 py-2 bg-white/10 rounded-full text-sm text-slate-300 border border-white/20">
              🔍 Análise com IA
            </div>
            <div className="px-4 py-2 bg-white/10 rounded-full text-sm text-slate-300 border border-white/20">
              📊 3 Visualizações por Unidade
            </div>
          </div>
        </div>
      </div>

      {/* Grid de Museus */}
      <div className="relative max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {museus.map((museu) => (
            <Link key={museu.sigla} to={createPageUrl(`${museu.sigla === 'Viaduto das Artes' ? 'ViadutoMap' : museu.sigla + 'Map'}`)} className="group">
              <div className={`relative bg-gradient-to-br ${museu.cor} rounded-2xl p-8 text-white shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-1 h-full cursor-pointer overflow-hidden`}>
                {/* Overlay gradiente */}
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-all" />

                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex-1">
                      <div className="text-xs font-bold text-white/70 uppercase tracking-widest mb-3 inline-block px-2 py-1 bg-white/10 rounded-full">
                        {museu.foco}
                      </div>
                      <h2 className="text-3xl md:text-4xl font-bold leading-tight">{museu.nomeFormal}</h2>
                    </div>
                    <div className="p-3 bg-white/20 backdrop-blur rounded-xl group-hover:bg-white/30 transition-all flex-shrink-0">
                      <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  <p className="text-white/90 leading-relaxed mb-6 text-sm md:text-base">
                    {museu.descricao}
                  </p>

                  <div className="flex items-center justify-between pt-4 border-t border-white/20">
                    <span className="text-xs text-white/60 font-medium">Explorar análise territorial</span>
                    <span className="text-lg group-hover:translate-x-2 transition-transform">→</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Info Cards */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/8 transition-all">
            <div className="text-2xl mb-3">🗺️</div>
            <h3 className="text-white font-semibold mb-2">3 Visualizações</h3>
            <p className="text-slate-300 text-sm">Mapas radial, rede e calor editorial para cada museu</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/8 transition-all">
            <div className="text-2xl mb-3">🤖</div>
            <h3 className="text-white font-semibold mb-2">Análise com IA</h3>
            <p className="text-slate-300 text-sm">Claude analisa atividades e sugere parceiros estratégicos</p>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/8 transition-all">
            <div className="text-2xl mb-3">🎯</div>
            <h3 className="text-white font-semibold mb-2">Filtros Inteligentes</h3>
            <p className="text-slate-300 text-sm">Por categoria, público-alvo, tema e prioridade</p>
          </div>
        </div>

        {/* Feature Info */}
        <div className="mt-16 bg-gradient-to-r from-white/5 to-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 md:p-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-white text-xl font-bold mb-4">Para Coordenadores</h3>
              <ul className="space-y-3 text-slate-300 text-sm">
                <li className="flex items-start gap-3">
                  <span className="text-blue-400 font-bold">✓</span>
                  <span>Identificar oportunidades de mobilização</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-400 font-bold">✓</span>
                  <span>Descobrir parcerias estratégicas</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-blue-400 font-bold">✓</span>
                  <span>Mapear públicos potenciais</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white text-xl font-bold mb-4">Funcionalidades</h3>
              <ul className="space-y-3 text-slate-300 text-sm">
                <li className="flex items-start gap-3">
                  <span className="text-cyan-400 font-bold">→</span>
                  <span>Atualizar análise com IA</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-400 font-bold">→</span>
                  <span>Ver curadoria de oportunidades</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-cyan-400 font-bold">→</span>
                  <span>Resumo de mobilização por mês</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MuseusNoMapa() {
  return <RequireAuth><MuseusNoMapaInner /></RequireAuth>;
}