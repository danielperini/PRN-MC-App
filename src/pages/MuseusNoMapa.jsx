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
  {
    sigla: 'Viaduto das Artes',
    nome: 'Viaduto',
    nomeFormal: 'Viaduto das Artes',
    descricao: 'Formação artística, mobilização cultural e participação comunitária',
    foco: 'Arte, Mobilização, Comunidade',
    cor: 'from-cyan-600 to-cyan-700',
  },
];

function MuseusNoMapaInner() {
  const [museuData, setMuseuData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregarMuseus() {
      try {
        const data = await base44.entities.Museu.list();
        setMuseuData(data);
      } catch (err) {
        console.error('Erro ao carregar museus:', err);
      } finally {
        setLoading(false);
      }
    }
    carregarMuseus();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-slate-700/5 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 py-20 text-center">
          <div className="inline-block mb-6">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-full px-4 py-2 border border-white/20">
              <MapPin className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white/80">Territorialidade & Redes</span>
            </div>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            Museus Centro
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              No Mapa
            </span>
          </h1>

          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-12 leading-relaxed">
            Explore as oportunidades territoriais, públicos potenciais e parcerias estratégicas
            de cada unidade em Belo Horizonte.
          </p>
        </div>
      </div>

      {/* Grid de Museus */}
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {museus.map((museu) => (
            <Link key={museu.sigla} to={createPageUrl(`${museu.sigla === 'Viaduto das Artes' ? 'ViadutoMap' : museu.sigla + 'Map'}`)} className="group">
              <div className={`bg-gradient-to-br ${museu.cor} rounded-2xl p-8 text-white shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 h-full cursor-pointer`}>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="text-sm font-semibold text-white/80 uppercase tracking-widest mb-2">
                      {museu.foco}
                    </div>
                    <h2 className="text-3xl font-bold">{museu.nomeFormal}</h2>
                  </div>
                  <div className="p-3 bg-white/20 backdrop-blur rounded-lg group-hover:bg-white/30 transition-all">
                    <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>

                <p className="text-white/90 leading-relaxed mb-8">
                  {museu.descricao}
                </p>

                <Button
                  variant="secondary"
                  className="w-full bg-white text-slate-900 hover:bg-white/90 font-semibold"
                >
                  Explorar Mapa
                </Button>
              </div>
            </Link>
          ))}
        </div>

        {/* Info */}
        <div className="mt-20 bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 text-center">
          <p className="text-slate-300 text-sm max-w-2xl mx-auto">
            Os mapas gráficos mostram oportunidades de mobilização, relacionamento institucional,
            formação de público, articulação territorial, programação e parcerias para cada museu.
            Utilize os filtros para explorar categorias, públicos e prioridades específicas.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MuseusNoMapa() {
  return <RequireAuth><MuseusNoMapaInner /></RequireAuth>;
}