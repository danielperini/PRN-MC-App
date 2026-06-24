import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Loader2, FileText, FileCode, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const STATUS_LABELS = {
  ENVIADO: 'Enviado',
  ANALISANDO_IA: 'IA analisando',
  AGUARDANDO_REVISAO: 'Aguardando revisão',
  RASCUNHO: 'Rascunho',
  ENVIADO_APROVACAO: 'Enviado p/ aprovação',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  ERRO_PROCESSAMENTO: 'Erro',
};

function formatBRL(val) {
  if (val == null || val === 0) return '—';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function NFsDoGmail() {
  const [intakes, setIntakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('');
  const [expandirId, setExpandirId] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all = await base44.entities.DocumentIntake.list('-created_date', 500);
        const comNF = (all || []).filter(i =>
          i.nf_numero &&
          i.status_registro !== 'REMOVIDO' &&
          i.tipo_detectado && ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML'].includes(i.tipo_detectado)
        );
        setIntakes(comNF);
      } catch (e) {
        console.error('Erro ao carregar:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Agrupar PDF+XML do mesmo grupo
  const grupos = useMemo(() => {
    const map = new Map();
    for (const i of intakes) {
      const key = i.grupo_upload_id || i.id;
      if (!map.has(key)) map.set(key, { pdf: null, xml: null, primeira: i });
      const entry = map.get(key);
      if (i.tipo_detectado === 'NOTA_FISCAL_PDF') entry.pdf = i;
      else if (i.tipo_detectado === 'NOTA_FISCAL_XML') entry.xml = i;
      // Usar a data mais antiga
      if (!entry.primeira || i.created_date < entry.primeira.created_date) entry.primeira = i;
    }
    return Array.from(map.values()).sort((a, b) =>
      (b.primeira?.created_date || '').localeCompare(a.primeira?.created_date || '')
    );
  }, [intakes]);

  const filtrados = useMemo(() => {
    const t = filtro.toLowerCase();
    if (!t) return grupos;
    return grupos.filter(g => {
      const pdf = g.pdf, xml = g.xml;
      return (
        (pdf?.file_name_original || '').toLowerCase().includes(t) ||
        (xml?.file_name_original || '').toLowerCase().includes(t) ||
        (pdf?.nf_numero || xml?.nf_numero || '').includes(t) ||
        (pdf?.fornecedor_nome || xml?.fornecedor_nome || pdf?.nf_emitente_nome || '').toLowerCase().includes(t) ||
        (pdf?.nf_emitente_cpf_cnpj || xml?.nf_emitente_cpf_cnpj || '').includes(t)
      );
    });
  }, [grupos, filtro]);

  const somaValores = filtrados.reduce((s, g) => {
    const v = g.pdf?.nf_valor_total || g.xml?.nf_valor_total || 0;
    return s + v;
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Notas Fiscais do Email</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {grupos.length} notas fiscais importadas via sincronização do Gmail
        </p>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-blue-700">{grupos.length}</div>
            <div className="text-xs text-blue-600">Total de NF</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-700">
              {grupos.filter(g => g.pdf?.status_processamento === 'APROVADO').length}
            </div>
            <div className="text-xs text-green-600">Aprovadas</div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-amber-700">
              {grupos.filter(g => {
                const s = g.pdf?.status_processamento;
                return s && !['APROVADO', 'REJEITADO', 'ERRO_PROCESSAMENTO'].includes(s);
              }).length}
            </div>
            <div className="text-xs text-amber-600">Pendentes</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-slate-700">{formatBRL(somaValores)}</div>
            <div className="text-xs text-slate-600">Valor total</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtro */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filtrar por nome, nº NF, fornecedor, CNPJ..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabela */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>NF</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Arquivos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((g, idx) => {
              const pdf = g.pdf, xml = g.xml;
              const expandido = expandirId === (g.pdf?.id || g.xml?.id);
              const status = pdf?.status_processamento || xml?.status_processamento;
              const isApproved = status === 'APROVADO';
              const isPending = status && !['APROVADO', 'REJEITADO', 'ERRO_PROCESSAMENTO'].includes(status);

              return (
                <React.Fragment key={idx}>
                  <TableRow
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpandirId(expandido ? null : (g.pdf?.id || g.xml?.id))}
                  >
                    <TableCell>
                      {expandido ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </TableCell>
                    <TableCell className="font-medium">
                      NF {pdf?.nf_numero || xml?.nf_numero}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {pdf?.fornecedor_nome || pdf?.nf_emitente_nome || xml?.fornecedor_nome || xml?.nf_emitente_nome || '—'}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {pdf?.nf_emitente_cpf_cnpj || xml?.nf_emitente_cpf_cnpj || pdf?.fornecedor_cpf_cnpj || '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatBRL(pdf?.nf_valor_total || xml?.nf_valor_total)}
                    </TableCell>
                    <TableCell>
                      {isApproved && <Badge className="bg-green-100 text-green-700 border-green-300">Aprovado</Badge>}
                      {isPending && <Badge variant="secondary">{STATUS_LABELS[status] || status}</Badge>}
                      {status === 'REJEITADO' && <Badge variant="destructive">Rejeitado</Badge>}
                      {status === 'ERRO_PROCESSAMENTO' && <Badge variant="outline" className="text-red-600">Erro</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {pdf && <FileText className="w-4 h-4 text-red-500" title="PDF" />}
                        {xml && <FileCode className="w-4 h-4 text-blue-500" title="XML" />}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Linha expandida com detalhes */}
                  {expandido && (
                    <TableRow className="bg-slate-50">
                      <TableCell colSpan={7} className="p-4">
                        <div className="grid md:grid-cols-2 gap-4 text-sm">
                          {pdf && (
                            <div className="space-y-2">
                              <h4 className="font-semibold text-xs uppercase text-muted-foreground flex items-center gap-1">
                                <FileText className="w-3 h-3 text-red-500" /> PDF
                              </h4>
                              <p className="text-xs break-all">{pdf.file_name_original}</p>
                              <div className="grid grid-cols-2 gap-1 text-xs">
                                <span className="text-muted-foreground">Valor:</span>
                                <span className="font-medium">{formatBRL(pdf.nf_valor_total)}</span>
                                <span className="text-muted-foreground">Emitente:</span>
                                <span>{pdf.nf_emitente_nome || '—'}</span>
                                <span className="text-muted-foreground">CNPJ emit.:</span>
                                <span className="font-mono">{pdf.nf_emitente_cpf_cnpj || '—'}</span>
                                <span className="text-muted-foreground">Status:</span>
                                <span>{STATUS_LABELS[pdf.status_processamento] || pdf.status_processamento}</span>
                              </div>
                              {pdf.arquivo_original_url && (
                                <a href={pdf.arquivo_original_url} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                  <ExternalLink className="w-3 h-3" /> Abrir arquivo
                                </a>
                              )}
                            </div>
                          )}
                          {xml && (
                            <div className="space-y-2">
                              <h4 className="font-semibold text-xs uppercase text-muted-foreground flex items-center gap-1">
                                <FileCode className="w-3 h-3 text-blue-500" /> XML
                              </h4>
                              <p className="text-xs break-all">{xml.file_name_original}</p>
                              <div className="grid grid-cols-2 gap-1 text-xs">
                                <span className="text-muted-foreground">Valor:</span>
                                <span className="font-medium">{formatBRL(xml.nf_valor_total)}</span>
                                <span className="text-muted-foreground">Emitente:</span>
                                <span>{xml.nf_emitente_nome || '—'}</span>
                                <span className="text-muted-foreground">CNPJ emit.:</span>
                                <span className="font-mono">{xml.nf_emitente_cpf_cnpj || '—'}</span>
                                <span className="text-muted-foreground">Status:</span>
                                <span>{STATUS_LABELS[xml.status_processamento] || xml.status_processamento}</span>
                              </div>
                              {xml.arquivo_original_url && (
                                <a href={xml.arquivo_original_url} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                  <ExternalLink className="w-3 h-3" /> Abrir arquivo
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
        {filtrados.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Nenhuma nota fiscal encontrada
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Exibindo {filtrados.length} de {grupos.length} notas fiscais — Total: {formatBRL(somaValores)}
      </p>
    </div>
  );
}