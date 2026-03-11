import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function RubricaExporter({ rubricas }) {
  const handleExportExcel = () => {
    // Preparar dados
    const dadosExporte = rubricas
      .filter(r => r.ativo)
      .map(r => ({
        Grupo: r.grupo,
        Rubrica: r.rubrica,
        'Nº de Parcelas': r.numero_parcelas_unidades,
        'Valor da Rubrica': r.valor_rubrica,
        'Valor Utilizado': r.valor_utilizado || 0,
        'Saldo': r.saldo || 0,
        '% Utilizado': ((r.percentual_utilizado || 0).toFixed(2)) + '%',
        'Observação': r.observacao_uso || '',
      }));

    // Calcular totais
    const totais = {
      Grupo: 'TOTAL',
      Rubrica: '',
      'Nº de Parcelas': '',
      'Valor da Rubrica': rubricas.reduce((sum, r) => sum + (r.valor_rubrica || 0), 0),
      'Valor Utilizado': rubricas.reduce((sum, r) => sum + (r.valor_utilizado || 0), 0),
      'Saldo': rubricas.reduce((sum, r) => sum + ((r.saldo || 0)), 0),
      '% Utilizado': rubricas.length > 0 
        ? (((rubricas.reduce((sum, r) => sum + (r.valor_utilizado || 0), 0) / 
           rubricas.reduce((sum, r) => sum + (r.valor_rubrica || 0), 0)) * 100).toFixed(2)) + '%'
        : '0%',
      'Observação': '',
    };

    dadosExporte.push(totais);

    // Criar workbook
    const ws = XLSX.utils.json_to_sheet(dadosExporte);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rubricas');

    // Ajustar largura das colunas
    const colWidths = [
      { wch: 20 },
      { wch: 25 },
      { wch: 18 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 30 },
    ];
    ws['!cols'] = colWidths;

    // Baixar arquivo
    const nomeArquivo = `Rubricas_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
  };

  const handleExportPDF = async () => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF();
    
    // Título
    doc.setFontSize(16);
    doc.text('Relatório de Rubricas - Projeto Museus Centro', 14, 15);
    
    // Data
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 25);

    // Preparar dados
    const dadosTabela = rubricas
      .filter(r => r.ativo)
      .map(r => [
        r.grupo,
        r.rubrica,
        r.numero_parcelas_unidades,
        `R$ ${(r.valor_rubrica || 0).toLocaleString('pt-BR')}`,
        `R$ ${(r.valor_utilizado || 0).toLocaleString('pt-BR')}`,
        `R$ ${(r.saldo || 0).toLocaleString('pt-BR')}`,
        `${(r.percentual_utilizado || 0).toFixed(2)}%`,
      ]);

    // Tabela
    autoTable(doc, {
      head: [['Grupo', 'Rubrica', 'Nº Parcelas', 'Valor da Rubrica', 'Valor Utilizado', 'Saldo', '% Utilizado']],
      body: dadosTabela,
      startY: 35,
      theme: 'grid',
      headStyles: {
        fillColor: [33, 33, 33],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });

    // Rodapé
    const totalPrevisto = rubricas.reduce((sum, r) => sum + (r.valor_rubrica || 0), 0);
    const totalUtilizado = rubricas.reduce((sum, r) => sum + (r.valor_utilizado || 0), 0);
    const saldoTotal = rubricas.reduce((sum, r) => sum + ((r.saldo || 0)), 0);
    const percentualGeral = totalPrevisto > 0 ? ((totalUtilizado / totalPrevisto) * 100).toFixed(2) : 0;

    const yFinal = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Total Previsto: R$ ${totalPrevisto.toLocaleString('pt-BR')}`, 14, yFinal);
    doc.text(`Total Utilizado: R$ ${totalUtilizado.toLocaleString('pt-BR')}`, 14, yFinal + 6);
    doc.text(`Saldo Total: R$ ${saldoTotal.toLocaleString('pt-BR')}`, 14, yFinal + 12);
    doc.text(`% Geral Utilizado: ${percentualGeral}%`, 14, yFinal + 18);

    // Salvar
    doc.save(`Rubricas_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={handleExportExcel}
        className="text-xs gap-2"
      >
        <Download className="w-4 h-4" />
        Exportar Excel
      </Button>
      <Button
        variant="outline"
        onClick={handleExportPDF}
        className="text-xs gap-2"
      >
        <FileText className="w-4 h-4" />
        Exportar PDF
      </Button>
    </div>
  );
}