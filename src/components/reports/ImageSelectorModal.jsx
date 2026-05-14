import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Search, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const FILTROS_DISPONIVES = [
  { id: 'todas', label: 'Todas as Imagens' },
  { id: 'atividades', label: 'De Atividades' },
  { id: 'relatorios', label: 'De Relatórios' },
  { id: 'comunicacao', label: 'De Comunicação' },
  { id: 'galeria', label: 'Da Galeria' },
];

export default function ImageSelectorModal({
  onClose,
  onSelect,
  secao,
  dateFrom,
  dateTo,
  museu,
}) {
  const [imagens, setImagens] = useState([]);
  const [filtroSelecionado, setFiltroSelecionado] = useState('todas');
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [avisos, setAvisos] = useState([]);

  useEffect(() => {
    carregarImagens();
  }, [dateFrom, dateTo, museu, filtroSelecionado]);

  async function carregarImagens() {
    try {
      setLoading(true);
      const imagensList = [];

      // Atividades
      if (filtroSelecionado === 'todas' || filtroSelecionado === 'atividades') {
        const atividades = await base44.entities.Activity.filter({
          report_id: { $exists: true },
        });

        atividades.forEach(ativ => {
          if (Array.isArray(ativ.fotos)) {
            ativ.fotos.forEach(foto => {
              if (foto.file_url || foto.drive_url) {
                imagensList.push({
                  id: `ativ-${ativ.id}`,
                  url: foto.file_url || foto.drive_url,
                  legenda: ativ.titulo || 'Atividade sem título',
                  tipo: 'atividade',
                  origem_id: ativ.id,
                  origem_titulo: ativ.titulo,
                  museu: ativ._museu,
                  data: ativ.data_realizacao,
                  metadata: { ativ_id: ativ.id, titulo_ativ: ativ.titulo },
                });
              }
            });
          }
        });
      }

      // Relatórios
      if (filtroSelecionado === 'todas' || filtroSelecionado === 'relatorios') {
        const attachments = await base44.entities.Attachment.filter({
          backup_done: true,
        });

        attachments.forEach(att => {
          if (att.file_url) {
            imagensList.push({
              id: `att-${att.id}`,
              url: att.file_url,
              legenda: att.description || 'Anexo de relatório',
              tipo: 'relatorio',
              origem_id: att.id,
              data: att.backup_date,
              metadata: { att_id: att.id, report_id: att.report_id },
            });
          }
        });
      }

      // Comunicação (ComunicacaoVisibilidade com fotos)
      if (filtroSelecionado === 'todas' || filtroSelecionado === 'comunicacao') {
        // Você pode adicionar busca em comunicacao aqui quando implementar
      }

      // Filtrar por período e museu se necessário
      const imagensFiltradas = imagensList.filter(img => {
        if (museu && img.museu && img.museu !== museu) return false;
        if (dateFrom && img.data) {
          const imgDate = new Date(img.data);
          if (imgDate < new Date(dateFrom)) return false;
        }
        if (dateTo && img.data) {
          const imgDate = new Date(img.data);
          if (imgDate > new Date(dateTo)) return false;
        }
        return true;
      });

      setImagens(imagensFiltradas);
    } catch (err) {
      toast.error('Erro ao carregar imagens: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectImage(imagem) {
    setSelectedImage(imagem);
    validarSubstituicao(imagem);
  }

  function validarSubstituicao(imagem) {
    const novosAvisos = [];

    // Avisar se imagem não pertence ao período
    if (dateFrom && imagem.data) {
      const imgDate = new Date(imagem.data);
      if (imgDate < new Date(dateFrom) || imgDate > new Date(dateTo)) {
        novosAvisos.push({
          tipo: 'aviso',
          msg: `Imagem fora do período selecionado (${imagem.data})`,
        });
      }
    }

    // Avisar se museu não corresponde
    if (museu && imagem.museu && imagem.museu !== museu) {
      novosAvisos.push({
        tipo: 'aviso',
        msg: `Imagem é do museu "${imagem.museu}", não de "${museu}"`,
      });
    }

    setAvisos(novosAvisos);
  }

  function confirmarSubstituicao() {
    if (!selectedImage) return;

    try {
      // Registrar substituição
      onSelect({
        imagem: selectedImage,
        secao,
        timestamp: new Date().toISOString(),
      });

      toast.success('Imagem selecionada com sucesso');
      onClose();
    } catch (err) {
      toast.error('Erro ao substituir imagem: ' + err.message);
    }
  }

  // Filtrar imagens por busca
  const imagensFiltradas = imagens.filter(img =>
    img.legenda.toLowerCase().includes(busca.toLowerCase()) ||
    img.origem_titulo?.toLowerCase().includes(busca.toLowerCase()) ||
    img.tipo.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* HEADER */}
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg">Selecionar Imagem</CardTitle>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </CardHeader>

        {/* CONTEÚDO */}
        <CardContent className="flex-1 overflow-y-auto space-y-4">
          {/* FILTROS */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700">Filtrar por:</label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {FILTROS_DISPONIVES.map(filtro => (
                  <button
                    key={filtro.id}
                    onClick={() => setFiltroSelecionado(filtro.id)}
                    className={`p-2 rounded text-sm transition-all ${
                      filtroSelecionado === filtro.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    {filtro.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">
                Buscar por palavra-chave:
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Título, atividade, museu..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* AVISOS DE VALIDAÇÃO */}
          {avisos.length > 0 && selectedImage && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
              {avisos.map((aviso, idx) => (
                <div key={idx} className="flex gap-2 text-sm text-yellow-800">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{aviso.msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* GRID DE IMAGENS */}
          {loading ? (
            <div className="text-center py-8">Carregando imagens...</div>
          ) : imagensFiltradas.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nenhuma imagem encontrada.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {imagensFiltradas.map(img => (
                <div
                  key={img.id}
                  onClick={() => handleSelectImage(img)}
                  className={`cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage?.id === img.id
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.legenda}
                    className="w-full h-32 object-cover"
                  />
                  <div className="p-2 bg-slate-50">
                    <p className="text-xs font-medium truncate text-slate-900">
                      {img.legenda}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {img.tipo === 'atividade' && '📋 Atividade'}
                      {img.tipo === 'relatorio' && '📄 Relatório'}
                      {img.tipo === 'comunicacao' && '📢 Comunicação'}
                    </p>
                    {selectedImage?.id === img.id && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
                        <CheckCircle className="w-3 h-3" />
                        Selecionada
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        {/* FOOTER */}
        <div className="border-t p-4 flex justify-end gap-3 bg-slate-50">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={confirmarSubstituicao}
            disabled={!selectedImage}
            className="bg-green-600 hover:bg-green-700"
          >
            Confirmar Seleção
          </Button>
        </div>
      </Card>
    </div>
  );
}