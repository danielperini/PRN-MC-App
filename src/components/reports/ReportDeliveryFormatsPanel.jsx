import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  FileText,
  Image,
  Layers3,
  ListChecks,
  Loader2,
  MapPin,
  ReceiptText,
  Target,
  Users,
} from 'lucide-react';

const REPORT_FORMATS = [
  {
    id: 'geral',
    title: 'Relatório geral completo',
    description: 'Gera o pacote completo: relatório principal de dados, relatório galeria e relatório de atividades integrais.',
    source: 'Todos os capítulos, relatórios aprovados, programação, rubricas, documentos, fotos, público e metas.',
    output: 'Pacote completo em PDF',
    icon: Layers3,
    featured: true,
  },
  {
    id: 'editorial',
    title: 'Relatório editorial',
    description: 'Publicação institucional com capa, expediente, introdução, território, comunicação, síntese, governança e conclusão.',
    source: 'Relatórios aprovados, programação, indicadores e textos editoriais do app.',
    output: 'PDF A4 institucional',
    icon: FileText,
  },
  {
    id: 'fisico_financeiro',
    title: 'Relatório físico-financeiro',
    description: 'Consolida execução física, rubricas, valores previstos, utilizados, saldos, aprovações, compras e pagamentos.',
    source: 'Rubrica, PurchaseRequest, TeamPayment, DocumentIntake e anexos fiscais.',
    output: 'PDF de prestação de contas',
    icon: BarChart3,
  },
  {
    id: 'galeria',
    title: 'Relatório de galeria',
    description: 'Organiza imagens como evidências visuais, evitando repetição e mantendo vínculo com museu, atividade, data, legenda e origem.',
    source: 'Fotos, anexos, metadados, vínculos de atividade e registros de galeria.',
    output: 'PDF visual de evidências',
    icon: Image,
  },
  {
    id: 'museu',
    title: 'Relatório por museu',
    description: 'Separa leitura por MIS, MHAB, MUMO ou atuação geral, preservando indicadores, público, atividades, evidências e financeiro por unidade.',
    source: 'Filtro Museu no gerador e campos museu/centro de custo dos registros.',
    output: 'PDF por equipamento cultural',
    icon: Building2,
  },
  {
    id: 'atividade',
    title: 'Relatório por atividade',
    description: 'Apresenta atividades registradas com data, museu, natureza, descrição, resultados, público, autoria e anexos vinculados.',
    source: 'Atividades dentro dos relatórios aprovados e programação vinculada.',
    output: 'PDF de atividades',
    icon: CalendarDays,
  },
  {
    id: 'periodo',
    title: 'Relatório por período',
    description: 'Gera recorte por data inicial e final, permitindo consolidar mês, trimestre, etapa do aditivo ou período customizado.',
    source: 'Filtros de data do gerador e registros datados no app.',
    output: 'PDF por recorte temporal',
    icon: Layers3,
  },
  {
    id: 'fotos',
    title: 'Relatório com fotos',
    description: 'Inclui fotos selecionadas no corpo das atividades e separa a galeria completa como anexo visual quando necessário.',
    source: 'Fotos vinculadas às atividades, anexos e biblioteca de mídia.',
    output: 'PDF com evidências fotográficas',
    icon: Camera,
  },
  {
    id: 'gps',
    title: 'Relatório com GPS',
    description: 'Preserva localização, coordenadas e referência territorial quando os dados existem no app ou nos metadados das evidências.',
    source: 'Campos de localização, coordenadas, equipamento cultural e metadados das imagens.',
    output: 'PDF com rastreabilidade espacial',
    icon: MapPin,
  },
  {
    id: 'publico',
    title: 'Relatório com público',
    description: 'Distingue público informado, estimado, consolidado por museu e total geral, evitando casas decimais e duplicidade de contagem.',
    source: 'Campos de público das atividades, relatórios e indicadores oficiais do dashboard.',
    output: 'PDF com indicadores de alcance',
    icon: Users,
  },
  {
    id: 'metas',
    title: 'Relatório com metas',
    description: 'Relaciona atividades, rubricas, execução financeira e entregas às metas do 3º Aditivo.',
    source: 'Metas, rubricas, programação, atividades e solicitações financeiras vinculadas.',
    output: 'PDF de execução de metas',
    icon: Target,
  },
  {
    id: 'documentos',
    title: 'Relatório com documentos fiscais',
    description: 'Lista notas fiscais, XML, contratos, comprovantes, recibos e vínculos documentais usados na prestação de contas.',
    source: 'DocumentIntake, Attachment, PurchaseRequest, TeamPayment e vínculos PDF/XML/comprovantes.',
    output: 'PDF documental e fiscal',
    icon: ReceiptText,
  },
  {
    id: 'volumes',
    title: 'Volumes em PDF',
    description: 'Gera três saídas organizadas como volumes: principal, galeria de evidências e atividades integrais.',
    source: 'Plano de capítulos, dados principais, galeria e atividades aprovadas.',
    output: 'Volume 1, Volume 2 e Volume 3',
    icon: Layers3,
  },
];

