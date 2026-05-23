import React from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Camera,
  FileText,
  Image,
  Layers3,
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

  return (
    <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            Formatos de entrega
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-black md:text-3xl">
            Relatórios que o app pode gerar
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Clique em um card para resetar a geração anterior e criar o PDF correspondente com dados reais do sistema:
            relatórios aprovados, programação, público, metas, rubricas, compras, documentos fiscais, fotos, GPS e evidências.
          </p>
        </div>
        <div className="rounded-2xl border border-black bg-black px-4 py-3 text-white">
          <span className="block text-xs uppercase tracking-[0.18em] text-white/70">Saída principal</span>
          <strong className="block text-lg">PDF A4 + HTML de prévia</strong>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_FORMATS.map((format) => {
          const Icon = format.icon;
          const isActive = activeFormat === format.id;
          const disabled = loading && !isActive;
          const CardTag = canGenerate ? 'button' : 'article';

          return (
            <CardTag
              key={format.id}
              type={canGenerate ? 'button' : undefined}
              disabled={canGenerate ? disabled : undefined}
              onClick={canGenerate ? () => onGenerate(format.id) : undefined}
              className={`group flex min-h-[230px] w-full flex-col rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 ${
                format.featured
                  ? 'border-black bg-black text-white hover:bg-slate-900'
                  : 'border-slate-200 bg-slate-50 hover:border-black hover:bg-white hover:shadow-md'
              } ${disabled ? 'cursor-not-allowed opacity-50' : canGenerate ? 'cursor-pointer' : ''}`}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className={`rounded-2xl border p-3 ${format.featured ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-black group-hover:border-black'}`}>
                  {isActive ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${format.featured ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>
                  {isActive ? 'Gerando' : canGenerate ? 'Gerar' : 'Ativo'}
                </span>
              </div>

              <h3 className={`text-base font-bold leading-tight ${format.featured ? 'text-white' : 'text-black'}`}>{format.title}</h3>
              <p className={`mt-2 flex-1 text-sm leading-6 ${format.featured ? 'text-white/75' : 'text-slate-600'}`}>{format.description}</p>

              <div className={`mt-4 space-y-2 border-t pt-4 text-xs leading-5 ${format.featured ? 'border-white/20 text-white/75' : 'border-slate-200 text-slate-600'}`}>
                <p><strong className={format.featured ? 'text-white' : 'text-black'}>Fonte:</strong> {format.source}</p>
                <p><strong className={format.featured ? 'text-white' : 'text-black'}>Entrega:</strong> {format.output}</p>
              </div>
            </CardTag>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <strong>Uso recomendado:</strong> use “Relatório geral completo” para prestação institucional completa.
        Use os cards específicos quando precisar gerar apenas galeria, atividades, público, metas, documentos fiscais ou recorte por museu.
      </div>
    </section>
  );
}
