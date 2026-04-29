import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FileText,
  Search,
  Trash2,
  ExternalLink,
  Download,
  LinkIcon
} from 'lucide-react';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function toNumber(value) {
  const n = Number(String(value || '').replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

function fmtBRL(value) {
  const n = toNumber(value);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(n);
}

function getTipo(doc) {
  const tipo = normalizeText(doc?.nf_tipo_documento);
  const name = normalizeText(doc?.file_name || doc?.nf_nome_original || doc?.name);

  if (tipo === 'pdf_nf' || name.endsWith('.pdf')) return 'PDF';
  if (tipo === 'xml_nf' || name.endsWith('.xml')) return 'XML';
  return 'DOC';
}

function getValor(doc) {
  return toNumber(
    doc?.nf_valor_total ||
      doc?.valor_total ||
      doc?.valor ||
      doc?.amount ||
      0
  );
}

function getFornecedor(doc) {
  return (
    doc?.nf_emitente_nome ||
    doc?.fornecedor_nome ||
    doc?.supplier_name ||
    doc?.description ||
    '—'
  );
}

function getNumero(doc) {
  return doc?.nf_numero || doc?.numero_nf || doc?.invoice_number || '—';
}

function getFileUrl(doc) {
  return doc?.file_url || doc?.url || doc?.download_url || '';
}

function getFileName(doc) {
  return (
    doc?.file_name ||
    doc?.nf_nome_renomeado ||
    doc?.nf_nome_original ||
    doc?.name ||
    'Documento sem nome'
  );
}

function getStatus(doc) {
  return (
    doc?.status_registro ||
    doc?.nf_status ||
    doc?.status ||
    'ATIVO'
  );
}

function getDedupKey(doc) {
  const url = getFileUrl(doc);
  if (url) return `url:${url}`;

  return [
    getTipo(doc),
    normalizeText(getFornecedor(doc)),
    normalizeText(getNumero(doc)),
    getValor(doc),
    normalizeText(getFileName(doc))
  ].join('|');
}

function isEntradaUnicaDocument(doc) {
  const categoria = normalizeText(doc?.nf_categoria);
  const tipo = normalizeText(doc?.nf_tipo_documento);
  const description = normalizeText(doc?.description);
  const name = normalizeText(getFileName(doc));

  return (
    categoria === 'nota_fiscal' ||
    tipo === 'pdf_nf' ||
    tipo === 'xml_nf' ||
    description.includes('entrada unica') ||
    description.includes('nota fiscal') ||
    name.includes('museus centro') ||
    !!doc?.nf_numero ||
    !!doc?.nf_emitente_nome ||
    !!doc?.nf_valor_total
  );
}

function filtrarEDeduplicarDocumentos(docs) {
  const map = new Map();

  (docs || []).forEach((doc) => {
    if (!doc?.id) return;
    if (doc?.status_registro === 'DELETADO') return;

    const tipo = getTipo(doc);
    const valor = getValor(doc);

    if (tipo === 'PDF' && valor === 0) return;

    const key = getDedupKey(doc);
    if (!map.has(key)) {
      map.set(key, doc);
      return;
    }

    const atual = map.get(key);
    const atualDate = new Date(atual?.created_date || 0).getTime();
    const novoDate = new Date(doc?.created_date || 0).getTime();

    if (novoDate > atualDate) {
      map.set(key, doc);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    const da = new Date(a?.created_date || 0).getTime();
    const db = new Date(b?.created_date || 0).getTime();
    return db - da;
  });
}

export default function GestaoDocumental() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ['gestao-documental-attachments'],
    queryFn: async () => {
      const list = await base44.entities.Attachment.list('-created_date', 800);
      return filtrarEDeduplicarDocumentos(
        (list || []).filter(isEntradaUnicaDocument)
      );
    }
  });

  const filtered = useMemo(() => {
    const busca = normalizeText(search);

    if (!busca) return documentos;

    return documentos.filter((doc) => {
      return (
        normalizeText(getFileName(doc)).includes(busca) ||
        normalizeText(getFornecedor(doc)).includes(busca) ||
        normalizeText(getNumero(doc)).includes(busca) ||
        normalizeText(getStatus(doc)).includes(busca) ||
        normalizeText(getTipo(doc)).includes(busca)
      );
    });
  }, [documentos, search]);

  async function handleDelete(doc) {
    if (!doc?.id) return;

    const ok = window.confirm('Deseja remover este documento da Gestão Documental?');
    if (!ok) return;

    await base44.entities.Attachment.update(doc.id, {
      status_registro: 'DELETADO',
      status: 'DELETADO',
      nf_status: 'DELETADO'
    });

    await queryClient.invalidateQueries({
      queryKey: ['gestao-documental-attachments']
    });
    await queryClient.invalidateQueries({
      queryKey: ['attachments-compras']
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <FileText className="h-5 w-5" />
              Gestão Documental
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Lista única de documentos vinculados às solicitações e notas fiscais.
            </p>
          </div>

          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
            {filtered.length} documento(s)
          </span>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por arquivo, fornecedor, número, tipo ou status..."
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-sm text-gray-400">
          Carregando documentos...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">
          Nenhum documento encontrado.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left">
                <th className="px-3 py-3 font-medium text-gray-600">Tipo</th>
                <th className="px-3 py-3 font-medium text-gray-600">Arquivo</th>
                <th className="px-3 py-3 font-medium text-gray-600">Fornecedor</th>
                <th className="px-3 py-3 font-medium text-gray-600">Número</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Valor</th>
                <th className="px-3 py-3 font-medium text-gray-600">Status</th>
                <th className="px-3 py-3 font-medium text-gray-600">Vínculo</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Ações</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((doc) => {
                const fileUrl = getFileUrl(doc);
                const tipo = getTipo(doc);
                const vinculado =
                  !!doc.purchase_id ||
                  !!doc.purchase_request_id ||
                  !!doc.team_payment_id ||
                  !!doc.nf_pdf_attachment_id ||
                  !!doc.nf_xml_attachment_id;

                return (
                  <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                        {tipo}
                      </span>
                    </td>

                    <td className="max-w-xs px-3 py-3">
                      <p className="truncate font-medium text-gray-900">
                        {getFileName(doc)}
                      </p>
                      <p className="truncate text-xs text-gray-400">
                        {doc.created_date
                          ? new Date(doc.created_date).toLocaleDateString('pt-BR')
                          : ''}
                      </p>
                    </td>

                    <td className="px-3 py-3 text-gray-700">
                      {getFornecedor(doc)}
                    </td>

                    <td className="px-3 py-3 text-gray-700">
                      {getNumero(doc)}
                    </td>

                    <td className="px-3 py-3 text-right font-medium tabular-nums text-gray-900">
                      {fmtBRL(getValor(doc))}
                    </td>

                    <td className="px-3 py-3">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {getStatus(doc)}
                      </span>
                    </td>

                    <td className="px-3 py-3">
                      {vinculado ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          <LinkIcon className="h-3 w-3" />
                          Vinculado
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {fileUrl && (
                          <>
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Ver
                            </a>

                            <a
                              href={fileUrl}
                              download
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Baixar
                            </a>
                          </>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(doc)}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
