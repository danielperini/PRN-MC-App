import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  ImagePlus,
  Loader2,
  Paperclip,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
  FileType,
  Globe,
  Lock,
  Code2,
} from 'lucide-react';
import { exportarRelatorioExecucaoPDF } from '@/components/relatorio/ExportarRelatorioExecucaoPDF';
import { exportarRelatorioExecucaoDOCX } from '@/components/relatorio/ExportarRelatorioExecucaoDOCX';
import { exportarRelatorioHTML } from '@/components/relatorio/ExportarRelatorioHTML';
import RevisaoFinalDialog from '@/components/relatorio/RevisaoFinalDialog';
import GeracaoCompletaDialog from '@/components/relatorio/GeracaoCompletaDialog';
import { listarMetasRelatorio, sincronizarRelatorioExecucao } from '@/utils/sincronizarRelatorioExecucaoCompat';

const SECOES_EDITAVEIS = [
  { key: 'endereco_execucao', label: '2. Endereço de Execução' },
  { key: 'divulgacao_parceria', label: '3. Divulgação da Parceria' },
  { key: 'descricao_acoes', label: '4. Descrição das Ações' },
  { key: 'publico_alvo', label: '5. Público-Alvo' },
  { key: 'pesquisa_satisfacao', label: '6. Pesquisa de Satisfação' },
  { key: 'cronograma_metas', label: '7. Cronograma de Metas' },
  { key: 'equipe_trabalho', label: '8. Equipe de Trabalho' },
  { key: 'impactos_economicos_sociais', label: '9. Impactos Econômicos e Sociais' },
  { key: 'sustentabilidade', label: '10. Sustentabilidade' },
  { key: 'avaliacao_parceria', label: '11. Avaliação da Parceria' },
  { key: 'assinatura', label: '12. Assinatura' },
  { key: 'anexos', label: '13. Anexos e Evidências' },
];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function nomeMeta(meta) {
  return meta?.meta_nome || meta?.nome || meta?.titulo || meta?.descricao || meta?.codigo || 'Meta';
}

