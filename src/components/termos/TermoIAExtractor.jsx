import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Sparkles, AlertTriangle, CheckCircle, X, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function TermoIAExtractor({ projetoConfig, onDadosExtraidos }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [dadosExtraidos, setDadosExtraidos] = useState(null);
  const [divergencias, setDivergencias] = useState([]);
  const [divergenciasResolvidas, setDivergenciasResolvidas] = useState({});
  const inputRef = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setArquivo(file);
    await processarArquivo(file);
  };

  const processarArquivo = async (file) => {
    setIsUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setIsUploading(false);
      setIsExtracting(true);

      const res = await base44.functions.invoke('extrairDadosContratoIA', {
        file_url,
        projeto_config: projetoConfig,
      });

      const dados = res.data?.dados || {};
      const divs = dados.divergencias || [];
      setDadosExtraidos(dados);
      setDivergencias(divs);
      setDivergenciasResolvidas({});
    } catch (err) {
      toast.error('Erro ao extrair dados: ' + err.message);
    } finally {
      setIsUploading(false);
      setIsExtracting(false);
    }
  };

  const resolverDivergencia = (campo, usarDocumento) => {
    setDivergenciasResolvidas(prev => ({ ...prev, [campo]: usarDocumento ? 'documento' : 'padrao' }));
  };

  const confirmarDados = () => {
    if (!dadosExtraidos) return;

    // Aplica resoluções de divergências
    const dadosFinal = { ...dadosExtraidos };
    for (const div of divergencias) {
      const resolucao = divergenciasResolvidas[div.campo];
      if (resolucao === 'padrao') {
        delete dadosFinal[div.campo]; // remove para manter o padrão
      }
    }

    // Mapeia campos extraídos para o formato do formulário
    const mapped = {
      contratado_nome: dadosFinal.contratado_nome || '',
      contratado_cpf_cnpj: dadosFinal.contratado_cpf_cnpj || '',
      contratado_representante: dadosFinal.contratado_representante || '',
      contratado_cpf_representante: dadosFinal.contratado_cpf_representante || '',
      contratado_endereco: dadosFinal.contratado_endereco || '',
      contratado_telefone: dadosFinal.contratado_telefone || '',
      contratado_email: dadosFinal.contratado_email || '',
      funcao_projeto: dadosFinal.funcao_projeto || '',
      objeto: dadosFinal.objeto || '',
      escopo: dadosFinal.escopo || '',
      valor_total: dadosFinal.valor_total || '',
      detalhamento_valores: dadosFinal.detalhamento_valores || '',
      forma_pagamento: dadosFinal.forma_pagamento || '',
      periodo_execucao: dadosFinal.periodo_execucao || '',
      museu_local: dadosFinal.museu_local || '',
      banco: dadosFinal.banco || '',
      agencia: dadosFinal.agencia || '',
      conta: dadosFinal.conta || '',
      pix: dadosFinal.pix || '',
      testemunha1_nome: dadosFinal.testemunha1_nome || '',
      testemunha1_cpf: dadosFinal.testemunha1_cpf || '',
      testemunha2_nome: dadosFinal.testemunha2_nome || '',
      testemunha2_cpf: dadosFinal.testemunha2_cpf || '',
      data_assinatura: dadosFinal.data_assinatura || '',
      cidade_assinatura: dadosFinal.cidade_assinatura || 'Belo Horizonte',
      dados_extraidos_ia: dadosFinal,
      divergencias_ia: divergencias,
    };

    onDadosExtraidos(mapped);
    toast.success('Dados aplicados ao formulário! Revise antes de gerar o PDF.');
  };

  const limpar = () => {
    setArquivo(null);
    setDadosExtraidos(null);
    setDivergencias([]);
    setDivergenciasResolvidas({});
    if (inputRef.current) inputRef.current.value = '';
  };

  const loading = isUploading || isExtracting;
  const divergenciasPendentes = divergencias.filter(d => !divergenciasResolvidas[d.campo]);

  return (
    <Card className="border-purple-200 bg-purple-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-purple-800">
          <Sparkles className="w-4 h-4" />
          Extração automática por IA
        </CardTitle>
        <p className="text-xs text-purple-600">Anexe um contrato ou documento-base para pré-preencher o formulário automaticamente.</p>
      </CardHeader>
      <CardContent>
        {!dadosExtraidos ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="w-full border-purple-300 text-purple-700 hover:bg-purple-100"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isUploading ? 'Enviando arquivo...' : 'Extraindo dados com IA...'}
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Anexar contrato/documento-base
                </>
              )}
            </Button>
            {arquivo && !loading && (
              <p className="text-xs text-purple-600 mt-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> {arquivo.name}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Resumo dos dados extraídos */}
            <div className="bg-white rounded-lg border border-purple-200 p-3 space-y-1">
              <p className="text-xs font-semibold text-purple-800 mb-2">✓ Dados extraídos do documento</p>
              {dadosExtraidos.contratado_nome && (
                <p className="text-xs text-slate-700"><span className="font-medium">Contratado:</span> {dadosExtraidos.contratado_nome}</p>
              )}
              {dadosExtraidos.contratado_cpf_cnpj && (
                <p className="text-xs text-slate-700"><span className="font-medium">CPF/CNPJ:</span> {dadosExtraidos.contratado_cpf_cnpj}</p>
              )}
              {dadosExtraidos.funcao_projeto && (
                <p className="text-xs text-slate-700"><span className="font-medium">Função:</span> {dadosExtraidos.funcao_projeto}</p>
              )}
              {dadosExtraidos.valor_total && (
                <p className="text-xs text-slate-700"><span className="font-medium">Valor:</span> R$ {dadosExtraidos.valor_total}</p>
              )}
              {dadosExtraidos.periodo_execucao && (
                <p className="text-xs text-slate-700"><span className="font-medium">Vigência:</span> {dadosExtraidos.periodo_execucao}</p>
              )}
              {dadosExtraidos.pix && (
                <p className="text-xs text-slate-700"><span className="font-medium">PIX:</span> {dadosExtraidos.pix}</p>
              )}
            </div>

            {/* Divergências */}
            {divergencias.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {divergencias.length} divergência(s) encontrada(s)
                </p>
                {divergencias.map((div, idx) => (
                  <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs">
                    <p className="font-medium text-amber-800 mb-1">{div.descricao || div.campo}</p>
                    <p className="text-amber-700 mb-2">
                      <span className="font-medium">No documento:</span> {div.valor_documento}<br />
                      <span className="font-medium">Padrão esperado:</span> {div.valor_padrao}
                    </p>
                    {!divergenciasResolvidas[div.campo] ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => resolverDivergencia(div.campo, true)}
                          className="flex-1 py-1 px-2 bg-amber-600 text-white rounded text-xs hover:bg-amber-700"
                        >
                          Usar do documento
                        </button>
                        <button
                          onClick={() => resolverDivergencia(div.campo, false)}
                          className="flex-1 py-1 px-2 bg-slate-600 text-white rounded text-xs hover:bg-slate-700"
                        >
                          Manter padrão
                        </button>
                      </div>
                    ) : (
                      <p className="text-green-700 font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        {divergenciasResolvidas[div.campo] === 'documento' ? 'Usando dado do documento' : 'Mantendo padrão institucional'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Ações */}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={confirmarDados}
                disabled={divergenciasPendentes.length > 0}
                className="flex-1 bg-purple-700 hover:bg-purple-800 text-white text-xs"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                {divergenciasPendentes.length > 0
                  ? `Resolva ${divergenciasPendentes.length} divergência(s)`
                  : 'Aplicar dados ao formulário'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={limpar}
                className="border-slate-300 text-xs"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}