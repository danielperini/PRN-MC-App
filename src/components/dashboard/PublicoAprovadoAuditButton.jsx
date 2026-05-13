import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

const APROVADOS = new Set(['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN']);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const inteiro = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const isApproved = (r) => APROVADOS.has(String(r?.status || '').trim().toUpperCase());

function museu(v) {
  const t = String(v || '').toUpperCase();
  if (t.includes('MIS') || t.includes('IMAGEM') || t.includes('SOM')) return 'MIS';
  if (t.includes('MHAB') || t.includes('ABILIO') || t.includes('ABÍLIO') || t.includes('HIST')) return 'MHAB';
  if (t.includes('MUMO') || t.includes('MODA')) return 'MUMO';
  if (t.includes('GERAL') || t.includes('ATUAÇÃO')) return 'Atuação Geral';
  return v || 'Não informado';
}

function mesNumero(r) {
  const raw = r?.mes_referencia ?? r?.mes ?? r?.competencia;
  const n = Number(raw);
  if (n >= 1 && n <= 12) return n;
  const txt = String(raw || '').toLowerCase();
  const idx = MESES.findIndex((m) => txt.includes(m.toLowerCase()));
  if (idx >= 0) return idx + 1;
  if (txt.includes('marco')) return 3;
  return null;
}

function ano(r) {
  const n = Number(r?.ano ?? r?.ano_referencia);
  return Number.isFinite(n) && n > 1900 ? n : new Date().getFullYear();
}

function nome(a) {
  return a?.nome_atividade || a?.nome || a?.titulo || a?.acao || a?.atividade || 'Atividade sem nome';
}

function publico(a) {
  const direto = inteiro(a?.publico_total ?? a?.publico_estimado ?? a?.publico ?? 0);
  if (direto > 0) return direto;
  const medio = inteiro(a?.publico_medio_por_sessao ?? a?.publico_medio_sessao ?? a?.publico_medio ?? a?.publico_por_sessao ?? 0);
  const ocorrencias = inteiro(a?.quantas_vezes_ocorreu ?? a?.qtd_ocorrencias ?? a?.ocorrencias ?? a?.quantidade_ocorrencias ?? 1);
  return medio * Math.max(ocorrencias, 1);
}

function chave(a, r) {
  const id = a?.programacao_id || a?.programacaoId || a?.id_programacao || a?.agenda_id;
  if (id) return `programacao:${id}`;
  return [norm(nome(a)), `${ano(r)}-${String(mesNumero(r) || '').padStart(2, '0')}`, museu(a?.museu || a?.centro_custo || r?.museu || r?.museu_secundario)].join('|');
}

function calcular(reports) {
  const relatorios = reports.filter(isApproved);
  const mapa = new Map();
  let brutas = 0;
  let duplicadas = 0;

  relatorios.forEach((r) => {
    const lista = Array.isArray(r?.atividades) ? r.atividades : [];
    lista.forEach((a) => {
      brutas += 1;
      const key = chave(a, r);
      const m = mesNumero(r);
      const item = {
        key,
        periodo: `${m ? MESES[m - 1] : '—'}/${ano(r)}`,
        museu: museu(a?.museu || a?.centro_custo || r?.museu || r?.museu_secundario),
        nome: nome(a),
        relatorio: r?.numero_protocolo || r?.author_name || r?.created_by || 'Relatório',
        publico: publico(a),
      };
      if (!mapa.has(key)) {
        mapa.set(key, item);
      } else {
        duplicadas += 1;
        if (item.publico > mapa.get(key).publico) mapa.set(key, item);
      }
    });
  });

  const atividades = Array.from(mapa.values());
  const total = atividades.reduce((s, a) => s + inteiro(a.publico), 0);
  return { relatorios, brutas, duplicadas, atividades, total };
}

function findPublicoCard() {
  const labels = Array.from(document.querySelectorAll('span'));
  const label = labels.find((el) => {
    const text = norm(el.textContent);
    return text.includes('publico total') && text.includes('aprovados');
  });
  return label?.closest('.rounded-2xl') || null;
}

export default function PublicoAprovadoAuditButton() {
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState(null);

  const audit = useMemo(() => calcular(reports), [reports]);

  useEffect(() => {
    let raf = null;

    const updatePosition = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const card = findPublicoCard();
        if (!card) {
          setPosition(null);
          return;
        }

        const rect = card.getBoundingClientRect();
        setPosition({
          top: Math.max(8, rect.bottom + 6),
          left: Math.max(8, rect.left),
          width: Math.max(180, rect.width),
        });
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    const observer = new MutationObserver(updatePosition);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      observer.disconnect();
    };
  }, []);

  async function abrir() {
    setOpen(true);
    setLoading(true);
    try {
      const data = await base44.entities.Report.list('-updated_date', 1000);
      setReports(Array.isArray(data) ? data : []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }

  if (!position) return null;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="fixed z-40 rounded-xl border border-gray-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm hover:border-gray-300 hover:text-black hover:bg-white flex items-center justify-center gap-1.5"
        style={{ top: position.top, left: position.left, width: position.width }}
        title="Ver memória do cálculo do público aprovado"
      >
        <Calculator className="w-3.5 h-3.5" />
        memória de cálculo do público
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[88vh] overflow-hidden flex flex-col border">
            <div className="p-5 border-b flex justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Memória do cálculo — Público aprovado</h2>
                <p className="text-sm text-gray-500">Relatórios aprovados + atividades únicas. Duplicidades são ignoradas.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}><X className="w-4 h-4 mr-1" />Fechar</Button>
            </div>

            <div className="p-5 overflow-auto space-y-4">
              {loading ? <p className="text-sm text-gray-500">Carregando...</p> : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl bg-black text-white p-4"><p className="text-2xl font-bold">{audit.total.toLocaleString('pt-BR')}</p><p className="text-xs text-gray-300">Público final</p></div>
                    <div className="rounded-xl border p-4"><p className="text-2xl font-bold">{audit.relatorios.length}</p><p className="text-xs text-gray-500">Relatórios aprovados</p></div>
                    <div className="rounded-xl border p-4"><p className="text-2xl font-bold">{audit.atividades.length}</p><p className="text-xs text-gray-500">Atividades únicas</p></div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-2xl font-bold text-amber-800">{audit.duplicadas}</p><p className="text-xs text-amber-700">Duplicadas removidas</p></div>
                  </div>

                  <div className="rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b text-sm font-semibold">Atividades consideradas na soma</div>
                    <div className="overflow-auto max-h-80">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b text-left"><th className="p-2">Período</th><th className="p-2">Museu</th><th className="p-2">Atividade</th><th className="p-2">Relatório</th><th className="p-2 text-right">Público</th></tr></thead>
                        <tbody>{audit.atividades.map((a, i) => <tr key={`${a.key}-${i}`} className="border-b"><td className="p-2">{a.periodo}</td><td className="p-2">{a.museu}</td><td className="p-2">{a.nome}</td><td className="p-2">{a.relatorio}</td><td className="p-2 text-right font-semibold">{a.publico.toLocaleString('pt-BR')}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
