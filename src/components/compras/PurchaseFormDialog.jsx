import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toastMessages } from '@/lib/toastMessages';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, X, Upload, FileCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const CENTROS = ['MUMO', 'MIS', 'MHAB', 'Noturno nos Museus 2026', 'Publicações', 'Geral'];

const EMPTY = {
  descricao_item: '',
  centro_custo: '',
  rubrica_id: '',
  valor_solicitado: '',
  fornecedor_nome: '',
  fornecedor_cnpj: '',
  observacoes: '',
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function moeda(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getRubricaTitulo(r) {
  return String(r?.rubrica || r?.nome || 'Sem nome').trim();
}

function getRubricaGrupo(r) {
  return String(r?.grupo || 'Sem grupo').trim();
}

export default function PurchaseFormDialog({
  currentUser,
  onClose,
  onSuccess,
  prefill,
}) {
  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas'],
    queryFn: () => base44.entities.Rubrica.list('-created_date', 5000),
  });

  const [form, setForm] = useState(prefill ? { ...EMPTY, ...prefill } : EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 🔥 NOVOS ESTADOS
  const [pdfFile, setPdfFile] = useState(null);
  const [xmlFile, setXmlFile] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiScore, setAiScore] = useState(null);
  const [aiResumo, setAiResumo] = useState('');

  const rubricasProcessadas = useMemo(() => {
    return (rubricas || []).map((r) => {
      const valor = toNumber(r?.valor_rubrica || r?.valor_total);
      const utilizado = toNumber(r?.valor_utilizado);
      const comprometido = toNumber(r?.saldo_comprometido);
      const saldo = valor - utilizado - comprometido;

      return { ...r, saldo };
    });
  }, [rubricas]);

  const handleUpload = async (file) => {
    if (!file) return null;

    const res = await base44.storage.upload({
      file,
      path: `notas_fiscais/${file.name}`,
    });

    return res?.file_url || null;
  };

  const handleAnalisarNF = async () => {
    if (!pdfFile) {
      toastMessages.validationError('PDF obrigatório');
      return;
    }

    setAnalyzing(true);

    try {
      const pdfUrl = await handleUpload(pdfFile);
      const xmlUrl = xmlFile ? await handleUpload(xmlFile) : null;

      const response = await base44.functions.invoke('purchaseActions', {
        action: 'attach_invoice',
        purchaseId: prefill?.id,
        pdf_url: pdfUrl,
        xml_url: xmlUrl,
      });

      setAiScore(response?.ai_score || null);
      setAiResumo(response?.ai_resumo || '');

      toastMessages.createSuccess('Nota analisada com sucesso');
    } catch (e) {
      toastMessages.saveFailed(e.message);
    }

    setAnalyzing(false);
  };

  const handleSave = async () => {
    setSaving(true);

    try {
      const payload = {
        ...form,
        valor_solicitado: toNumber(form.valor_solicitado),
        created_by: currentUser?.email,
      };

      if (prefill?.id) {
        await base44.entities.PurchaseRequest.update(prefill.id, payload);
      } else {
        await base44.entities.PurchaseRequest.create(payload);
      }

      toastMessages.createSuccess();
      setSaved(true);
      onSuccess();
    } catch (e) {
      toastMessages.saveFailed(e?.message);
    }

    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white">

        <div className="flex justify-between border-b p-4">
          <h2>{prefill?.id ? 'Editar compra' : 'Nova compra'}</h2>
          <Button variant="ghost" onClick={onClose}><X /></Button>
        </div>

        <div className="space-y-4 p-4">

          <Textarea
            placeholder="Descrição do item"
            value={form.descricao_item}
            onChange={(e) => setForm({ ...form, descricao_item: e.target.value })}
          />

          <Input
            placeholder="Fornecedor"
            value={form.fornecedor_nome}
            onChange={(e) => setForm({ ...form, fornecedor_nome: e.target.value })}
          />

          <Input
            placeholder="CNPJ"
            value={form.fornecedor_cnpj}
            onChange={(e) => setForm({ ...form, fornecedor_cnpj: e.target.value })}
          />

          <Select
            value={form.rubrica_id || ''}
            onValueChange={(v) => setForm({ ...form, rubrica_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Rubrica" />
            </SelectTrigger>
            <SelectContent className="max-h-96">
              {rubricasProcessadas.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {`${getRubricaGrupo(r)} | ${getRubricaTitulo(r)} | Saldo R$ ${moeda(r.saldo)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 🔥 UPLOAD NF */}
          <div className="space-y-2 border rounded p-3">
            <div className="text-sm font-semibold">Nota Fiscal</div>

            <Input type="file" accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0])}
            />

            <Input type="file" accept=".xml"
              onChange={(e) => setXmlFile(e.target.files?.[0])}
            />

            <Button
              onClick={handleAnalisarNF}
              disabled={analyzing}
              className="w-full"
            >
              {analyzing
                ? <Loader2 className="animate-spin w-4 h-4" />
                : <><FileCheck className="w-4 h-4 mr-2" /> Analisar Nota com IA</>}
            </Button>

            {aiScore && (
              <div className="text-sm bg-gray-100 p-2 rounded">
                <div><strong>Score IA:</strong> {aiScore}/10</div>
                <div className="text-xs mt-1">{aiResumo}</div>
              </div>
            )}
          </div>

        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>

          <Button
            onClick={handleSave}
            disabled={saving || saved}
            className={saved ? 'bg-green-600 text-white' : ''}
          >
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : saved
                ? 'Salvo com Sucesso!'
                : 'Salvar'}
          </Button>
        </div>

      </div>
    </div>
  );
}
