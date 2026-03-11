import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Loader2, Upload } from 'lucide-react';

export default function ImportarRubricasAtualizadas({ isOpen, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const rubricasAtualizadas = [
    {
      codigo: 'MC3A-EQ-001',
      nome: 'Coordenador Geral',
      categoria: 'Equipe e gestão',
      tipo: 'mensal',
      descricao: 'Coordenação geral do projeto — 10 meses',
      parcelas_ou_unidades: 10,
      valor_total: 70000,
      valor_comprometido: 7000,
      valor_pago: 0,
      observacao: 'Valor utilizado acumulado'
    },
    {
      codigo: 'MC3A-EQ-002',
      nome: 'Assistente de Coordenação e Produção',
      categoria: 'Equipe e gestão',
      tipo: 'lote',
      descricao: 'Assistência em coordenação e produção',
      parcelas_ou_unidades: 1,
      valor_total: 50000,
      valor_comprometido: 5000,
      valor_pago: 0,
      observacao: 'Valor utilizado acumulado'
    },
    {
      codigo: 'MC3A-EQ-003',
      nome: 'Coordenador de Comunicação',
      categoria: 'Equipe e gestão',
      tipo: 'mensal',
      descricao: 'Coordenação de comunicação — 10 meses',
      parcelas_ou_unidades: 10,
      valor_total: 60000,
      valor_comprometido: 6000,
      valor_pago: 0,
      observacao: 'Valor utilizado acumulado'
    },
    {
      codigo: 'MC3A-EQ-004',
      nome: 'Analista Administrativo-Financeira',
      categoria: 'Equipe e gestão',
      tipo: 'mensal',
      descricao: 'Análise administrativo-financeira — 10 meses',
      parcelas_ou_unidades: 10,
      valor_total: 50000,
      valor_comprometido: 5000,
      valor_pago: 0,
      observacao: 'Valor utilizado acumulado'
    },
    {
      codigo: 'MC3A-EQ-005',
      nome: 'Assistente Administrativo',
      categoria: 'Equipe e gestão',
      tipo: 'mensal',
      descricao: 'Assistência administrativa — 10 meses',
      parcelas_ou_unidades: 10,
      valor_total: 40000,
      valor_comprometido: 4000,
      valor_pago: 0,
      observacao: 'Valor utilizado acumulado'
    },
    {
      codigo: 'MC3A-EQ-006',
      nome: 'Produção MIS/MUMO/MHAB',
      categoria: 'Equipe e gestão',
      tipo: 'mensal',
      descricao: 'Produção para os três museus — 10 meses',
      parcelas_ou_unidades: 10,
      valor_total: 113400,
      valor_comprometido: 12600,
      valor_pago: 0,
      observacao: 'Soma de 3 produtoras'
    },
    {
      codigo: 'MC3A-EQ-007',
      nome: 'Assessor de Imprensa',
      categoria: 'Equipe e gestão',
      tipo: 'mensal',
      descricao: 'Assessoria de imprensa — 10 meses',
      parcelas_ou_unidades: 10,
      valor_total: 27000,
      valor_comprometido: 3000,
      valor_pago: 0,
      observacao: 'Valor utilizado acumulado'
    },
    {
      codigo: 'MC3A-EQ-008',
      nome: 'Designer',
      categoria: 'Equipe e gestão',
      tipo: 'mensal',
      descricao: 'Design e identidade visual — 10 meses',
      parcelas_ou_unidades: 10,
      valor_total: 52000,
      valor_comprometido: 5200,
      valor_pago: 0,
      observacao: 'Soma de 2 designers'
    },
    {
      codigo: 'MC3A-OP-001',
      nome: 'Educador MIS / MUMO / MHAB',
      categoria: 'Manutenção e operação',
      tipo: 'mensal',
      descricao: 'Educadores para os três museus — 10 meses',
      parcelas_ou_unidades: 10,
      valor_total: 138000,
      valor_comprometido: 18400,
      valor_pago: 0,
      observacao: 'Soma de 4 educadoras'
    },
    {
      codigo: 'MC3A-DG-001',
      nome: 'Assessoria jurídica',
      categoria: 'Despesas gerais',
      tipo: 'servico',
      descricao: 'Serviço de assessoria jurídica',
      parcelas_ou_unidades: 1,
      valor_total: 17000,
      valor_comprometido: 1700,
      valor_pago: 0,
      observacao: 'Valor utilizado acumulado'
    }
  ];

  const handleImport = async () => {
    try {
      setLoading(true);
      
      // Deletar rubricas antigo (MC3A) existentes
      const existing = await base44.entities.BudgetLine.list('codigo', 500);
      const toDelete = existing.filter(b => b.codigo?.startsWith('MC3A'));
      
      for (const item of toDelete) {
        await base44.entities.BudgetLine.delete(item.id);
      }

      // Importar novas rubricas
      const created = await base44.entities.BudgetLine.bulkCreate(rubricasAtualizadas);
      
      setResult({
        success: true,
        count: created.length,
        message: `${created.length} rubricas importadas com valores atualizados`
      });

      setTimeout(() => {
        onSuccess?.();
      }, 2000);
    } catch (error) {
      setResult({
        success: false,
        message: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Rubricas Atualizadas</DialogTitle>
          <DialogDescription>
            Carregará as 10 rubricas com valores utilizados já consolidados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-blue-900">Será importado:</p>
            <ul className="text-sm text-blue-800 space-y-1 ml-4">
              <li>✓ 10 rubricas do 3º Aditivo</li>
              <li>✓ Total na rubrica: R$ 617.400,00</li>
              <li>✓ Valor utilizado: R$ 67.900,00</li>
              <li>✓ Saldo: R$ 549.500,00</li>
            </ul>
          </div>

          {/* Preview da tabela */}
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Rubrica</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2 text-right">Utilizado</th>
                  <th className="p-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {rubricasAtualizadas.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{r.nome}</td>
                    <td className="p-2 text-right">R$ {r.valor_total.toLocaleString('pt-BR')}</td>
                    <td className="p-2 text-right text-blue-600 font-medium">R$ {r.valor_comprometido.toLocaleString('pt-BR')}</td>
                    <td className="p-2 text-right">{(r.valor_total - r.valor_comprometido).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Resultado */}
          {result && (
            <div className={`rounded-lg p-4 flex gap-3 ${
              result.success
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <p className={`text-sm font-medium ${
                result.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {result.message}
              </p>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={loading}
            className="bg-black hover:bg-gray-800 text-white"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importar Rubricas
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}