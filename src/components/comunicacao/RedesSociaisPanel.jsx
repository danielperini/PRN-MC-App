import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

const REDES = [
  {
    nome: 'Instagram',
    handle: '@museusbh',
    url: 'https://www.instagram.com/museusbh/',
    cor: 'bg-pink-50 border-pink-200',
    cor_badge: 'bg-pink-100 text-pink-700',
    descricao: 'Perfil oficial dos Museus BH',
  },
  {
    nome: 'Instagram',
    handle: '@viadutodasartes',
    url: 'https://www.instagram.com/viadutodasartes/',
    cor: 'bg-pink-50 border-pink-200',
    cor_badge: 'bg-pink-100 text-pink-700',
    descricao: 'Perfil oficial do Viaduto das Artes',
  },
  {
    nome: 'Instagram',
    handle: '@misbelohorizonte',
    url: 'https://www.instagram.com/misbelohorizonte/',
    cor: 'bg-pink-50 border-pink-200',
    cor_badge: 'bg-pink-100 text-pink-700',
    descricao: 'MIS Belo Horizonte',
  },
  {
    nome: 'Instagram',
    handle: '@museuhistoricoabiliobarreto',
    url: 'https://www.instagram.com/museuhistoricoabiliobarreto/',
    cor: 'bg-pink-50 border-pink-200',
    cor_badge: 'bg-pink-100 text-pink-700',
    descricao: 'MHAB — Museu Histórico Abílio Barreto',
  },
  {
    nome: 'YouTube',
    handle: 'Museus BH',
    url: 'https://www.youtube.com/@museusbh',
    cor: 'bg-red-50 border-red-200',
    cor_badge: 'bg-red-100 text-red-700',
    descricao: 'Canal oficial dos Museus BH',
  },
  {
    nome: 'Site Institucional',
    handle: 'PBH / Museus Centro',
    url: 'https://prefeitura.pbh.gov.br/fundacao-municipal-de-cultura/projeto-museus-centro',
    cor: 'bg-blue-50 border-blue-200',
    cor_badge: 'bg-blue-100 text-blue-700',
    descricao: 'Página oficial do projeto na PBH',
  },
];

const HASHTAGS = [
  '#MuseusCentro', '#ViadutoDasArtes', '#MISBH', '#MHAB', '#MUMO',
  '#NocturnoNosMuseus', '#NocturnoMuseus', '#MuseusBH',
  '#SemanaMuseus', '#SemanaNacionalDeMuseus',
  '#CulturasBH', '#BeloHorizonte', '#MuseusDeRua',
  '#OficinasCulturais', '#EducacaoMuseal',
];

export default function RedesSociaisPanel() {
  return (
    <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
      <CardContent className="p-4 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-black">Redes Sociais e Presença Digital</h2>
          <p className="text-xs text-gray-500 mt-1">Perfis institucionais monitorados e hashtags do projeto.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {REDES.map((rede) => (
            <a
              key={rede.handle}
              href={rede.url}
              target="_blank"
              rel="noreferrer"
              className={`flex items-start gap-3 p-3 rounded-xl border ${rede.cor} hover:shadow-sm transition-all group`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`text-[10px] ${rede.cor_badge} border-0`}>{rede.nome}</Badge>
                  <span className="text-xs font-semibold text-gray-800 truncate">{rede.handle}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1 truncate">{rede.descricao}</p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5 group-hover:text-black transition-colors" />
            </a>
          ))}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Hashtags monitoradas</p>
          <div className="flex flex-wrap gap-1.5">
            {HASHTAGS.map(tag => (
              <a
                key={tag}
                href={`https://www.instagram.com/explore/tags/${tag.replace('#', '')}/`}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-2 py-0.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 hover:bg-black hover:text-white hover:border-black transition-all"
              >
                {tag}
              </a>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}