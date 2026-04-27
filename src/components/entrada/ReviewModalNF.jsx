// 🔴 ALTERAÇÕES:
// - normalização de data
// - múltiplas chaves IA para data
// - remoção de filtro de rubricas

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, AlertCircle, CheckCircle2, Send, Trash2, SplitSquareHorizontal, BookOpen, ShieldCheck, RefreshCw, LinkIcon } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// 🔴 NOVO: normalizador de data
function normalizeDate(dateStr) {
  if (!dateStr) return '';

  try {
    // já vem no padrão correto
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    // formato DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [d, m, y] = dateStr.split('/');
      return `${y}-${m}-${d}`;
    }

    const d = new Date(dateStr);
    if (!isNaN(d)) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}

  return '';
}

const CENTROS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const MUSEUS_RATEIO = ['MHAB', 'MIS', 'MUMO'];
const DEFAULT_RATEIO = MUSEUS_RATEIO.map((m) => ({ museu: m, valor: '' }));

export default function ReviewModalNF({ intake, onClose, onSaved }) {
  const { toast } = useToast();

  const [rubricas, setRubricas] = useState([]);

  const ia = intake.resultado_ia || {};

  // 🔴 DATA AUTOMÁTICA MELHORADA
  const dataIA =
    ia.nf_data_emissao ||
    ia.data_emissao ||
    ia.dataEmissao ||
    ia.emissao ||
    '';

  const [form, setForm] = useState({
    nf_data_emissao: normalizeDate(dataIA),
    rubrica_id: intake.rubrica_id_sugerida || '',
  });

  // 🔴 GARANTE PREENCHIMENTO AUTOMÁTICO SE IA CHEGAR DEPOIS
  useEffect(() => {
    if (!form.nf_data_emissao && dataIA) {
      setForm((f) => ({
        ...f,
        nf_data_emissao: normalizeDate(dataIA),
      }));
    }
  }, [dataIA]);

  // 🔴 CARREGA TODAS AS RUBRICAS (SEM FILTRO)
  useEffect(() => {
    async function loadRubricas() {
      try {
        const list = await base44.entities.Rubrica.list('', 2000);
        setRubricas(list || []);
      } catch (e) {
        console.error(e);
      }
    }
    loadRubricas();
  }, []);

  const rubricasOrdenadas = [...rubricas].sort((a, b) => {
    const grupoA = String(a.grupo || '');
    const grupoB = String(b.grupo || '');
    const nomeA = String(a.rubrica || a.nome || a.descricao || '');
    const nomeB = String(b.rubrica || b.nome || b.descricao || '');

    const byGrupo = grupoA.localeCompare(grupoB, 'pt-BR');
    if (byGrupo !== 0) return byGrupo;

    return nomeA.localeCompare(nomeB, 'pt-BR');
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conferência de Nota Fiscal</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* DATA AUTOMÁTICA */}
          <div>
            <Label>Data de Emissão</Label>
            <Input
              type="date"
              value={form.nf_data_emissao}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  nf_data_emissao: e.target.value,
                }))
              }
            />
          </div>

          {/* RUBRICA COMPLETA */}
          <div>
            <Label>Rubrica</Label>
            <Select
              value={form.rubrica_id}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  rubrica_id: v,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar rubrica" />
              </SelectTrigger>
              <SelectContent>
                {rubricasOrdenadas.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {(r.grupo ? `${r.grupo} — ` : '')}
                    {r.rubrica || r.nome || r.descricao || 'Rubrica'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