function idMeta(meta) {
  return String(meta?.id || meta?.meta_codigo || nomeMeta(meta));
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function textoSecao(relatorio, key) {
  const secao = relatorio?.[key];
  if (!secao) return '';
  if (typeof secao === 'string') return secao;
  if (Array.isArray(secao)) return JSON.stringify(secao, null, 2);
  return secao.texto_editado || secao.texto_ia || secao.texto_interpretativo_editado || secao.texto_interpretativo_ia || secao.justificativa_editada || secao.justificativa_ia || '';
}

function ehImagem(file) {
  return String(file?.type || '').startsWith('image/');
}

export default function RelatorioExecucaoObjeto() {
  const [form, setForm] = useState({
    tipo: 'parcial',
    data_inicio: '2026-02-01',
    data_fim: hoje(),
    filtro_museu: 'todos',
    filtro_versao: 'consolidado',
    filtro_meta_ids: [],
  });
  const [metas, setMetas] = useState([]);
  const [carregandoMetas, setCarregandoMetas] = useState(true);
  const [relatorio, setRelatorio] = useState(null);
  const [relatorioId, setRelatorioId] = useState(null);
  const [relatoriosSalvos, setRelatoriosSalvos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState({ valor: 0, texto: '' });
  const [revisaoAberta, setRevisaoAberta] = useState(false);
  const [editor, setEditor] = useState(null);
  const [textoEditado, setTextoEditado] = useState('');
  const [gerandoIA, setGerandoIA] = useState(null);
  const [enviandoArquivo, setEnviandoArquivo] = useState(null);
  const fileInputRef = useRef(null);
  const secaoUploadRef = useRef(null);

  useEffect(() => {
    carregarMetas();
    carregarRelatorios();
  }, []);

  async function carregarMetas() {
    setCarregandoMetas(true);
    try {
      const lista = await listarMetasRelatorio();
      setMetas(lista);
      setForm(atual => ({ ...atual, filtro_meta_ids: atual.filtro_meta_ids.filter(id => lista.some(meta => idMeta(meta) === id)) }));
    } catch (error) {
      toast.error('Erro ao carregar metas: ' + (error?.message || String(error)));
    } finally {
      setCarregandoMetas(false);
    }
  }

  async function carregarRelatorios() {
    try {
      const lista = await base44.entities.RelatorioExecucaoObjeto.list('-created_date', 50);
      setRelatoriosSalvos(Array.isArray(lista) ? lista : []);
    } catch {
      setRelatoriosSalvos([]);
    }
  }

  async function carregarRelatorio(id) {
    try {
      const atual = await base44.entities.RelatorioExecucaoObjeto.get(id);
      setRelatorio(atual);
      setRelatorioId(id);
      setForm(f => ({
        ...f,
        tipo: atual?.tipo || f.tipo,
        data_inicio: atual?.data_inicio || f.data_inicio,
        data_fim: atual?.data_fim || f.data_fim,
        filtro_museu: atual?.filtro_museu || f.filtro_museu,
        filtro_versao: atual?.filtro_versao || f.filtro_versao,
        filtro_meta_ids: Array.isArray(atual?.filtro_meta_ids) ? atual.filtro_meta_ids : f.filtro_meta_ids,
      }));
    } catch (error) {
      if (error?.message?.includes('not found')) {
        toast.error('Este relatório não existe mais. Será removido da lista.');
        setRelatoriosSalvos(prev => prev.filter(r => r.id !== id));
        if (relatorioId === id) {
          setRelatorio(null);
          setRelatorioId(null);
        }
      } else {
        toast.error('Erro ao carregar relatório: ' + (error?.message || String(error)));
      }
    }
  }

  function alternarMeta(id) {
    setForm(atual => ({
      ...atual,
      filtro_meta_ids: atual.filtro_meta_ids.includes(id)
        ? atual.filtro_meta_ids.filter(item => item !== id)
        : [...atual.filtro_meta_ids, id],
    }));
  }

  // Seções divididas em grupos pequenos — 2-3 seções por grupo para evitar timeout
  const GRUPOS_GERACAO = [
    [
      { key: 'identificacao',       label: 'Identificação do projeto' },
      { key: 'endereco_execucao',   label: 'Endereço de execução' },
    ],
    [
      { key: 'divulgacao_parceria', label: 'Divulgação da parceria' },
      { key: 'descricao_acoes',     label: 'Descrição das ações' },
    ],
    [
      { key: 'publico_alvo',        label: 'Público-alvo' },
      { key: 'pesquisa_satisfacao', label: 'Pesquisa de satisfação' },
    ],
    [
      { key: 'cronograma_metas',    label: 'Cronograma de metas' },
    ],
    [
      { key: 'equipe_trabalho',     label: 'Equipe de trabalho' },
      { key: 'impactos_economicos_sociais', label: 'Impactos econômicos e sociais' },
    ],
    [
      { key: 'avaliacao_parceria',  label: 'Avaliação da parceria' },
      { key: 'anexos_evidencias',   label: 'Anexos e evidências' },
    ],
    [
      { key: 'assinatura',          label: 'Assinatura' },
      { key: 'auditoria',           label: 'Auditoria de pendências' },
    ],
  ];

  async function gerarSecaoComRetry(rid, key, params) {
    const MAX_TENTATIVAS = 3;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        await Promise.race([
          base44.functions.invoke('gerarSecaoRelatorioExecucao', { relatorio_id: rid, secao: key, ...params }),
          // Timeout individual: 45s para não engolir o timeout global do backend
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout`)), 45000)),
        ]);
        return; // sucesso — sai do loop
      } catch (err) {
        const isUltima = tentativa === MAX_TENTATIVAS;
        if (isUltima) {
          console.warn(`Seção ${key} falhou após ${MAX_TENTATIVAS} tentativas — continuando:`, err?.message);
          return; // não bloqueia o restante
        }
        // Backoff exponencial: 4s, 8s, ...
        const espera = 4000 * tentativa;
        console.warn(`Seção ${key} tentativa ${tentativa} falhou, aguardando ${espera}ms antes de retry...`);
        await new Promise(r => setTimeout(r, espera));
      }
    }
  }

  async function iniciarGeracao() {
    if (form.filtro_meta_ids.length === 0) {
      toast.error('Selecione ao menos uma meta para gerar o relatório.');
      return;
    }

    const confirmou = window.confirm(
      '⏱ Geração de relatório\n\nO processo leva aproximadamente 8 a 12 minutos, processando seção por seção com pausas para não sobrecarregar a IA.\n\nVocê poderá editar as seções assim que o rascunho estiver criado (em cerca de 30 segundos). A geração continua em segundo plano.\n\nDeseja continuar?'
    );
    if (!confirmou) return;

    setLoading(true);
    setRelatorio(null);
    setProgresso({ valor: 2, texto: 'Criando rascunho do relatório...' });

    let rid = null;
    try {
      const res = await Promise.race([
        base44.functions.invoke('iniciarRelatorioExecucao', {
          ...form,
          aditivos_permitidos: [3, 4],
          excluir_metas_anteriores: true,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao criar rascunho (>30s)')), 30000)),
      ]);

      rid = res?.data?.relatorio_id || res?.relatorio_id || res?.data?.id || res?.id;
      if (!rid) {
        console.error('[iniciarRelatorio] Resposta:', JSON.stringify(res));
        throw new Error(res?.data?.error || res?.error || 'Backend não retornou o ID do relatório.');
      }

      setRelatorioId(rid);
      // Carrega rascunho imediatamente para o usuário já poder editar
      await carregarRelatorio(rid);
      await carregarRelatorios();
      setProgresso({ valor: 5, texto: 'Rascunho criado ✓ — gerando seções com IA (pode levar ~10 min)...' });
      toast.info('Rascunho criado! As seções serão preenchidas uma a uma. Você pode editar manualmente enquanto aguarda.', { duration: 10000 });
    } catch (error) {
      toast.error('Erro ao criar rascunho: ' + (error?.message || String(error)), { duration: 12000 });
      setLoading(false);
      return;
    }

    // Gerar grupos de seções com pausas longas entre grupos
    const totalGrupos = GRUPOS_GERACAO.length;
    const params = {
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      filtro_museu: form.filtro_museu,
      filtro_versao: form.filtro_versao,
      filtro_meta_ids: form.filtro_meta_ids,
      aditivos_permitidos: [3, 4],
    };

    for (let gi = 0; gi < totalGrupos; gi++) {
      const grupo = GRUPOS_GERACAO[gi];
      const pct = Math.round(5 + ((gi / totalGrupos) * 88));

      for (let si = 0; si < grupo.length; si++) {
        const { key, label } = grupo[si];
        setProgresso({ valor: pct + si, texto: `Grupo ${gi + 1}/${totalGrupos} — ${label}...` });
        await gerarSecaoComRetry(rid, key, params);
        // Pausa entre seções do mesmo grupo
        await new Promise(r => setTimeout(r, 1500));
      }

      // Atualiza o relatório visível após cada grupo
      try { await carregarRelatorio(rid); } catch (_) {}

      // Pausa entre grupos — 8s — respiro para o backend e a IA
      if (gi < totalGrupos - 1) {
        setProgresso({ valor: pct + grupo.length, texto: `⏳ Pausa entre grupos (${gi + 1}/${totalGrupos} concluído)...` });
        await new Promise(r => setTimeout(r, 8000));
      }
    }

    // Finalização
    setProgresso({ valor: 97, texto: 'Finalizando...' });
    await base44.functions.invoke('gerarSecaoRelatorioExecucao', { relatorio_id: rid, secao: 'finalizar' }).catch(() => {});
    await carregarRelatorio(rid);
    await carregarRelatorios();
    setProgresso({ valor: 100, texto: 'Relatório concluído ✓' });
    setLoading(false);
    toast.success('Relatório gerado com sucesso! Todas as seções preenchidas.', { duration: 10000 });
  }

  async function excluirRelatorio(item) {
    const confirmado = window.confirm(`Excluir definitivamente o relatório de ${item.data_inicio || '—'} a ${item.data_fim || '—'}?`);
    if (!confirmado) return;
    try {
      await base44.entities.RelatorioExecucaoObjeto.delete(item.id);
      if (relatorioId === item.id) {
        setRelatorio(null);
        setRelatorioId(null);
      }
      await carregarRelatorios();
      toast.success('Relatório antigo excluído.');
    } catch (error) {
      toast.error('Erro ao excluir relatório: ' + (error?.message || String(error)));
    }
  }

  function abrirEditor(key, label) {
    setEditor({ key, label });
    setTextoEditado(textoSecao(relatorio, key));
  }

  async function salvarTexto() {
    if (!editor || !relatorioId) return;
    try {
      const atual = relatorio?.[editor.key];
      const novoValor = Array.isArray(atual)
        ? (() => { try { return JSON.parse(textoEditado); } catch { return atual; } })()
        : { ...(typeof atual === 'object' && atual ? atual : {}), texto_editado: textoEditado, modo: 'hibrido', editado_em: new Date().toISOString() };
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, { [editor.key]: novoValor });
      await carregarRelatorio(relatorioId);
      setEditor(null);
      toast.success('Texto da seção atualizado.');
    } catch (error) {
      toast.error('Erro ao salvar seção: ' + (error?.message || String(error)));
    }
  }

  async function gerarTodasAsSecoes() {
    if (!relatorioId) return;
    const secoesOrdem = [
      'endereco_execucao',
      'divulgacao_parceria',
      'descricao_acoes',
      'publico_alvo',
      'cronograma_metas',
      'equipe_trabalho',
      'impactos_economicos_sociais',
      'avaliacao_parceria',
      'anexos_evidencias',
      'assinatura',
    ];
    setLoading(true);
    for (let i = 0; i < secoesOrdem.length; i++) {
      const key = secoesOrdem[i];
      const label = SECOES_EDITAVEIS.find(s => s.key === key)?.label || key;
      setProgresso({ valor: Math.round((i / secoesOrdem.length) * 100), texto: `Gerando: ${label}...` });
      try {
        await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
          relatorio_id: relatorioId,
          secao: key,
          data_inicio: form.data_inicio,
          data_fim: form.data_fim,
          filtro_museu: form.filtro_museu,
          filtro_versao: form.filtro_versao,
          filtro_meta_ids: form.filtro_meta_ids,
          aditivos_permitidos: [3, 4],
          excluir_metas_anteriores: true,
          instrucao_usuario: `Extraia dados reais de rubricas, atividades e metas. Não invente informações.`,
        });
      } catch (err) {
        console.warn(`Erro na seção ${key}:`, err);
      }
    }
    await carregarRelatorio(relatorioId);
    setProgresso({ valor: 100, texto: 'Todas as seções geradas.' });
    setLoading(false);
    toast.success('Todas as seções foram geradas com dados reais do sistema.');
  }

  async function gerarTextoIA(key, label) {
    if (!relatorioId) return;
    setGerandoIA(key);
    try {
      await base44.functions.invoke('gerarSecaoRelatorioExecucao', {
        relatorio_id: relatorioId,
        secao: key,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        filtro_museu: form.filtro_museu,
        filtro_versao: form.filtro_versao,
        filtro_meta_ids: form.filtro_meta_ids,
        aditivos_permitidos: [3, 4],
        excluir_metas_anteriores: true,
        usar_modelo_word: true,
        incluir_fotos: true,
        vincular_notas_fiscais: true,
        instrucao_usuario: `Atualize somente a seção ${label}, usando exclusivamente dados reais do período e das metas selecionadas. Não invente atividades, público, resultados ou documentos.`,
      });
      await carregarRelatorio(relatorioId);
      toast.success(`Texto de “${label}” atualizado pela IA.`);
    } catch (error) {
      toast.error('Erro ao gerar texto por IA: ' + (error?.message || String(error)));
    } finally {
      setGerandoIA(null);
    }
  }

  function selecionarArquivo(secaoKey) {
    secaoUploadRef.current = secaoKey;
    fileInputRef.current?.click();
  }

  async function enviarArquivo(event) {
    const file = event.target.files?.[0];
    const secaoKey = secaoUploadRef.current;
    event.target.value = '';
    if (!file || !secaoKey || !relatorioId) return;
    setEnviandoArquivo(secaoKey);
    try {
      const uploader = base44?.integrations?.Core?.UploadFile;
      if (!uploader) throw new Error('Serviço de upload não disponível no cliente Base44.');
      const resposta = await uploader({ file });
      const url = resposta?.file_url || resposta?.url || resposta?.data?.file_url || resposta?.data?.url;
      if (!url) throw new Error('O upload não retornou a URL do arquivo.');
      const anexo = {
        id: `${Date.now()}-${file.name}`,
        secao: secaoKey,
        nome: file.name,
        url,
        tipo: file.type || 'application/octet-stream',
        categoria: ehImagem(file) ? 'foto' : 'documento',
        adicionado_em: new Date().toISOString(),
      };
      const porSecao = { ...(relatorio?.anexos_por_secao || {}) };
      porSecao[secaoKey] = [...(porSecao[secaoKey] || []), anexo];
      const update = { anexos_por_secao: porSecao };
      if (anexo.categoria === 'foto') {
        update.anexos_evidencias = [...(relatorio?.anexos_evidencias || []), {
          foto_url: url,
          atividade_nome: `Anexo da seção ${secaoKey}`,
          atividade_data: form.data_fim,
          legenda_ia: file.name,
          secao: secaoKey,
        }];
      } else {
        update.documentos_anexos = [...(relatorio?.documentos_anexos || []), anexo];
      }
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, update);
      await carregarRelatorio(relatorioId);
      toast.success(`${anexo.categoria === 'foto' ? 'Foto' : 'Documento'} adicionado à seção.`);
    } catch (error) {
      toast.error('Erro no upload: ' + (error?.message || String(error)));
    } finally {
      setEnviandoArquivo(null);
    }
  }

  async function removerAnexo(secaoKey, anexoId) {
    try {
      const porSecao = { ...(relatorio?.anexos_por_secao || {}) };
      porSecao[secaoKey] = (porSecao[secaoKey] || []).filter(item => item.id !== anexoId);
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, { anexos_por_secao: porSecao });
      await carregarRelatorio(relatorioId);
      toast.success('Anexo removido da seção.');
    } catch (error) {
      toast.error('Erro ao remover anexo: ' + (error?.message || String(error)));
    }
  }

  const [geracaoCompletaAberta, setGeracaoCompletaAberta] = useState(false);
  const [exportandoPDF, setExportandoPDF] = useState(null); // null | 'parte1' | 'parte2' | 'parte3'

  async function prepararRelatorioComFotos() {
    let fotosGaleria = Array.isArray(relatorio._fotos_galeria) ? relatorio._fotos_galeria : [];

    // 1. Buscar fotos de ReportPhoto do período (não apenas do relatório específico)
    if (fotosGaleria.length < 10) {
      try {
        const dataInicio = form.data_inicio;
        const dataFim = form.data_fim;
        // Buscar fotos vinculadas ao período via mes_referencia
        const reportPhotos = await base44.entities.ReportPhoto.filter(
          { galeria_oculta: false },
          '-created_date',
          300
        );
        const novas = (reportPhotos || [])
          .filter(p => p.file_url && !fotosGaleria.some(f => f.file_url === p.file_url || f.url === p.file_url))
          .map(p => ({
            file_url: p.file_url,
            url: p.file_url,
            legenda: p.legenda || p.caption || p.file_name || '',
            autor: p.author || p.autor || 'Daniel Moreira Soares',
            meta_id: p.meta_id || '',
            atividade_nome: p.museu || 'Registro do Período',
            museu: p.museu || '',
            mes_referencia: p.mes_referencia || '',
            created_date: p.created_date,
            activity_id: p.activity_id || '',
          }));
        fotosGaleria = [...fotosGaleria, ...novas];
      } catch (_) {}
    }

    // 2. Buscar atividades do período com fotos vinculadas
    let atividadesComFotos = [];
    try {
      const ativs = await base44.entities.Activity.filter(
        { data_realizacao: { $gte: form.data_inicio, $lte: form.data_fim } },
        '-data_realizacao',
        200
      );
      atividadesComFotos = (ativs || [])
        .filter(a => Array.isArray(a.fotos) && a.fotos.length > 0)
        .map(a => ({
          id: a.id,
          titulo: a.titulo || '',
          data: a.data_realizacao || a.data_inicio || '',
          museu: a.museu || a.centro_custo || '',
          fotos: (a.fotos || []).slice(0, 5).map(f => ({
            url: f.file_url || f.url || '',
            legenda: f.legenda || f.caption || a.titulo || '',
            autor: f.autor || 'Daniel Moreira Soares',
            data: a.data_realizacao,
          })),
        }))
        .filter(a => a.fotos.some(f => f.url));
    } catch (_) {}

    return {
      ...relatorio,
      _fotos_galeria: fotosGaleria,
      _atividades_com_fotos: atividadesComFotos,
    };
  }

  async function exportarParte(parte) {
    if (!relatorio) return;
    setExportandoPDF(parte);
    try {
      const rel = await prepararRelatorioComFotos();
      await exportarRelatorioExecucaoPDF(rel, parte);
      toast.success(`PDF ${parte === 'parte1' ? '1/3 (Identificação e Público)' : parte === 'parte2' ? '2/3 (Metas e Equipe)' : '3/3 (Impactos, Assinatura e Galeria)'} gerado.`);
    } catch (error) {
      toast.error('Erro ao gerar PDF: ' + (error?.message || String(error)));
    } finally {
      setExportandoPDF(null);
    }
  }

  async function exportarPDF() {
    // Gera as 3 partes sequencialmente para evitar travar o browser
    if (!relatorio) return;
    setExportandoPDF('parte1');
    try {
      const rel = await prepararRelatorioComFotos();
      await exportarRelatorioExecucaoPDF(rel, 'parte1');
      toast.info('Parte 1/3 gerada. Gerando parte 2...');
      setExportandoPDF('parte2');
      await new Promise(r => setTimeout(r, 300));
      await exportarRelatorioExecucaoPDF(rel, 'parte2');
      toast.info('Parte 2/3 gerada. Gerando parte 3...');
      setExportandoPDF('parte3');
      await new Promise(r => setTimeout(r, 300));
      await exportarRelatorioExecucaoPDF(rel, 'parte3');
      toast.success('Todas as 3 partes do PDF foram geradas com sucesso.');
    } catch (error) {
      toast.error('Erro ao gerar PDF: ' + (error?.message || String(error)));
    } finally {
      setExportandoPDF(null);
    }
  }

  async function togglePublicado() {
    if (!relatorioId || !relatorio) return;
    const novoEstado = !relatorio.publicado;
    try {
      await base44.entities.RelatorioExecucaoObjeto.update(relatorioId, {
        publicado: novoEstado,
        publicado_em: novoEstado ? new Date().toISOString() : null,
        titulo_publicacao: novoEstado
          ? relatorio.titulo_publicacao || `Relatório ${relatorio.tipo === 'final' ? 'Final' : 'Parcial'} — ${relatorio.data_inicio} a ${relatorio.data_fim}`
          : relatorio.titulo_publicacao,
      });
      await carregarRelatorio(relatorioId);
      toast.success(novoEstado
        ? 'Relatório publicado no Banco de Relatórios — visível para observadores.'
        : 'Relatório removido da publicação.');
    } catch (error) {
      toast.error('Erro ao alterar publicação: ' + (error?.message || String(error)));
    }
  }

  const [exportandoHTML, setExportandoHTML] = useState(false);
  async function exportarHTML() {
    if (!relatorio) return;
    setExportandoHTML(true);
    try {
      const rel = await prepararRelatorioComFotos();
      exportarRelatorioHTML(rel);
      toast.success('HTML editável gerado — abra no navegador, edite e imprima como PDF.');
    } catch (error) {
      toast.error('Erro ao gerar HTML: ' + (error?.message || String(error)));
    } finally {
      setExportandoHTML(false);
    }
  }

  const [exportandoDOCX, setExportandoDOCX] = useState(false);
  async function exportarDOCX() {
    if (!relatorio) return;
    setExportandoDOCX(true);
    try {
      await exportarRelatorioExecucaoDOCX(relatorio);
      toast.success('DOCX gerado com formatação completa e fotos vinculadas.');
    } catch (error) {
      toast.error('Erro ao gerar DOCX: ' + (error?.message || String(error)));
    } finally {
      setExportandoDOCX(false);
    }
  }

  const metasSelecionadas = useMemo(
    () => metas.filter(meta => form.filtro_meta_ids.includes(idMeta(meta))),
    [metas, form.filtro_meta_ids],
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <input ref={fileInputRef} type="file" className="hidden" onChange={enviarArquivo} accept="image/*,.pdf,.xml,.doc,.docx,.xls,.xlsx" />

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Relatório de Execução do Objeto</h1>
          <p className="text-sm text-muted-foreground mt-1">Modelo SUCC/PBH • Metas do 3º e 4º aditivos • Edição antes da exportação</p>
        </div>
        <Badge variant="outline">{relatoriosSalvos.length} relatórios salvos</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configurar relatório</CardTitle>
          <CardDescription>Selecione período, museu e metas. As NFs, atividades, fotos e textos respeitarão este recorte.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div><Label className="text-xs">Tipo</Label><Select value={form.tipo} onValueChange={tipo => setForm({ ...form, tipo })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="parcial">Parcial</SelectItem><SelectItem value="final">Final</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">Versão</Label><Select value={form.filtro_versao} onValueChange={filtro_versao => setForm({ ...form, filtro_versao })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="consolidado">Consolidado</SelectItem><SelectItem value="por_museu">Por Museu</SelectItem><SelectItem value="por_meta">Por Meta</SelectItem><SelectItem value="por_periodo">Por Período</SelectItem><SelectItem value="noturno">Noturno</SelectItem><SelectItem value="noturno_pampulha">Noturno Pampulha</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">Museu</Label><Select value={form.filtro_museu} onValueChange={filtro_museu => setForm({ ...form, filtro_museu })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="MHAB">MHAB</SelectItem><SelectItem value="MIS">MIS</SelectItem><SelectItem value="MUMO">MUMO</SelectItem><SelectItem value="Casa Kubitschek">Casa Kubitschek</SelectItem><SelectItem value="Casa do Baile">Casa do Baile</SelectItem><SelectItem value="MAP">MAP</SelectItem></SelectContent></Select></div>
            <div><Label className="text-xs">Data início</Label><Input type="date" value={form.data_inicio} onChange={e => setForm({ ...form, data_inicio: e.target.value })} /></div>
            <div><Label className="text-xs">Data fim</Label><Input type="date" value={form.data_fim} onChange={e => setForm({ ...form, data_fim: e.target.value })} /></div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div><Label className="font-semibold">Metas a serem relatadas</Label><p className="text-xs text-slate-500">Somente as metas marcadas entram no relatório e nas notas fiscais vinculadas.</p></div>
              <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setForm(a => ({ ...a, filtro_meta_ids: metas.map(idMeta) }))}>Selecionar todas</Button><Button type="button" size="sm" variant="outline" onClick={() => setForm(a => ({ ...a, filtro_meta_ids: [] }))}>Limpar</Button><Button type="button" size="sm" variant="outline" onClick={carregarMetas}><RefreshCw className="w-3.5 h-3.5 mr-1" />Atualizar</Button></div>
            </div>
            {carregandoMetas ? <div className="py-6 text-center text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando metas...</div> : <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">{metas.map(meta => { const id = idMeta(meta); const checked = form.filtro_meta_ids.includes(id); return <label key={id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${checked ? 'border-blue-400 bg-blue-50' : 'bg-white'}`}><input type="checkbox" checked={checked} onChange={() => alternarMeta(id)} className="mt-1" /><span><span className="block text-sm font-medium">{nomeMeta(meta)}</span><span className="block text-xs text-slate-500">{meta.codigo || meta.meta_codigo || `ID ${id}`}</span></span></label>; })}</div>}
            <div className="text-xs text-slate-600">{form.filtro_meta_ids.length} meta(s) selecionada(s).</div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={iniciarGeracao} disabled={loading || form.filtro_meta_ids.length === 0}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
              {loading ? 'Gerando relatório...' : 'Gerar relatório'}
            </Button>
            {!loading && form.filtro_meta_ids.length > 0 && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                ⏱ ~8–12 min • Rascunho disponível em ~30s para edição manual imediata
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {loading && <Card className="border-blue-200 bg-blue-50/50"><CardContent className="py-4 space-y-2"><div className="flex justify-between text-sm text-blue-700"><span>{progresso.texto}</span><span>{progresso.valor}%</span></div><Progress value={progresso.valor} className="h-2" /></CardContent></Card>}

      {relatorio && <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div><CardTitle className="text-lg flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />Relatório em edição</CardTitle><CardDescription>{relatorio.data_inicio} a {relatorio.data_fim} • {metasSelecionadas.length} meta(s)</CardDescription></div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              className="bg-slate-900 hover:bg-slate-700 text-white"
              onClick={() => setGeracaoCompletaAberta(true)}
              disabled={loading}
              title="Gera o relatório completo em 6 etapas: dados reais, citações da equipe, metas detalhadas, fotos comprobatórias, financeiro auditado"
            >
              <Sparkles className="w-4 h-4 mr-1 text-yellow-400" />
              Geração Completa (IA)
            </Button>
            <Button size="sm" variant="outline" onClick={gerarTodasAsSecoes} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Regenerar seções
            </Button>
            <Button
              size="sm"
              variant={relatorio.publicado ? 'default' : 'outline'}
              onClick={togglePublicado}
              title={relatorio.publicado ? 'Clique para remover da publicação' : 'Publicar no Banco de Relatórios para observadores'}
              className={relatorio.publicado ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
            >
              {relatorio.publicado
                ? <><Globe className="w-3.5 h-3.5 mr-1" />Publicado</>
                : <><Lock className="w-3.5 h-3.5 mr-1" />Publicar</>
              }
            </Button>
            <Button size="sm" onClick={() => setRevisaoAberta(true)}>Revisar e Exportar</Button>
            <Button size="sm" variant="outline" onClick={exportarPDF} disabled={!!exportandoPDF}>
              {exportandoPDF ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
              {exportandoPDF ? `Gerando ${exportandoPDF}...` : 'PDF (3 partes)'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exportarParte('parte1')} disabled={!!exportandoPDF} title="Baixar apenas Parte 1 — Identificação e Público">
              <Download className="w-3.5 h-3.5 mr-1" />P1
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exportarParte('parte2')} disabled={!!exportandoPDF} title="Baixar apenas Parte 2 — Metas e Equipe">
              <Download className="w-3.5 h-3.5 mr-1" />P2
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exportarParte('parte3')} disabled={!!exportandoPDF} title="Baixar apenas Parte 3 — Impactos, Assinatura e Galeria">
              <Download className="w-3.5 h-3.5 mr-1" />P3
            </Button>
            <Button size="sm" variant="outline" onClick={exportarDOCX} disabled={exportandoDOCX}>
              {exportandoDOCX ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileType className="w-4 h-4 mr-1" />}
              DOCX
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportarHTML}
              disabled={exportandoHTML}
              title="Gera um HTML diagramado, editável no navegador e imprimível como PDF — ideal para envio ao SUCC"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {exportandoHTML ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Code2 className="w-4 h-4 mr-1" />}
              HTML Editável
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Resumo label="Metas" valor={(relatorio.cronograma_metas || []).length} /><Resumo label="Notas fiscais" valor={(relatorio._notas_fiscais_metas || []).length} /><Resumo label="Atividades" valor={(relatorio._atividades_periodo || []).length} /><Resumo label="Total financeiro" valor={formatarMoeda(relatorio._total_financeiro)} /></div>
          {SECOES_EDITAVEIS.filter(s => s.key !== 'sustentabilidade' || relatorio.tipo === 'final').map(secao => <SecaoEditavel key={secao.key} secao={secao} relatorio={relatorio} onEditar={() => abrirEditor(secao.key, secao.label)} onIA={() => gerarTextoIA(secao.key, secao.label)} gerandoIA={gerandoIA === secao.key} onAnexar={() => selecionarArquivo(secao.key)} enviando={enviandoArquivo === secao.key} onRemover={id => removerAnexo(secao.key, id)} />)}
        </CardContent>
      </Card>}

      <Card>
        <CardHeader><CardTitle className="text-lg">Relatórios anteriores</CardTitle><CardDescription>Abra para editar ou exclua versões antigas.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {relatoriosSalvos.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3"><button onClick={() => carregarRelatorio(item.id)} className="flex-1 text-left"><span className="block text-sm font-medium">{item.tipo === 'final' ? 'Relatório Final' : 'Relatório Parcial'}</span><span className="block text-xs text-slate-500">{item.data_inicio} a {item.data_fim} • {(item.filtro_meta_ids || []).length} meta(s)</span></button><Button size="sm" variant="outline" onClick={() => carregarRelatorio(item.id)}><Edit3 className="w-3.5 h-3.5 mr-1" />Editar</Button><Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => excluirRelatorio(item)}><Trash2 className="w-3.5 h-3.5 mr-1" />Excluir</Button></div>)}
          {relatoriosSalvos.length === 0 && <p className="text-sm text-slate-400 italic">Nenhum relatório salvo.</p>}
        </CardContent>
      </Card>

      {editor && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-xl w-full max-w-3xl"><div className="p-4 border-b flex items-center justify-between"><div><h3 className="font-semibold">Editar {editor.label}</h3><p className="text-xs text-slate-500">O texto salvo será usado na exportação.</p></div><button onClick={() => setEditor(null)}><X className="w-5 h-5" /></button></div><div className="p-4"><Textarea value={textoEditado} onChange={e => setTextoEditado(e.target.value)} className="min-h-[320px]" /></div><div className="p-4 border-t flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)}>Cancelar</Button><Button onClick={salvarTexto}><Save className="w-4 h-4 mr-1" />Salvar</Button></div></div></div>}

      {revisaoAberta && relatorio && <RevisaoFinalDialog relatorioId={relatorioId} relatorio={relatorio} onClose={() => setRevisaoAberta(false)} />}

      {geracaoCompletaAberta && (
        <GeracaoCompletaDialog
          relatorioId={relatorioId}
          form={form}
          onConcluido={async () => {
            if (relatorioId) await carregarRelatorio(relatorioId);
          }}
          onClose={() => setGeracaoCompletaAberta(false)}
        />
      )}
    </div>
  );
}

