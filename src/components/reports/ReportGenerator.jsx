import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ReportGenerator({ reportId, report }) {
  const [showDialog, setShowDialog] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [signatureName, setSignatureName] = useState('');
  const [selectedSections, setSelectedSections] = useState({
    identificacao: true,
    atividades: true,
    oportunidades: true,
    avaliacao: true,
    comentarios: true,
    historico: false,
  });

  useEffect(() => {
    const loadUser = async () => {
      const user = await base44.auth.me();
      setCurrentUser(user);
      setSignatureName(user?.full_name || '');
    };
    loadUser();
  }, []);

  if (!reportId || !report) return null;

  const generatePDF = async () => {
    setGenerating(true);
    try {
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

      // Identificação
      if (selectedSections.identificacao) {
        addTitle('RELATÓRIO MENSAL', 20);
        addText(`Período: ${report.mes_referencia} de ${report.ano}`, 12);
        addText(`Profissional: ${report.author_name}`, 11);
        addText(`Função: ${report.funcao}`, 11);
        addText(`Museu: ${report.museu}`, 11);
        if (report.numero_protocolo) {
          addText(`Protocolo: ${report.numero_protocolo}`, 11);
        }
        yPosition += 10;

        if (report.resumo_executivo) {
          checkPageBreak(40);
          addTitle('RESUMO EXECUTIVO', 14);
          addText(report.resumo_executivo, 10);
        }
      }

      // Atividades
      if (selectedSections.atividades && report.atividades && report.atividades.length > 0) {
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
      if (selectedSections.avaliacao && (report.avaliacao_pontos_positivos || report.avaliacao_desafios || report.avaliacao_sugestoes)) {
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
      if (selectedSections.oportunidades && report.oportunidades && report.oportunidades.length > 0) {
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

      // Status de Aprovação
      checkPageBreak(30);
      addTitle('STATUS DO RELATÓRIO', 14);
      const statusLabels = {
        DRAFT: 'Rascunho',
        SUBMITTED: 'Enviado para Revisão',
        IN_REVIEW: 'Em Revisão pela Coordenação',
        RETURNED: 'Devolvido para Correção',
        APPROVED: 'APROVADO PELA COORDENAÇÃO',
        ARCHIVED: 'Arquivado',
      };
      const statusLabel = statusLabels[report.status] || report.status || '—';
      const isApproved = report.status === 'APPROVED';
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(isApproved ? 22 : 50, isApproved ? 163 : 50, isApproved ? 74 : 50);
      doc.text(statusLabel, margin, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += 7;
      if (isApproved && report.reviewer_name) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(`Aprovado por: ${report.reviewer_name}`, margin, yPosition);
        yPosition += 5;
      }
      yPosition += 5;

      // Anexos
      if (selectedSections.comentarios) {
        checkPageBreak(30);
        addTitle('ARQUIVOS ANEXADOS', 14);
        if (attachments.length === 0) {
          addText('Nenhum arquivo anexado a este relatório.', 9);
        } else {
          addText(`Total de arquivos: ${attachments.length}`, 10, true);
          yPosition += 3;

          for (let i = 0; i < attachments.length; i++) {
            const att = attachments[i];
            checkPageBreak(35);
            const isImage = att.file_type && att.file_type.startsWith('image/');
            const fileLabel = `${i + 1}. ${att.file_name || 'Arquivo'}`;
            const sizeKb = att.file_size ? `(${(att.file_size / 1024).toFixed(1)} KB)` : '';
            const typeLabel = att.file_type || '';

            if (isImage && att.file_url) {
              try {
                const img = await new Promise((resolve, reject) => {
                  const imgEl = new Image();
                  imgEl.crossOrigin = 'anonymous';
                  imgEl.onload = () => resolve(imgEl);
                  imgEl.onerror = reject;
                  imgEl.src = att.file_url;
                });
                const canvas = document.createElement('canvas');
                const MAX = 200;
                const scale = Math.min(MAX / img.width, MAX / img.height, 1);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                const thumbW = 30;
                const thumbH = (canvas.height / canvas.width) * thumbW;
                checkPageBreak(thumbH + 10);
                doc.addImage(dataUrl, 'JPEG', margin, yPosition, thumbW, thumbH);
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.text(`${fileLabel} ${sizeKb}`, margin + thumbW + 4, yPosition + thumbH / 2);
                yPosition += thumbH + 4;
              } catch (_) {
                addText(`${fileLabel} [imagem] ${sizeKb}`, 9);
              }
            } else {
              addText(`${fileLabel} · ${typeLabel} ${sizeKb}`, 9);
            }
          }
        }
      }
      yPosition += 5;

      // Assinatura
      checkPageBreak(20);
      yPosition += 10;
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text('Assinado por:', margin, yPosition);
      yPosition += 5;
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text(signatureName || '___________________________', margin, yPosition);

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
      setShowDialog(false);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF. Tente novamente.');
    } finally {
      setGenerating(false);
    }
  };

  const handleGeneratePDF = async () => {
    setGenerating(true);
    await generatePDF();
  };

  const toggleSection = (section) => {
    setSelectedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        disabled={generating}
        className="gap-2 bg-black hover:bg-gray-800 text-white"
      >
        <FileText className="w-4 h-4" />
        Gerar PDF
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Relatório PDF</DialogTitle>
            <DialogDescription>Selecione as seções a incluir no PDF</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Seções */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="sec-identificacao" 
                  checked={selectedSections.identificacao}
                  onCheckedChange={() => toggleSection('identificacao')}
                />
                <Label htmlFor="sec-identificacao" className="cursor-pointer">Identificação</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="sec-atividades" 
                  checked={selectedSections.atividades}
                  onCheckedChange={() => toggleSection('atividades')}
                />
                <Label htmlFor="sec-atividades" className="cursor-pointer">Atividades</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="sec-oportunidades" 
                  checked={selectedSections.oportunidades}
                  onCheckedChange={() => toggleSection('oportunidades')}
                />
                <Label htmlFor="sec-oportunidades" className="cursor-pointer">Oportunidades</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="sec-avaliacao" 
                  checked={selectedSections.avaliacao}
                  onCheckedChange={() => toggleSection('avaliacao')}
                />
                <Label htmlFor="sec-avaliacao" className="cursor-pointer">Avaliação</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="sec-comentarios" 
                  checked={selectedSections.comentarios}
                  onCheckedChange={() => toggleSection('comentarios')}
                />
                <Label htmlFor="sec-comentarios" className="cursor-pointer">Comentários</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox 
                  id="sec-historico" 
                  checked={selectedSections.historico}
                  onCheckedChange={() => toggleSection('historico')}
                />
                <Label htmlFor="sec-historico" className="cursor-pointer">Histórico</Label>
              </div>
            </div>

            {/* Assinatura */}
            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm font-semibold">Nome para Assinatura</Label>
              <Input
                value={signatureName}
                onChange={e => setSignatureName(e.target.value)}
                placeholder="Digite seu nome"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button 
              onClick={handleGeneratePDF} 
              disabled={generating}
              className="bg-black hover:bg-gray-800 text-white gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Gerar PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}