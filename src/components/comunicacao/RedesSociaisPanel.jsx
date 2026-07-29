import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Instagram } from 'lucide-react';

const MUSEUS_INSTAGRAM = [
  {
    museu: 'MHAB',
    nome: 'Museu Histórico Abílio Barreto',
    handle: '@museuabiliobarretobh',
    url: 'https://www.instagram.com/museuabiliobarretobh/reels/',
    bio: 'Museu histórico no coração de BH, guardando a memória da cidade desde 1943. Cultura, patrimônio e identidade.',
  },
  {
    museu: 'MUMO',
    nome: 'Museu da Moda BH',
    handle: '@museudamodabh',
    url: 'https://www.instagram.com/museudamodabh/',
    bio: 'Moda como expressão cultural e histórica. Acervo, exposições e programação para quem ama arte e vestimenta.',
  },
  {
    museu: 'MIS BH',
    nome: 'Museu da Imagem e do Som BH',
    handle: '@museudaimagemedosombh',
    url: 'https://www.instagram.com/museudaimagemedosombh/',
    bio: 'Imagem, som e memória audiovisual de Belo Horizonte. Exposições, mostras e acervo do MIS BH.',
  },
];

const OUTROS_PERFIS = [
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

function InstagramMuseuCard({ museu }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      {/* Header com gradiente Instagram */}
      <div className="h-1.5 w-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400" />

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Perfil */}
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
            <Instagram className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-tight">{museu.nome}</p>
            <p className="text-xs text-pink-600 font-medium">{museu.handle}</p>
            <Badge className="mt-1 text-[10px] bg-gray-100 text-gray-600 border-0 px-1.5 py-0.5">
              {museu.museu}
            </Badge>
          </div>
        </div>

        {/* Bio */}
        <p className="text-xs text-gray-500 leading-relaxed">{museu.bio}</p>

        {/* Botão */}
        <a
          href={museu.url}
          target="_blank"
          rel="noreferrer"
          className="mt-auto flex items-center justify-center gap-1.5 bg-black text-white text-xs font-semibold py-2 px-3 rounded-xl hover:bg-gray-800 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ver no Instagram
        </a>
      </div>
    </div>
  );
}

export default function RedesSociaisPanel() {
  return (
    <div className="space-y-6">
      {/* Cards dos museus no Instagram */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Museus no Instagram</h2>
        <p className="text-xs text-gray-500 mb-3">Presença digital dos museus do projeto Museus Centro.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MUSEUS_INSTAGRAM.map((m) => (
            <InstagramMuseuCard key={m.museu} museu={m} />
          ))}
        </div>
      </div>

      {/* Outros perfis */}
      <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-black">Outros Perfis Institucionais</h2>
            <p className="text-xs text-gray-500 mt-0.5">Redes sociais e canais do projeto.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OUTROS_PERFIS.map((rede) => (
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
    </div>
  );
}