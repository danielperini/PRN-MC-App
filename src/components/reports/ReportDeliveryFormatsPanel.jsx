import React from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Camera,
  FileText,
  Image,
  Layers3,
  MapPin,
  ReceiptText,
  Target,
  Users,
} from 'lucide-react';

const REPORT_FORMATS = [
  {
    title: 'Relatório editorial',
    description: 'Publicação institucional com capa, expediente, introdução, território, comunicação, síntese, governança e conclusão.',
    source: 'Relatórios aprovados, programação, indicadores e textos editoriais do app.',
    output: 'PDF A4 institucional',
    icon: FileText,
  },
  {
    title: 'Relatório físico-financeiro',
    description: 'Consolida execução física, rubricas, valores previstos, utilizados, saldos, aprovações, compras e pagamentos.',
    source: 'Rubrica, PurchaseRequest, TeamPayment, DocumentIntake e anexos fiscais.',
    output: 'PDF de prestação de contas',
    icon: BarChart3,
  },
  {
    title: 'Relatório de galeria',
    description: 'Organiza imagens como evidências visuais, evitando repetição e mantendo vínculo com museu, atividade, data, legenda e origem.',
    source: 'Fotos, anexos, metadados, vínculos de atividade e registros de galeria.',
    output: 'PDF visual de evidências',
    icon: Image,
  },
  {
    title: 'Relatório por museu',
    description: 'Separa leitura por MIS, MHAB, MUMO ou atuação geral, preservando indicadores, público, atividades, evidências e financeiro por unidade.',
    source: 'Filtro Museu no gerador e campos museu/centro de custo dos registros.',
    output: 'PDF por equipamento cultural',
    icon: Building2,
  },
  {
    title: 'Relatório por atividade',
    description: 'Apresenta atividades registradas com data, museu, natureza, descrição, resultados, público, autoria e anexos vinculados.',
    source: 'Atividades dentro dos relatórios aprovados e programação vinculada.',
    output: 'PDF de atividades',
    icon: CalendarDays,
  },
  {
    title: 'Relatório por período',
    description: 'Gera recorte por data inicial e final, permitindo consolidar mês, trimestre, etapa do aditivo ou período customizado.',
    source: 'Filtros de data do gerador e registros datados no app.',
    output: 'PDF por recorte temporal',
    icon: Layers3,
  },
  {
    title: 'Relatório com fotos',
    description: 'Inclui fotos selecionadas no corpo das atividades e separa a galeria completa como anexo visual quando necessário.',
    source: 'Fotos vinculadas às atividades, anexos e biblioteca de mídia.',
    output: 'PDF com evidências fotográficas',
    icon: Camera,
  },
  {
    title: 'Relatório com GPS',
    description: 'Preserva localização, coordenadas e referência territorial quando os dados existem no app ou nos metadados das evidências.',
    source: 'Campos de localização, coordenadas, equipamento cultural e metadados das imagens.',
    output: 'PDF com rastreabilidade espacial',
    icon: MapPin,
  },
  {
    title: 'Relatório com público',
    description: 'Distingue público informado, estimado, consolidado por museu e total geral, evitando casas decimais e duplicidade de contagem.',
    source: 'Campos de público das atividades, relatórios e indicadores oficiais do dashboard.',
    output: 'PDF com indicadores de alcance',
    icon: Users,
  },
  {
    title: 'Relatório com metas',
    description: 'Relaciona atividades, rubricas, execução financeira e entregas às metas do 3º Aditivo.',
    source: 'Metas, rubricas, programação, atividades e solicitações financeiras vinculadas.',
    output: 'PDF de execução de metas',
    icon: Target,
  },
  {
    title: 'Relatório com documentos fiscais',
    description: 'Lista notas fiscais, XML, contratos, comprovantes, recibos e vínculos documentais usados na prestação de contas.',
    source: 'DocumentIntake, Attachment, PurchaseRequest, TeamPayment e vínculos PDF/XML/comprovantes.',
    output: 'PDF documental e fiscal',
    icon: ReceiptText,
  },
  {
    title: 'Volumes em PDF',
    description: 'Divide a publicação em três volumes editoriais com continuidade de numeração e sumário comum entre os arquivos.',
    source: 'Plano de volumes do gerador e capítulos selecionados.',
    output: 'Volume 1, Volume 2 e Volume 3',
    icon: Layers3,
  },
];

export default function ReportDeliveryFormatsPanel() {
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
            A geração abaixo usa os dados reais do sistema: relatórios aprovados, programação,
            público, metas, rubricas, compras, documentos fiscais, fotos, GPS e evidências.
            O objetivo é transformar a operação diária em prestação de contas institucional.
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
          return (
            <article
              key={format.title}
              className="group flex min-h-[220px] flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-black hover:bg-white hover:shadow-md"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 text-black group-hover:border-black">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Ativo
                </span>
              </div>

              <h3 className="text-base font-bold leading-tight text-black">{format.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{format.description}</p>

              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-600">
                <p><strong className="text-black">Fonte:</strong> {format.source}</p>
                <p><strong className="text-black">Entrega:</strong> {format.output}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <strong>Uso recomendado:</strong> para relatório institucional completo, gere os três volumes.
        Para conferência rápida, use o relatório de dados. Para comprovação visual, gere o relatório de galeria.
        Para fiscalização por unidade, filtre por museu antes de gerar.
      </div>
    </section>
  );
}
