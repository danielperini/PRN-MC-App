import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Zap, Loader2, AlertTriangle, CheckCircle2, XCircle, FileText, FolderSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

const fmtBR = (n) => new Intl.NumberFormat('pt-BR').format(Number(n || 0));
const fmtMoeda = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));

export default function ZerarFilaIAButton({ onConcluido }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState([]); // array de resultados por ciclo
  const [total, setTotal] = useState(0);

  async function executarCiclo() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('zerarFilaAprovarComIA', { batch_size: 8 });
      const data = res?.data || res || {};
      if (data?.ok === false) throw new Error(data?.error || 'Falha no processamento');
      setResultados((prev) => [...prev, data]);
      setTotal(data.total_pendentes || 0);
      return data;
    } catch (e) {
      toast.error('Erro: ' + (e?.message || e));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function zerarTudo() {
    setLoading(true);
    setResultados([]);
    let totalAprovados = 0;
    let ciclo = 0;
    let pendentesRestantes = 1; // inicializa para entrar no loop
    let ciclosMax = 15; // limite de segurança (15*8 = 120 NFs no máximo)
    while (pendentesRestantes > 0 && ciclosMax > 0) {
      ciclo++;
      const data = await executarCiclo();
      if (!data) break;
      totalAprovados += data.prs_aprovados || 0;
      pendentesRestantes = data.pendentes_restantes || 0;
      // Se 0 PRs foram criados neste ciclo, provavelmente há bloqueios — interrompe
      if (data.prs_criados === 0 && data.prs_aprovados === 0) break;
      if (data.prs_criados === 0) break;
      ciclosMax--;
      if (pendentesRestantes > 0) {
        await new Promise((r) => setTimeout(r, 800)); // pequeno delay entre ciclos
      }
    }
    setLoading(false);
    toast.success(`Processamento concluído: ${totalAprovados} NF(s) aprovada(s) em ${ciclo} ciclo(s).`);
    if (onConcluido) onConcluido();
  }

  const totalProcessados = resultados.reduce((acc, r) => acc + (r.processados || 0), 0);
  const totalAprovados = resultados.reduce((acc, r) => acc + (r.prs_aprovados || 0), 0);
  const totalIA = resultados.reduce((acc, r) => acc + (r.analises_ia || 0), 0);
  const totalErros = resultados.reduce((acc, r) => acc + (r.erros?.length || 0), 0);
  const pendentesRestantes = resultados.length > 0 ? resultados[resultados.length - 1].pendentes_restantes : 0;
  const errosTodos = resultados.flatMap((r) => r.erros || []);

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="gap-2 bg-gradient-to-r from-indigo-700 to-purple-700 text-white hover:from-indigo-800 hover:to-purple-800 shadow-sm"
        title="Lê NFs com IA e aprova automaticamente em lote"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        Zerar fila com IA
      </Button>

      <Dialog open={open} onOpenChange={(v) => !loading && setOpen(v)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-indigo-600" />
              Zerar fila com IA — Processamento + Aprovação Automática
            </DialogTitle>
            <DialogDescription className="text-xs">
              A IA (GPT-4o vision) lerá cada pendente, extrairá valor/data/fornecedor/CNPJ/centro de custo/rubrica/descrição, criará a solicitação (PurchaseRequest) e aprovará automaticamente.
            </DialogDescription>
          </DialogHeader>

          {resultados.length === 0 && !loading && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
                  <div className="space-y-1.5">
                    <p className="font-semibold">Atenção</p>
                    <p>Esta ação processará <strong>todos os DocumentIntake pendentes</strong> (NFs PDF e XML). Cada NF será lida integralmente pela IA, terá seus campos preenchidos e será <strong>aprovada automaticamente</strong> como solicitação de compra.</p>
                    <p>NFs duplicadas detectadas pela auditoria serão <strong>rejeitadas automaticamente</strong> (não aprovadas).</p>
                    <p className="text-amber-700">A IA processa em lotes de 8 NFs por ciclo (~50s cada). A fila inteira pode levar vários minutos.</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Recomendado: use quando houver um volume grande de pendentes e confiança no processo de extração. NFs com problemas serão sinalizadas nos erros.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              <p className="text-sm font-medium text-gray-900">Processando fila com IA...</p>
              {resultados.length > 0 && (
                <p className="text-xs text-gray-500">Ciclo {resultados.length} · {totalAprovados} aprovadas até agora · {pendentesRestantes} restantes</p>
              )}
            </div>
          )}

          {resultados.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MiniMetric icon={FileText} tone="bg-blue-100 text-blue-700" label="Analisados" value={fmtBR(totalProcessados)} />
                <MiniMetric icon={FolderSearch} tone="bg-purple-100 text-purple-700" label="IA leu" value={fmtBR(totalIA)} />
                <MiniMetric icon={CheckCircle2} tone="bg-emerald-100 text-emerald-700" label="Aprovadas" value={fmtBR(totalAprovados)} />
                <MiniMetric icon={XCircle} tone="bg-rose-100 text-rose-700" label="Erros" value={fmtBR(totalErros)} />
              </div>

              {pendentesRestantes > 0 && !loading && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <strong>{pendentesRestantes}</strong> intakes ainda pendentes. Clique em "Continuar processando" para o próximo ciclo.
                </div>
              )}

              {pendentesRestantes === 0 && !loading && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Fila zerada! {totalAprovados} NF(s) aprovada(s) com sucesso.
                </div>
              )}

              {errosTodos.length > 0 && (
                <details className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs">
                  <summary className="cursor-pointer font-medium text-gray-700">{errosTodos.length} erro(s) detalhados:</summary>
                  <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto text-gray-600">
                    {errosTodos.slice(0, 50).map((e, i) => (
                      <li key={i} className="truncate">⚠ {e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <DialogFooter>
            {resultados.length === 0 && !loading && (
              <>
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={zerarTudo}
                  className="gap-2 bg-gradient-to-r from-indigo-700 to-purple-700 text-white"
                >
                  <Zap className="h-4 w-4" />
                  Zerar fila agora
                </Button>
              </>
            )}
            {loading && (
              <Button size="sm" disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando...
              </Button>
            )}
            {resultados.length > 0 && !loading && pendentesRestantes > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Fechar</Button>
                <Button
                  size="sm"
                  onClick={zerarTudo}
                  className="gap-2 bg-gradient-to-r from-indigo-700 to-purple-700 text-white"
                >
                  <Zap className="h-4 w-4" />
                  Continuar processando
                </Button>
              </>
            )}
            {resultados.length > 0 && !loading && pendentesRestantes === 0 && (
              <Button size="sm" onClick={() => { setOpen(false); if (onConcluido) onConcluido(); }}>
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MiniMetric({ icon: Icon, tone, label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2">
      <div className="flex items-center gap-1.5">
        <div className={`flex h-6 w-6 items-center justify-center rounded ${tone}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-400">{label}</div>
          <div className="text-sm font-bold text-gray-900">{value}</div>
        </div>
      </div>
    </div>
  );
}