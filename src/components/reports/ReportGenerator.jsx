import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, FileJson, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportGenerator({ reportId, report }) {
  const [format, setFormat] = useState('pdf'); // pdf or csv
  const [generating, setGenerating] = useState(false);

  if (!reportId || !report) return null;

  const generatePDF = async () => {
    setGenerating(true);
    try {
      // Fetch attachments for this report
      let attachments = [];
      try {
        attachments = await base44.entities.Attachment.filter({ report_id: reportId });
      } catch (_) {}

      const { jsPDF } = await import('jspdf');

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      // Helper functions
      const addTitle = (text, size = 16) => {
        doc.setFontSize(size);
        doc.setFont(undefined, 'bold');
        doc.text(text, margin, yPosition);
        yPosition += size / 2 + 5;
      };

      const addText = (text, size = 10, isBold = false) => {
        doc.setFontSize(size);
        doc.setFont(undefined, isBold ? 'bold' : 'normal');
        const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
        doc.text(lines, margin, yPosition);
        yPosition += lines.length * (size / 2.5) + 2;
      };

      const addNewPage = () => {
        doc.addPage();
        yPosition = margin;
      };

      const checkPageBreak = (minSpace = 30) => {
        if (yPosition + minSpace > pageHeight - margin) {
          addNewPage();
        }
      };

      // Cover page
      addTitle('RELATÓRIO MENSAL', 20);
      addText(`Período: ${report.mes_referencia} de ${report.ano}`, 12);
      addText(`Profissional: ${report.author_name}`, 11);
      addText(`Função: ${report.funcao}`, 11);
      addText(`Museu: ${report.museu}`, 11);
      if (report.numero_protocolo) {
        addText(`Protocolo: ${report.numero_protocolo}`, 11);
      }
      yPosition += 10;

      // Resumo Executivo
      if (report.resumo_executivo) {
        checkPageBreak(40);
        addTitle('RESUMO EXECUTIVO', 14);
        addText(report.resumo_executivo, 10);
      }

      // Atividades
      if (report.atividades && report.atividades.length > 0) {
        checkPageBreak(40);
        addTitle('ATIVIDADES EXECUTADAS', 14);
        addText(`Total: ${report.atividades.length} atividade(s)`, 10);
        yPosition += 5;

        report.atividades.forEach((ativ, idx) => {
          checkPageBreak(50);
          addText(`${idx + 1}. ${ativ.nome || 'Atividade sem nome'}`, 10, true);
          if (ativ.tipo_acao) addText(`Tipo: ${ativ.tipo_acao}`, 9);
          if (ativ.data_inicio) addText(`Data: ${ativ.data_inicio}`, 9);
          if (ativ.museu) addText(`Local: ${ativ.museu}`, 9);
          if (ativ.publico_estimado) addText(`Público: ${ativ.publico_estimado} pessoas`, 9);
          if (ativ.descricao_executado) addText(`Descrição: ${ativ.descricao_executado}`, 9);
          if (ativ.resultados_impactos) addText(`Resultados: ${ativ.resultados_impactos}`, 9);
          if (ativ.classificacao) addText(`Classificação: ${ativ.classificacao}`, 9);
          yPosition += 3;
        });
      }

      // Avaliação
      if (report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes) {
        checkPageBreak(40);
        addTitle('AVALIAÇÃO DO PERÍODO', 14);
        
        if (report.avaliacao_pontos_positivos) {
          addText('Pontos Positivos:', 10, true);
          addText(report.avaliacao_pontos_positivos, 9);
          yPosition += 3;
        }
        
        if (report.avaliacao_desafios) {
          addText('Dificuldades Enfrentadas:', 10, true);
          addText(report.avaliacao_desafios, 9);
          yPosition += 3;
        }
        
        if (report.avaliacao_sugestoes) {
          addText('Sugestões de Melhoria:', 10, true);
          addText(report.avaliacao_sugestoes, 9);
          yPosition += 3;
        }
      }

      // Oportunidades
      if (report.oportunidades && report.oportunidades.length > 0) {
        checkPageBreak(40);
        addTitle('OPORTUNIDADES IDENTIFICADAS', 14);
        report.oportunidades.forEach((op, idx) => {
          checkPageBreak(30);
          addText(`${idx + 1}. ${op.descricao || 'Oportunidade'}`, 10, true);
          if (op.categoria) addText(`Categoria: ${op.categoria}`, 9);
          if (op.impacto) addText(`Impacto: ${op.impacto}`, 9);
          yPosition += 3;
        });
      }

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Gerado em ${new Date().toLocaleDateString('pt-BR')} · Museus Centro`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );

      const filename = `Relatorio_${report.mes_referencia}_${report.ano}_${report.author_name.replace(/\s+/g, '_')}.pdf`;
      doc.save(filename);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const generateCSV = async () => {
    setGenerating(true);
    try {
      // Header
      const headers = [
        'Nome da Atividade',
        'Tipo',
        'Data Início',
        'Data Fim',
        'Museu',
        'Público Estimado',
        'Classificação',
        'Meta',
        'Descrição',
        'Resultados',
        'Status Meta'
      ];

      const rows = (report.atividades || []).map(a => [
        a.nome || '',
        a.tipo_acao || '',
        a.data_inicio || '',
        a.data_fim || '',
        a.museu || '',
        a.publico_estimado || '',
        a.classificacao || '',
        a.meta_codigo || '',
        (a.descricao_executado || '').replace(/"/g, '""'), // Escape quotes
        (a.resultados_impactos || '').replace(/"/g, '""'),
        a.status_meta || ''
      ]);

      // Build CSV
      const csv = [
        headers.map(h => `"${h}"`).join(','),
        ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      // Download
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Atividades_${report.mes_referencia}_${report.ano}.csv`);
      link.click();
      URL.revokeObjectURL(url);

      toast.success('CSV exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar CSV:', error);
      toast.error('Erro ao exportar CSV. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (format === 'pdf') {
      await generatePDF();
    } else if (format === 'csv') {
      await generateCSV();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={format} onValueChange={setFormat} disabled={generating}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Formato" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pdf">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              PDF
            </div>
          </SelectItem>
          <SelectItem value="csv">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4" />
              CSV
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        onClick={handleGenerate}
        disabled={generating}
        className="gap-2 bg-black hover:bg-gray-800 text-white"
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Gerando...
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Gerar Relatório
          </>
        )}
      </Button>
    </div>
  );
}