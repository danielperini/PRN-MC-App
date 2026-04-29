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
    0
  );
}

function getFornecedor(doc) {
  return (
    doc?.nf_emitente_nome ||
    doc?.fornecedor_nome ||
    doc?.description ||
    '—'
  );
}

function getNumero(doc) {
  return doc?.nf_numero || '—';
}

function getFileUrl(doc) {
  return doc?.file_url || '';
}

function getFileName(doc) {
  return (
    doc?.file_name ||
    doc?.nf_nome_renomeado ||
    doc?.nf_nome_original ||
    'Documento'
  );
}

function filtrarEDeduplicarDocumentos(docs) {
  const map = new Map();

  (docs || []).forEach((doc) => {
    if (!doc?.id) return;
    if (doc?.status_registro === 'DELETADO') return;

    const valor = getValor(doc);
    if (getTipo(doc) === 'PDF' && valor === 0) return;

    const key = getFileUrl(doc) || `${getNumero(doc)}-${valor}`;

    if (!map.has(key)) {
      map.set(key, doc);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    return new Date(b.created_date) - new Date(a.created_date);
  });
}

export default function GestaoDocumental() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: documentos = [], isLoading } = useQuery({
    queryKey: ['gestao-documental'],
    queryFn: async () => {
      const list = await base44.entities.Attachment.list('-created_date', 500);
      return filtrarEDeduplicarDocumentos(list);
    }
  });

  const filtrados = useMemo(() => {
    const s = normalizeText(search);
    if (!s) return documentos;

    return documentos.filter((doc) =>
      normalizeText(getFileName(doc)).includes(s) ||
      normalizeText(getFornecedor(doc)).includes(s) ||
      normalizeText(getNumero(doc)).includes(s)
    );
  }, [documentos, search]);

  async function handleDelete(doc) {
    if (!window.confirm('Remover documento?')) return;

    await base44.entities.Attachment.update(doc.id, {
      status_registro: 'DELETADO'
    });

    await queryClient.invalidateQueries(['gestao-documental']);
  }

  return (
    <div className="p-4 border rounded-xl bg-white">

      <div className="flex justify-between mb-4">
        <h2 className="font-bold flex items-center gap-2">
          <FileText size={18} />
          Gestão Documental
        </h2>

        <span>{filtrados.length} docs</span>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-2 top-2 text-gray-400" size={14} />
        <Input
          className="pl-7"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p>Carregando...</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Arquivo</th>
              <th>Fornecedor</th>
              <th>Número</th>
              <th>Valor</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            {filtrados.map((doc) => (
              <tr key={doc.id}>

                <td>{getTipo(doc)}</td>
                <td>{getFileName(doc)}</td>
                <td>{getFornecedor(doc)}</td>
                <td>{getNumero(doc)}</td>
                <td>{fmtBRL(getValor(doc))}</td>

                <td className="flex gap-2">

                  <a href={getFileUrl(doc)} target="_blank">
                    <ExternalLink size={14} />
                  </a>

                  <a href={getFileUrl(doc)} download>
                    <Download size={14} />
                  </a>

                  <button onClick={() => handleDelete(doc)}>
                    <Trash2 size={14} />
                  </button>

                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