export default function ReportDeliveryFormatsPanel({ onGenerate, loading = false, activeFormat = null } = {}) {
  const canGenerate = typeof onGenerate === 'function';
  const [selectedQueue, setSelectedQueue] = useState([]);
  const [queueGenerating, setQueueGenerating] = useState(false);

  const selectedFormats = useMemo(
    () => selectedQueue
      .map((formatId) => REPORT_FORMATS.find((format) => format.id === formatId))
      .filter(Boolean),
    [selectedQueue]
  );

  const estimatedMinutes = Math.max(1, selectedQueue.length * 2);
  const isBusy = loading || queueGenerating;

  const toggleFormat = (formatId) => {
    if (isBusy) return;
    setSelectedQueue((current) => (
      current.includes(formatId)
        ? current.filter((item) => item !== formatId)
        : [...current, formatId]
    ));
  };

  const selectAllFormats = () => {
    if (isBusy) return;
    setSelectedQueue(REPORT_FORMATS.map((format) => format.id));
  };

  const clearSelection = () => {
    if (isBusy) return;
    setSelectedQueue([]);
  };

  const handleGenerateQueue = async () => {
    if (!canGenerate || selectedQueue.length === 0 || isBusy) return;

    setQueueGenerating(true);
    try {
      for (let index = 0; index < selectedQueue.length; index += 1) {
        const formatId = selectedQueue[index];
        await onGenerate(formatId, {
          fromQueue: true,
          queuePosition: index + 1,
          queueTotal: selectedQueue.length,
          openPreview: false,
        });
      }
    } finally {
      setQueueGenerating(false);
    }
  };

  return (
    <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            Formatos de entrega
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-black md:text-3xl">
            Selecione os relatórios que serão gerados
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Cada card é também o botão de seleção. Ao selecionar, ele entra na fila de geração e recebe o número da ordem de exportação.
            Selecione um, vários ou todos; depois clique em <strong>Gerar relatórios</strong>.
          </p>
        </div>
        <div className="rounded-2xl border border-black bg-black px-4 py-3 text-white">
          <span className="block text-xs uppercase tracking-[0.18em] text-white/70">Saída principal</span>
          <strong className="block text-lg">PDF A4 + HTML de prévia</strong>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <button
          type="button"
          onClick={selectAllFormats}
          disabled={isBusy}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          Selecionar todos
        </button>
        <button
          type="button"
          onClick={clearSelection}
          disabled={isBusy || selectedQueue.length === 0}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          Limpar seleção
        </button>
        <div className="ml-auto flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          <ListChecks className="h-4 w-4" />
          {selectedQueue.length} selecionado{selectedQueue.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_FORMATS.map((format) => {
          const Icon = format.icon;
          const isActive = activeFormat === format.id;
          const selectionOrder = selectedQueue.indexOf(format.id) + 1;
          const isSelected = selectionOrder > 0;
          const disabled = isBusy && !isActive;
          const featuredSelectedClass = isSelected
            ? 'border-black bg-black text-white shadow-md ring-2 ring-black ring-offset-2'
            : 'border-black bg-black text-white hover:bg-slate-900';
          const defaultSelectedClass = isSelected
            ? 'border-black bg-white shadow-md ring-2 ring-black ring-offset-2'
            : 'border-slate-200 bg-slate-50 hover:border-black hover:bg-white hover:shadow-md';

          return (
            <button
              key={format.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleFormat(format.id)}
              className={`group relative flex min-h-[230px] w-full flex-col rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 ${
                format.featured ? featuredSelectedClass : defaultSelectedClass
              } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              {isSelected && (
                <span className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black text-sm font-black text-white shadow-lg ring-4 ring-white">
                  {selectionOrder}
                </span>
              )}

              <div className="mb-4 flex items-start justify-between gap-4">
                <div className={`rounded-2xl border p-3 ${format.featured || isSelected ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-black group-hover:border-black'}`}>
                  {isActive ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${format.featured || isSelected ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
                  {isActive ? 'Gerando' : isSelected ? `Fila ${selectionOrder}` : canGenerate ? 'Selecionar' : 'Ativo'}
                </span>
              </div>

              <h3 className={`text-base font-bold leading-tight ${format.featured || isSelected ? 'text-white' : 'text-black'}`}>{format.title}</h3>
              <p className={`mt-2 flex-1 text-sm leading-6 ${format.featured || isSelected ? 'text-white/75' : 'text-slate-600'}`}>{format.description}</p>

              <div className={`mt-4 space-y-2 border-t pt-4 text-xs leading-5 ${format.featured || isSelected ? 'border-white/20 text-white/75' : 'border-slate-200 text-slate-600'}`}>
                <p><strong className={format.featured || isSelected ? 'text-white' : 'text-black'}>Fonte:</strong> {format.source}</p>
                <p><strong className={format.featured || isSelected ? 'text-white' : 'text-black'}>Entrega:</strong> {format.output}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-slate-900" />
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">Resumo da geração</p>
            </div>
            {selectedFormats.length > 0 ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {selectedFormats.map((format, index) => (
                  <div key={`selected-format-${format.id}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs font-bold text-white">{index + 1}</span>
                    {format.title}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Nenhum relatório selecionado. Clique em um card para montar a fila de geração.
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Estimativa: aproximadamente {estimatedMinutes} minuto{estimatedMinutes !== 1 ? 's' : ''}, dependendo da quantidade de imagens, dados e capítulos selecionados.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerateQueue}
            disabled={!canGenerate || isBusy || selectedQueue.length === 0}
            className="inline-flex h-12 min-w-[220px] items-center justify-center rounded-xl bg-black px-5 text-sm font-bold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
            Gerar relatórios
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <strong>Uso recomendado:</strong> selecione um ou mais cards conforme a entrega necessária. A geração segue exatamente a fila indicada nos cards.
      </div>
    </section>
  );
}
