import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Plus, Loader2, Trash2, Link2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STORAGE_KEY = 'comunicacao_links_v1';

function loadLinks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveLinks(links) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {}
}

const TIPO_LABELS = {
  instagram: { label: 'Instagram', cls: 'bg-pink-100 text-pink-700' },
  youtube: { label: 'YouTube', cls: 'bg-red-100 text-red-700' },
  noticia: { label: 'Notícia', cls: 'bg-blue-100 text-blue-700' },
  release: { label: 'Release', cls: 'bg-purple-100 text-purple-700' },
  site: { label: 'Site', cls: 'bg-gray-100 text-gray-700' },
  materia: { label: 'Matéria', cls: 'bg-amber-100 text-amber-700' },
  outro: { label: 'Outro', cls: 'bg-gray-100 text-gray-600' },
};

function inferTipo(url = '') {
  const u = url.toLowerCase();
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('release') || u.includes('assessoria')) return 'release';
  if (u.includes('noticias') || u.includes('news') || u.includes('materia')) return 'noticia';
  return 'site';
}

export default function LinksClipping() {
  const [links, setLinks] = useState(loadLinks);
  const [url, setUrl] = useState('');
  const [analisando, setAnalisando] = useState(false);

  async function adicionarLink() {
    if (!url.trim()) return;
    setAnalisando(true);
    try {
      const tipo = inferTipo(url);
      const prompt = `Analise este link público relacionado ao projeto cultural Museus Centro / Viaduto das Artes em BH:
URL: ${url}

Retorne JSON com:
- titulo: string (título da publicação)
- veiculo: string (nome do veículo/canal)
- resumo: string (2-3 frases descrevendo o conteúdo)
- museu: string (MIS, MHAB, MUMO, Viaduto das Artes, Geral)
- tema: string (cultura, educação, patrimônio, etc.)
- data: string (YYYY-MM-DD se identificada, null caso contrário)`;

      let titulo = url;
      let veiculo = 'Fonte externa';
      let resumo = 'Link cadastrado manualmente. Análise IA não disponível.';
      let museu = 'Geral';
      let tema = 'comunicação';
      let data = null;

      try {
        const res = await base44.integrations.Core.InvokeLLM({
          prompt,
          add_context_from_internet: true,
          response_json_schema: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              veiculo: { type: 'string' },
              resumo: { type: 'string' },
              museu: { type: 'string' },
              tema: { type: 'string' },
              data: { type: 'string' },
            },
          },
        });
        if (res?.titulo) {
          titulo = res.titulo;
          veiculo = res.veiculo || veiculo;
          resumo = res.resumo || resumo;
          museu = res.museu || museu;
          tema = res.tema || tema;
          data = res.data || null;
        }
      } catch { /* usa fallback */ }

      const novoLink = {
        id: `link-${Date.now()}`,
        url: url.trim(),
        tipo,
        titulo,
        veiculo,
        resumo,
        museu,
        tema,
        data,
        adicionadoEm: new Date().toLocaleDateString('pt-BR'),
      };

      const updated = [novoLink, ...links];
      setLinks(updated);
      saveLinks(updated);
      setUrl('');
    } finally {
      setAnalisando(false);
    }
  }

  function remover(id) {
    const updated = links.filter(l => l.id !== id);
    setLinks(updated);
    saveLinks(updated);
  }

  return (
    <Card className="rounded-2xl border-gray-200 bg-white shadow-sm">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-black" />
          <div>
            <h2 className="text-lg font-semibold text-black">Links Relacionados</h2>
            <p className="text-xs text-gray-500">Cadastre links de notícias, posts e sites. A IA categoriza automaticamente.</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="Cole um link (Instagram, notícia, YouTube, site...)"
            className="flex-1 text-sm rounded-xl"
            onKeyDown={e => { if (e.key === 'Enter') adicionarLink(); }}
            disabled={analisando}
          />
          <Button
            onClick={adicionarLink}
            disabled={analisando || !url.trim()}
            className="gap-2 rounded-xl whitespace-nowrap"
          >
            {analisando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {analisando ? 'Analisando...' : 'Adicionar'}
          </Button>
        </div>

        {links.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-400">
            Nenhum link cadastrado ainda. Adicione links de notícias, posts e releases.
          </div>
        ) : (
          <div className="space-y-2">
            {links.map(link => {
              const tipo = TIPO_LABELS[link.tipo] || TIPO_LABELS.outro;
              return (
                <div key={link.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 hover:border-gray-200 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className={`text-[10px] border-0 ${tipo.cls}`}>{tipo.label}</Badge>
                      {link.museu && link.museu !== 'Geral' && (
                        <Badge variant="outline" className="text-[10px] bg-white">{link.museu}</Badge>
                      )}
                      {link.tema && <span className="text-[10px] text-gray-400">{link.tema}</span>}
                      {link.data && <span className="text-[10px] text-gray-400">{link.data}</span>}
                    </div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{link.titulo}</p>
                    {link.veiculo && <p className="text-xs text-gray-500 truncate">{link.veiculo}</p>}
                    {link.resumo && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{link.resumo}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a href={link.url} target="_blank" rel="noreferrer"
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-black hover:border-gray-400 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button onClick={() => remover(link.id)}
                      className="p-1.5 rounded-lg border border-gray-100 text-gray-300 hover:text-red-500 hover:border-red-200 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}