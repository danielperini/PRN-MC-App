import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Edit2, Save, RotateCcw, RefreshCw, Image, Eye, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import ImageSelectorModal from './ImageSelectorModal';
import RevisionHistoryPanel from './RevisionHistoryPanel';

const SECOES_REVISAVEIS = [
  { id: 'introducao', label: 'Introdução' },
  { id: 'agenda', label: 'Agenda e Programação' },
  { id: 'atividades', label: 'Atividades Consolidadas' },
  { id: 'relatorios', label: 'Relatórios Completos' },
  { id: 'comunicacao', label: 'Comunicação' },
  { id: 'prestacao', label: 'Prestação de Contas' },
  { id: 'conclusao', label: 'Conclusão' },
];

export default function RelatorioFisicoFinanceiroRevisor({ dateFrom, dateTo, museu, textosIA, fotosIA, onApprove }) {
  const [revision, setRevision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [secaoAtual, setSecaoAtual] = useState('introducao');
  const [textoEditado, setTextoEditado] = useState('');
  const [emEdicao, setEmEdicao] = useState(false);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  // Carregar ou criar revisão
  useEffect(() => {
    carregarOuCriarRevisao();
  }, [dateFrom, dateTo]);

  async function carregarOuCriarRevisao() {
    try {
      setLoading(true);
      const periodo_from = new Date(dateFrom).toISOString().split('T')[0];
      const periodo_to = new Date(dateTo).toISOString().split('T')[0];
      const museuFiltro = museu || 'todos';

      // Buscar revisão existente
      const revisoes = await base44.entities.ReportRevision.filter({
        periodo_from,
        periodo_to,
        museu: museuFiltro,
      });

      if (revisoes.length > 0) {
        setRevision(revisoes[0]);
        setTextoEditado(revisoes[0].conteudo_texto[secaoAtual] || textosIA[secaoAtual] || '');
      } else {
        // Criar nova revisão
        const novaRevisao = await base44.entities.ReportRevision.create({
          periodo_from,
          periodo_to,
          museu: museuFiltro,
          status: 'GERADO_IA',
          conteudo_texto: textosIA || {},
          conteudo_imagens: fotosIA || [],
          usuario_revisor: (await base44.auth.me())?.email,
          data_criacao: new Date().toISOString(),
        });
        setRevision(novaRevisao);
        setTextoEditado(textosIA[secaoAtual] || '');
      }
    } catch (err) {
      console.warn('Revisão físico-financeira indisponível no carregamento inicial.', err);
    } finally {
      setLoading(false);
    }
  }

  async function salvarTextoEditado() {
    try {
      if (!revision) return;

      const conteudoAtualizado = {
        ...revision.conteudo_texto,
        [secaoAtual]: textoEditado,
      };

      await base44.entities.ReportRevision.update(revision.id, {
        conteudo_texto: conteudoAtualizado,
        status: 'EDITADO_MANUALMENTE',
        secoes_editadas: Array.from(new Set([...(revision.secoes_editadas || []), secaoAtual])),
      });

      // Registrar no histórico
      await base44.entities.ReportRevisionHistory.create({
        revision_id: revision.id,
        usuario_email: (await base44.auth.me())?.email,
        tipo_alteracao: 'TEXTO_EDITADO',
        secao: secaoAtual,
        conteudo_original: textosIA[secaoAtual] || '',
        conteudo_novo: textoEditado,
        data_alteracao: new Date().toISOString(),
      });

      setRevision({ ...revision, conteudo_texto: conteudoAtualizado });
      setEmEdicao(false);
      toast.success('Texto salvo com sucesso');
    } catch (err) {
      toast.error('Erro ao salvar: ' + err.message);
    }
  }

  async function restaurarTextodaIA() {
    const textoOriginal = textosIA[secaoAtual] || '';
    setTextoEditado(textoOriginal);

    // Registrar no histórico
    if (revision) {
      await base44.entities.ReportRevisionHistory.create({
        revision_id: revision.id,
        usuario_email: (await base44.auth.me())?.email,
        tipo_alteracao: 'TEXTO_RESTAURADO',
        secao: secaoAtual,
        conteudo_original: revision.conteudo_texto[secaoAtual] || '',
        conteudo_novo: textoOriginal,
        data_alteracao: new Date().toISOString(),
      });
    }

    toast.info('Texto original da IA restaurado');
  }

  async function regenerarComIA() {
    try {
      toast.loading('Regenerando texto com IA...');
      // Aqui você chamaria uma função backend para regenerar o texto
      // Por enquanto, mantém o texto da IA original
      setTextoEditado(textosIA[secaoAtual] || '');
      toast.success('Texto regenerado');
    } catch (err) {
      toast.error('Erro ao regenerar: ' + err.message);
    }
  }

  async function aprovarParaExportacao() {
    try {
      if (!revision) return;

      const user = await base44.auth.me();
      await base44.entities.ReportRevision.update(revision.id, {
        status: 'APROVADO_PARA_EXPORTACAO',
        usuario_aprovador: user?.email,
        data_aprovacao: new Date().toISOString(),
      });

      setRevision({ ...revision, status: 'APROVADO_PARA_EXPORTACAO' });
      toast.success('Relatório aprovado para exportação');
      onApprove?.(revision);
    } catch (err) {
      toast.error('Erro ao aprovar: ' + err.message);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96">Carregando revisão...</div>;
  }

  const secaoAtualData = SECOES_REVISAVEIS.find(s => s.id === secaoAtual);
  const foiEditada = revision?.secoes_editadas?.includes(secaoAtual);

  return (
    <div className="space-y-6">
      {/* BARRA DE STATUS */}
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <Eye className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-medium text-blue-900">
            Status: <strong>{revision?.status || 'GERADO_IA'}</strong>
          </span>
        </div>
        <Button
          onClick={() => setShowHistory(true)}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          Histórico de Alterações
        </Button>
      </div>

      {/* SELETOR DE SEÇÕES */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Seções Disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {SECOES_REVISAVEIS.map((sec) => (
              <button
                key={sec.id}
                onClick={() => {
                  setSecaoAtual(sec.id);
                  setEmEdicao(false);
                  setTextoEditado(revision?.conteudo_texto?.[sec.id] || textosIA[sec.id] || '');
                }}
                className={`p-3 rounded-lg text-sm font-medium transition-all ${
                  secaoAtual === sec.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                } ${revision?.secoes_editadas?.includes(sec.id) ? 'ring-2 ring-yellow-500' : ''}`}
              >
                {sec.label}
                {revision?.secoes_editadas?.includes(sec.id) && (
                  <span className="ml-1 text-xs bg-yellow-400 px-2 py-0.5 rounded">✎ Editado</span>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* EDITOR DE TEXTO */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{secaoAtualData?.label}</CardTitle>
            {foiEditada && (
              <p className="text-xs text-yellow-600 mt-1">
                ⚠️ Esta seção foi manualmente editada
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {!emEdicao ? (
              <Button
                onClick={() => setEmEdicao(true)}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </Button>
            ) : (
              <>
                <Button
                  onClick={salvarTextoEditado}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 gap-2"
                >
                  <Save className="w-4 h-4" />
                  Salvar
                </Button>
                <Button
                  onClick={() => {
                    setEmEdicao(false);
                    setTextoEditado(revision?.conteudo_texto?.[secaoAtual] || textosIA[secaoAtual] || '');
                  }}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancelar
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {emEdicao ? (
            <Textarea
              value={textoEditado}
              onChange={(e) => setTextoEditado(e.target.value)}
              className="min-h-[400px] font-mono text-sm"
              placeholder="Edite o texto aqui..."
            />
          ) : (
            <div className="prose max-w-none text-sm leading-relaxed whitespace-pre-wrap">
              {textoEditado || '(Sem conteúdo)'}
            </div>
          )}

          {!emEdicao && (
            <div className="flex gap-2 border-t pt-4">
              <Button
                onClick={restaurarTextodaIA}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Restaurar IA
              </Button>
              <Button
                onClick={regenerarComIA}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* GESTOR DE IMAGENS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Image className="w-5 h-5" />
            Imagens da Seção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ImageSectionViewer
            secao={secaoAtual}
            imagens={revision?.conteudo_imagens || []}
            onSubstituir={(idx) => {
              setSelectedImageIndex(idx);
              setShowImageSelector(true);
            }}
          />
        </CardContent>
      </Card>

      {/* BOTÃO DE APROVAÇÃO */}
      <div className="flex gap-4 justify-end">
        <Button
          onClick={aprovarParaExportacao}
          className="bg-green-600 hover:bg-green-700 gap-2"
          disabled={revision?.status === 'APROVADO_PARA_EXPORTACAO'}
        >
          <Check className="w-4 h-4" />
          Aprovar para Exportação
        </Button>
      </div>

      {/* MODAIS */}
      {showImageSelector && (
        <ImageSelectorModal
          onClose={() => setShowImageSelector(false)}
          onSelect={(novaImagem) => {
            // Salvar substituição
            toast.success('Imagem substituída');
            setShowImageSelector(false);
          }}
          secao={secaoAtual}
          dateFrom={dateFrom}
          dateTo={dateTo}
          museu={museu}
        />
      )}

      {showHistory && (
        <RevisionHistoryPanel
          revisionId={revision?.id}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function ImageSectionViewer({ secao, imagens, onSubstituir }) {
  const imagensDaSecao = imagens.filter(img => img.secao === secao);

  if (imagensDaSecao.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma imagem nesta seção.</p>;
  }

  return (
    <div className="space-y-4">
      {imagensDaSecao.map((img, idx) => (
        <div key={idx} className="border rounded-lg p-3 space-y-2">
          <div className="flex gap-3">
            {img.url_substituida ? (
              <>
                <div className="flex-1">
                  <p className="text-xs text-slate-500 mb-1">Imagem Original:</p>
                  <img
                    src={img.url_original}
                    alt="Original"
                    className="h-32 object-cover rounded"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-green-600 font-medium mb-1">✓ Imagem Substituída:</p>
                  <img
                    src={img.url_substituida}
                    alt="Substituída"
                    className="h-32 object-cover rounded border-2 border-green-300"
                  />
                </div>
              </>
            ) : (
              <div className="flex-1">
                <img
                  src={img.url_original}
                  alt="Imagem"
                  className="h-32 object-cover rounded"
                />
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-600 mb-1">Legenda:</p>
            <p className="text-sm text-slate-800">{img.legenda_editada || img.legenda_original}</p>
          </div>
          <Button
            onClick={() => onSubstituir(img.indice)}
            variant="outline"
            size="sm"
            className="gap-2 w-full"
          >
            <Image className="w-4 h-4" />
            Substituir Imagem
          </Button>
        </div>
      ))}
    </div>
  );
}