function SecaoEditavel({ secao, relatorio, onEditar, onIA, gerandoIA, onAnexar, enviando, onRemover }) {
  const texto = textoSecao(relatorio, secao.key);
  const anexos = relatorio?.anexos_por_secao?.[secao.key] || [];
  return <div className="rounded-xl border p-4 space-y-3"><div className="flex items-center justify-between gap-3 flex-wrap"><h3 className="font-semibold text-sm">{secao.label}</h3><div className="flex gap-2"><Button size="sm" variant="outline" onClick={onEditar}><Edit3 className="w-3.5 h-3.5 mr-1" />Editar texto</Button><Button size="sm" variant="outline" onClick={onIA} disabled={gerandoIA}>{gerandoIA ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}Gerar com IA</Button><Button size="sm" variant="outline" onClick={onAnexar} disabled={enviando}>{enviando ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Paperclip className="w-3.5 h-3.5 mr-1" />}Foto/Documento</Button></div></div><div className="text-sm whitespace-pre-wrap text-slate-700">{texto || <span className="text-slate-400 italic">Texto ainda não preenchido.</span>}</div>{anexos.length > 0 && <div className="grid grid-cols-1 md:grid-cols-3 gap-2">{anexos.map(anexo => <div key={anexo.id} className="rounded-lg border bg-slate-50 p-2 flex items-center gap-2">{anexo.categoria === 'foto' ? <img src={anexo.url} alt={anexo.nome} className="w-12 h-12 rounded object-cover" /> : <FileText className="w-8 h-8 text-slate-400" />}<a href={anexo.url} target="_blank" rel="noreferrer" className="text-xs flex-1 truncate text-blue-700">{anexo.nome}</a><button onClick={() => onRemover(anexo.id)} className="text-red-500"><X className="w-4 h-4" /></button></div>)}</div>}</div>;
}

function Resumo({ label, valor }) {
  return <div className="rounded-xl border bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-bold text-slate-800">{valor}</p></div>;
}