import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function TermoPDFUploader({ onDataExtracted }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [extractedData, setExtractedData] = useState(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError(null);
    }
  };

  const handleExtract = async () => {
    if (!file) {
      setError('Selecione um arquivo PDF');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Upload do arquivo
      const uploadResponse = await base44.functions.invoke('uploadWithDuplicateCheck', {
        file: file
      });

      const fileUrl = uploadResponse.data?.file_url;
      if (!fileUrl) throw new Error('Erro ao fazer upload');

      // Extração de dados
      const schema = {
        type: 'object',
        properties: {
          contratado_nome: { type: 'string' },
          contratado_cpf: { type: 'string' },
          contratado_cnpj: { type: 'string' },
          contratado_email: { type: 'string' },
          contratado_telefone: { type: 'string' },
          contratado_endereco: { type: 'string' },
          contratado_banco: { type: 'string' },
          contratado_agencia: { type: 'string' },
          contratado_conta: { type: 'string' },
          tipo_conta: { type: 'string' },
          pix_key: { type: 'string' },
          objeto: { type: 'string' },
          escopo: { type: 'string' },
          data_inicio: { type: 'string' },
          data_fim: { type: 'string' },
          valor_total: { type: 'number' },
          numero_parcelas: { type: 'number' },
          valor_parcela: { type: 'number' },
          forma_pagamento: { type: 'string' },
          nota_fiscal_numero: { type: 'string' },
          nota_fiscal_data: { type: 'string' },
          local_execucao: { type: 'string' },
          representante_legal_nome: { type: 'string' },
          representante_legal_cpf: { type: 'string' }
        }
      };

      const extractResponse = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: fileUrl,
        json_schema: schema
      });

      if (extractResponse.data?.status === 'success' && extractResponse.data?.output) {
        const data = extractResponse.data.output;
        setExtractedData(data);
        onDataExtracted(data);
      } else {
        setError('Não foi possível extrair dados. Preencha manualmente.');
      }
    } catch (err) {
      setError(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-600" />
          Importar de PDF
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-blue-800">
          Anexe um PDF de contrato ou termo existente para extrair dados automaticamente.
        </p>

        <div className="flex gap-3">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="flex-1 text-sm"
          />
          <Button
            onClick={handleExtract}
            disabled={!file || loading}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Extraindo...
              </>
            ) : (
              'Extrair Dados'
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-100 text-red-800 rounded text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {extractedData && (
          <div className="p-3 bg-green-100 text-green-800 rounded text-sm flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Dados extraídos com sucesso!</p>
              <p className="text-xs">Os campos foram preenchidos automaticamente.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}