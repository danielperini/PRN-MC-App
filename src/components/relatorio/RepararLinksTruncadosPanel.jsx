import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Wrench, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';

function SecaoColapsavel({ titulo, cor, icone: Icone, children, count }) {
  const [aberta, setAberta] = useState(true);
  if (count === 0) return null;

  const cores = {
    green: 'border-green-200 bg-green-50',
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
  };
  const coresTitulo = {
    green: 'text-green-800',
    amber: 'text-amber-800',
    red: 'text-red-800',
  };

  return (
    <div className={`rounded-xl border ${cores[cor]} overflow-hidden`}>
      <button
        className={`w-full flex items-center justify-between px-4 py-3 font-semibold text-sm ${coresTitulo[cor]}`}
        onClick={() => setAberta(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Icone className="w-4 h-4" />
          {titulo}
          <Badge variant="outline" className="ml-1 text-xs">{count}</Badge>
        </div>
        {aberta ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {aberta && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function ItemCorrigido({ item }) {
  return (
    <div className="rounded-lg bg-white border border-green-200 p-3 text-xs space-y-1">
      <div className="text-slate-400 font-mono truncate" title={item.url_original}>
        Antes: {item.url_original}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-green-700 font-medium truncate flex-1" title={item.url_corrigida}>
          Depois: {item.url_corrigida}
        </span>
        <a href={item.url_corrigida} target="_blank" rel="noreferrer">
          <ExternalLink className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
        </a>
      </div>
      {item.arquivo && <div className="text-slate-500">Arquivo: {item.arquivo}</div>}
    </div>
  );
}

function ItemAmbiguo({ item, selecoes, onSelecionar, onConfirmar, confirmando }) {
  const selecionado = selecoes[item.url_original];

  return (
    <div className="rounded-lg bg-white border border-amber-200 p-3 text-xs space-y-2">
      <div className="text-slate-500 font-mono truncate" title={item.url_original}>
        {item.url_original}
      </div>
      <div className="flex items-center gap-2">
        <Select value={selecionado || ''} onValueChange={v => onSelecionar(item.url_original, v)}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Selecione o arquivo correto..." />
          </SelectTrigger>
          <SelectContent>
            {item.opcoes.map(op => (
              <SelectItem key={op.id} value={op.id}>
                {op.name} ({op.id.slice(0, 12)}…)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selecionado && (
          <a href={item.opcoes.find(o => o.id === selecionado)?.webViewLink} target="_blank" rel="noreferrer">
            <ExternalLink className="w-3.5 h-3.5 text-amber-600" />
          </a>
        )}
      </div>
      {selecionado && (
        <Button size="sm" className="h-7 text-xs" disabled={confirmando} onClick={() => onConfirmar(item, selecionado)}>
          {confirmando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
          Confirmar seleção
        </Button>
      )}
    </div>
  );
}

function ItemNaoEncontrado({ item }) {
  return (
    <div className="rounded-lg bg-white border border-red-200 p-3 text-xs">
      <div className="text-slate-500 font-mono truncate" title={item.url_original}>
        {item.url_original}
      </div>
      <div className="text-slate-400 mt-1">Campo: {item.campo} · Prefixo ID: <code>{item.prefixo}</code></div>
    </div>
  );
}

export default function RepararLinksTruncadosPanel({ relatorioId }) {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [selecoes, setSelecoes] = useState({});
  const [confirmando, setConfirmando] = useState(null);
  const [aberto, setAberto] = useState(false);

  async function executarReparo() {
    setRodando(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('repararLinksTruncados', { relatorio_id: relatorioId });
      const data = res?.data || res;
      setResultado(data);
      setAberto(true);
      if (data.corrigidos?.length > 0) {
        toast.success(`${data.corrigidos.length} link(s) corrigido(s) automaticamente.`);
      } else if (data.total_varridos === 0) {
        toast.info('Nenhum link truncado encontrado neste relatório.');
      }
    } catch (error) {
      toast.error('Erro ao reparar links: ' + (error?.message || String(error)));
    } finally {
      setRodando(false);
    }
  }

  async function confirmarAmbiguo(item, idCorrecto) {
    setConfirmando(item.url_original);
    try {
      const conf = [{
        url_original: item.url_original,
        id_correto: idCorrecto,
        tipo: item.tipo,
        campo: item.campo,
        meta_idx: item.meta_idx,
        doc_idx: item.doc_idx,
      }];
      await base44.functions.invoke('repararLinksTruncados', {
        relatorio_id: relatorioId,
        confirmar_ambiguos: conf,
      });
      toast.success('Link atualizado com sucesso.');
      // Remove o item ambíguo da lista local e adiciona aos corrigidos
      setResultado(prev => ({
        ...prev,
        ambiguos: prev.ambiguos.filter(a => a.url_original !== item.url_original),
        corrigidos: [...(prev.corrigidos || []), {
          url_original: item.url_original,
          url_corrigida: item.opcoes.find(o => o.id === idCorrecto)?.webViewLink || idCorrecto,
          arquivo: item.opcoes.find(o => o.id === idCorrecto)?.name,
        }],
      }));
    } catch (error) {
      toast.error('Erro ao confirmar: ' + (error?.message || String(error)));
    } finally {
      setConfirmando(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="border-violet-300 text-violet-700 hover:bg-violet-50"
          onClick={executarReparo}
          disabled={rodando}
        >
          {rodando
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Wrench className="w-4 h-4 mr-2" />}
          {rodando ? 'Varrendo links...' : 'Reparar Links Truncados'}
        </Button>
        {resultado && !aberto && (
          <button className="text-xs text-violet-600 underline" onClick={() => setAberto(true)}>
            Ver resultado
          </button>
        )}
      </div>

      {resultado && aberto && (
        <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-violet-800">
              Resultado do reparo — {resultado.total_varridos || 0} link(s) varrido(s)
            </p>
            <button className="text-xs text-violet-500 hover:text-violet-700" onClick={() => setAberto(false)}>
              Fechar
            </button>
          </div>

          <SecaoColapsavel
            titulo="Corrigidos automaticamente"
            cor="green"
            icone={CheckCircle2}
            count={resultado.corrigidos?.length || 0}
          >
            {(resultado.corrigidos || []).map((item, i) => (
              <ItemCorrigido key={i} item={item} />
            ))}
          </SecaoColapsavel>

          <SecaoColapsavel
            titulo="Ambíguos — selecione o arquivo correto"
            cor="amber"
            icone={AlertTriangle}
            count={resultado.ambiguos?.length || 0}
          >
            {(resultado.ambiguos || []).map((item, i) => (
              <ItemAmbiguo
                key={i}
                item={item}
                selecoes={selecoes}
                onSelecionar={(url, id) => setSelecoes(prev => ({ ...prev, [url]: id }))}
                onConfirmar={confirmarAmbiguo}
                confirmando={confirmando === item.url_original}
              />
            ))}
          </SecaoColapsavel>

          <SecaoColapsavel
            titulo="Não encontrados — ação manual necessária"
            cor="red"
            icone={XCircle}
            count={resultado.nao_encontrados?.length || 0}
          >
            {(resultado.nao_encontrados || []).map((item, i) => (
              <ItemNaoEncontrado key={i} item={item} />
            ))}
          </SecaoColapsavel>

          {resultado.total_varridos === 0 && (
            <p className="text-sm text-violet-600 italic">Nenhum link truncado detectado neste relatório.</p>
          )}
        </div>
      )}
    </div>
  );
}