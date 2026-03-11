import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { FileText, Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

export default function AnnualAccountingExport() {
  const [open, setOpen] = useState(false);
  const [selectedMuseu, setSelectedMuseu] = useState('');
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!selectedMuseu || !selectedYear) {
      toast.error('Selecione museu e ano');
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('generateAnnualAccountingReport', {
        museu: selectedMuseu,
        year: parseInt(selectedYear)
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prestacao_contas_${selectedMuseu}_${selectedYear}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('PDF gerado e baixado com sucesso!');
      setOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Erro ao gerar PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          title="Gerar prestação de contas anual consolidada"
        >
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">Prestação de Contas Anual</span>
          <span className="sm:hidden">Contas Anual</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar Prestação de Contas Anual</DialogTitle>
          <DialogDescription>
            Consolida todos os relatórios aprovados do ano em um PDF estruturado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Museu</label>
            <Select value={selectedMuseu} onValueChange={setSelectedMuseu}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o museu" />
              </SelectTrigger>
              <SelectContent>
                {MUSEUS.map(museu => (
                  <SelectItem key={museu} value={museu}>
                    {museu}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Ano</label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o ano" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map(year => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
            Será consolidado um PDF com todos os relatórios aprovados de {selectedMuseu || 'museu selecionado'} em {selectedYear}.
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={!selectedMuseu || !selectedYear || loading}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Gerar PDF
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}