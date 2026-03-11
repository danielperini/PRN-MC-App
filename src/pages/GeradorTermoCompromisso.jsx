import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Plus, Eye, Download, Check } from 'lucide-react';
import RequireAuth from '@/components/auth/RequireAuth';

const TIPOS_TERMO = {
  monitoria_mediacao: 'Monitoria/Mediação',
  oficina: 'Oficina',
  palestra: 'Palestra',
  acao_cultural: 'Ação Cultural',
  apresentacao_artistica: 'Apresentação Artística',
  projeto_videografico: 'Projeto Videográfico',
  consultoria: 'Consultoria',
  producao_apoio: 'Produção/Apoio',
  expografia: 'Expografia',
  outro: 'Outro'
};

const FORMAS_PAGAMENTO = {
  unica_parcela: 'Única Parcela',
  duas_parcelas: '2 Parcelas',
  tres_parcelas: '3 Parcelas',
  mensal: 'Mensal',
  conforme_realizado: 'Conforme Realizado'
};

export default function GeradorTermoCompromisso() {
  return (
    <RequireAuth requireRole={['COORDENADOR', 'ADMIN']}>
      <GeradorTermoContent />
    </RequireAuth>
  );
}

function GeradorTermoContent() {
  const [formData, setFormData] = useState({
    tipo_termo: 'monitoria_mediacao',
    contratado_nome: '',
    contratado_cpf: '',
    contratado_telefone: '',
    contratado_email: '',
    contratado_endereco: '',
    contratado_banco: '',
    contratado_agencia: '',
    contratado_conta: '',
    objeto: '',
    escopo: '',
    local_execucao: 'Viaduto das Artes',
    data_inicio: '',
    data_fim: '',
    valor_total: '',
    forma_pagamento: 'unica_parcela',
    nota_fiscal_numero: '',
    nota_fiscal_data: '',
    museu: 'Viaduto das Artes',
    observacoes: ''
  });

  const [preview, setPreview] = useState(false);
  const [novoNumero, setNovoNumero] = useState('TC-001/2026');
  const queryClient = useQueryClient();

  const { data: termos = [] } = useQuery({
    queryKey: ['termos'],
    queryFn: () => base44.entities.TermoCompromisso.list()
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['teamMembers'],
    queryFn: () => base44.entities.TeamMember.list()
  });

  // Gerar novo número
  useEffect(() => {
    if (termos.length > 0) {
      const ano = new Date().getFullYear();
      const proximoNum = termos.length + 1;
      setNovoNumero(`TC-${String(proximoNum).padStart(3, '0')}/${ano}`);
    }
  }, [termos]);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.TermoCompromisso.create({
      ...data,
      numero_termo: novoNumero,
      status: 'rascunho'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['termos'] });
      alert('Termo salvo como rascunho!');
    }
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGeneratePDF = async () => {
    try {
      const response = await base44.functions.invoke('generateTermoPDF', {
        ...formData,
        numero_termo: novoNumero
      });

      // Download
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `termo-compromisso-${novoNumero}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

      // Salvar registro
      await saveMutation.mutateAsync({
        ...formData,
        status: 'gerado'
      });
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-slate-900">Gerador de Termo de Compromisso</h1>
          </div>
          <p className="text-slate-600">Crie e exporte termos de compromisso em PDF para prestadores de serviço</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Formulário */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tipo de Termo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tipo de Termo</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={formData.tipo_termo} onValueChange={(value) => handleInputChange('tipo_termo', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS_TERMO).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Dados do Contratado */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dados do Contratado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Nome completo"
                  value={formData.contratado_nome}
                  onChange={(e) => handleInputChange('contratado_nome', e.target.value)}
                />
                <Input
                  placeholder="CPF"
                  value={formData.contratado_cpf}
                  onChange={(e) => handleInputChange('contratado_cpf', e.target.value)}
                />
                <Input
                  placeholder="Telefone"
                  value={formData.contratado_telefone}
                  onChange={(e) => handleInputChange('contratado_telefone', e.target.value)}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={formData.contratado_email}
                  onChange={(e) => handleInputChange('contratado_email', e.target.value)}
                />
                <Textarea
                  placeholder="Endereço completo"
                  value={formData.contratado_endereco}
                  onChange={(e) => handleInputChange('contratado_endereco', e.target.value)}
                  rows={2}
                />
              </CardContent>
            </Card>

            {/* Dados Bancários */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dados Bancários</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Banco"
                  value={formData.contratado_banco}
                  onChange={(e) => handleInputChange('contratado_banco', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="Agência"
                    value={formData.contratado_agencia}
                    onChange={(e) => handleInputChange('contratado_agencia', e.target.value)}
                  />
                  <Input
                    placeholder="Conta"
                    value={formData.contratado_conta}
                    onChange={(e) => handleInputChange('contratado_conta', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Objeto e Escopo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Objeto e Escopo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Descrição do trabalho a ser realizado"
                  value={formData.objeto}
                  onChange={(e) => handleInputChange('objeto', e.target.value)}
                  rows={3}
                />
                <Textarea
                  placeholder="Escopo detalhado (opcional)"
                  value={formData.escopo}
                  onChange={(e) => handleInputChange('escopo', e.target.value)}
                  rows={3}
                />
              </CardContent>
            </Card>

            {/* Local e Prazo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Local e Prazo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Local de execução"
                  value={formData.local_execucao}
                  onChange={(e) => handleInputChange('local_execucao', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    type="date"
                    value={formData.data_inicio}
                    onChange={(e) => handleInputChange('data_inicio', e.target.value)}
                  />
                  <Input
                    type="date"
                    value={formData.data_fim}
                    onChange={(e) => handleInputChange('data_fim', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Valores e Pagamento */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Valores e Pagamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  type="number"
                  placeholder="Valor total (R$)"
                  value={formData.valor_total}
                  onChange={(e) => handleInputChange('valor_total', parseFloat(e.target.value))}
                />
                <Select value={formData.forma_pagamento} onValueChange={(value) => handleInputChange('forma_pagamento', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMAS_PAGAMENTO).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Nota Fiscal */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Nota Fiscal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Número da NF"
                  value={formData.nota_fiscal_numero}
                  onChange={(e) => handleInputChange('nota_fiscal_numero', e.target.value)}
                />
                <Input
                  type="date"
                  placeholder="Data da NF"
                  value={formData.nota_fiscal_data}
                  onChange={(e) => handleInputChange('nota_fiscal_data', e.target.value)}
                />
              </CardContent>
            </Card>

            {/* Observações */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Observações adicionais (opcional)"
                  value={formData.observacoes}
                  onChange={(e) => handleInputChange('observacoes', e.target.value)}
                  rows={3}
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Info Box */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-lg text-blue-900">Novo Termo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-blue-800 mb-4">
                  Preencha todos os campos obrigatórios e gere o PDF para download e assinatura.
                </p>
                <div className="bg-white p-3 rounded border border-blue-200 mb-4">
                  <p className="text-xs text-blue-600 font-mono">Número: {novoNumero}</p>
                </div>
              </CardContent>
            </Card>

            {/* Ações */}
            <div className="space-y-3">
              <Dialog open={preview} onOpenChange={setPreview}>
                <DialogTrigger asChild>
                  <Button className="w-full gap-2" variant="outline">
                    <Eye className="w-4 h-4" />
                    Pré-visualizar
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Pré-visualização do Termo</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 text-sm">
                    <div>
                      <p className="font-bold">Número: {novoNumero}</p>
                      <p>Tipo: {TIPOS_TERMO[formData.tipo_termo]}</p>
                    </div>
                    <div>
                      <p className="font-bold mb-2">Contratado:</p>
                      <p>{formData.contratado_nome} - CPF: {formData.contratado_cpf}</p>
                    </div>
                    <div>
                      <p className="font-bold mb-2">Objeto:</p>
                      <p>{formData.objeto}</p>
                    </div>
                    <div>
                      <p className="font-bold mb-2">Período:</p>
                      <p>{formData.data_inicio} a {formData.data_fim}</p>
                    </div>
                    <div>
                      <p className="font-bold mb-2">Valor:</p>
                      <p>R$ {parseFloat(formData.valor_total || 0).toFixed(2).replace('.', ',')}</p>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button 
                className="w-full gap-2 bg-green-600 hover:bg-green-700" 
                onClick={handleGeneratePDF}
                disabled={!formData.contratado_nome || !formData.objeto || !formData.data_inicio || !formData.data_fim || !formData.valor_total}
              >
                <Download className="w-4 h-4" />
                Gerar PDF
              </Button>

              <Button 
                className="w-full gap-2" 
                variant="outline"
                onClick={() => saveMutation.mutate(formData)}
              >
                <Check className="w-4 h-4" />
                Salvar Rascunho
              </Button>
            </div>

            {/* Histórico */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Últimos Termos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {termos.slice(-5).reverse().map(termo => (
                    <div key={termo.id} className="text-xs p-2 bg-slate-50 rounded border border-slate-200">
                      <p className="font-mono font-bold">{termo.numero_termo}</p>
                      <p className="text-slate-600">{termo.contratado_nome}</p>
                      <p className="text-slate-500">{TIPOS_TERMO[termo.tipo_termo]}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}