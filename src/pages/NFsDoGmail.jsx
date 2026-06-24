import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Mail, FileCheck, FileX, FileText, AlertCircle } from 'lucide-react';

export default function NFsDoGmail() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [maxMessages, setMaxMessages] = useState(50);
  const [filtro, setFiltro] = useState('');
  const [mostrarApenasNaoImportados, setMostrarApenasNaoImportados] = useState(false);

  const executarAuditoria = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('auditarNFsGmail', { maxMessages });
      setResultado(res.data);
    } catch (e) {
      console.error('Erro ao auditar:', e);
    } finally {
      setLoading(false);
    }
  };

  const anexos = resultado?.todos_anexos || [];
  const filtrados = anexos.filter(a => {
    const termo = filtro.toLowerCase();
    const matchSearch = !termo ||
      (a.filename || '').toLowerCase().includes(termo) ||
      (a.subject || '').toLowerCase().includes(termo) ||
      (a.from || '').toLowerCase().includes(termo) ||
      (a.nf_numero_extraido || '').includes(termo);

    if (mostrarApenasNaoImportados) return matchSearch && !a.importado;
    return matchSearch;
  });

  const naoImportados = anexos.filter(a => !a.importado);
  const importados = anexos.filter(a => a.importado);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notas Fiscais do Gmail</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Auditoria de anexos NF (PDF/XML) nos emails de danielperini@viadutodasartes.org.br
          </p>
        </div>
      </div>

      {/* Controles */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Emails a escanear</label>
              <Input
                type="number"
                value={maxMessages}
                onChange={(e) => setMaxMessages(Number(e.target.value) || 50)}
                min={10}
                max={200}
                className="w-28"
              />
            </div>
            <Button onClick={executarAuditoria} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              {loading ? 'Auditando...' : 'Auditar Gmail'}
            </Button>
            {resultado && (
              <span className="text-sm text-muted-foreground ml-2">
                {(resultado.resumo?.tempo_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      {resultado && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-blue-700">{resultado.resumo?.total_anexos_nf_gmail || 0}</div>
              <div className="text-xs text-blue-600">Total anexos NF</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-700">{resultado.resumo?.ja_importados || 0}</div>
              <div className="text-xs text-green-600">Já importados</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-amber-700">{resultado.resumo?.nao_importados || 0}</div>
              <div className="text-xs text-amber-600">Não importados</div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50">
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-slate-700">
                {resultado.resumo?.total_anexos_nf_gmail
                  ? ((resultado.resumo.ja_importados / resultado.resumo.total_anexos_nf_gmail) * 100).toFixed(0)
                  : 0}%
              </div>
              <div className="text-xs text-slate-600">Taxa de importação</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros e lista */}
      {resultado && anexos.length > 0 && (
        <>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por nome, assunto, remetente..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={mostrarApenasNaoImportados ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMostrarApenasNaoImportados(!mostrarApenasNaoImportados)}
            >
              <AlertCircle className="w-3 h-3 mr-1" />
              Pendentes ({naoImportados.length})
            </Button>
          </div>

          <div className="space-y-2">
            {filtrados.map((anexo, idx) => (
              <Card key={idx} className={`border-l-4 ${anexo.importado ? 'border-l-green-400' : 'border-l-amber-400'}`}>
                <CardContent className="py-3 px-4 flex items-start gap-3">
                  <div className="mt-0.5">
                    {anexo.importado
                      ? <FileCheck className="w-5 h-5 text-green-600" />
                      : <FileX className="w-5 h-5 text-amber-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{anexo.filename}</span>
                      <Badge variant={anexo.importado ? 'default' : 'secondary'} className="text-[10px]">
                        {anexo.importado ? 'Importado' : 'Pendente'}
                      </Badge>
                      {anexo.nf_numero_extraido && (
                        <Badge variant="outline" className="text-[10px]">NF {anexo.nf_numero_extraido}</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {anexo.mimeType?.includes('xml') ? 'XML' : 'PDF'}
                      </Badge>
                    </div>
                    {anexo.importado && anexo.metodo && (
                      <p className="text-xs text-green-700 mt-0.5">
                        {anexo.metodo === 'gmail_message_id' && '✓ Vinculado por ID da mensagem'}
                        {anexo.metodo === 'filename_exato' && '✓ Vinculado por nome exato do arquivo'}
                        {anexo.metodo === 'nf_numero' && '✓ Vinculado por número da NF'}
                      </p>
                    )}
                    <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                      <span className="truncate max-w-[300px]">{anexo.subject}</span>
                      <span>•</span>
                      <span className="truncate max-w-[200px]">{anexo.from}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {anexo.date ? new Date(anexo.date).toLocaleDateString('pt-BR') : ''}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Exibindo {filtrados.length} de {anexos.length} anexos
          </p>
        </>
      )}

      {!resultado && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Clique em "Auditar Gmail" para escanear os emails</p>
            <p className="text-xs mt-1">A auditoria varre anexos PDF e XML nos emails recentes</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}