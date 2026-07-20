import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const MESES_CAP = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function formatDateBR(value: any) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

function parseContexto(contextoRaw: any) {
  if (!contextoRaw) return { pastaOrigem: '', caminho: '' };
  try {
    const obj = typeof contextoRaw === 'string' ? JSON.parse(contextoRaw) : contextoRaw;
    return {
      pastaOrigem: String(obj?.pasta_origem || ''),
      caminho: String(obj?.caminho || ''),
    };
  } catch {
    return { pastaOrigem: '', caminho: String(contextoRaw || '') };
  }
}

function extrairPeriodoDoNome(fileName: string) {
  // Padrão: GALERIA2_MUSEU_MM_YYYY_...
  const match = fileName.match(/_(\d{2})_(\d{4})_/);
  if (match) {
    const mesNum = Number(match[1]);
    const ano = Number(match[2]);
    if (mesNum >= 1 && mesNum <= 12) {
      return { mes: MESES_CAP[mesNum - 1], mesNum, ano };
    }
  }
  return { mes: '', mesNum: null, ano: null };
}

function gerarLegendaEstruturada(foto: any) {
  const partes: string[] = [];
  const { pastaOrigem, caminho } = parseContexto(foto.contexto_ia);

  // 1. Museu/Local (priorizar campo museu, depois pasta de origem)
  const museu = foto.museu || '';
  const local = pastaOrigem || museu || '';
  if (local && local !== 'GERAL') {
    partes.push(local);
  } else if (museu) {
    partes.push(museu);
  }

  // 2. Atividade (extrair do nome do arquivo se houver padrão)
  const nomeArq = foto.file_name || '';
  // Remover prefixos GALERIA2_ e códigos de museu/data
  const nomeLimpo = nomeArq
    .replace(/^GALERIA2_[^_]+_\d{2}_\d{4}_/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
    .trim();
  if (nomeLimpo && nomeLimpo.length > 2) {
    partes.push(nomeLimpo);
  }

  // 3. Período (mês/ano)
  const periodo = extrairPeriodoDoNome(nomeArq);
  if (periodo.mes && periodo.ano) {
    partes.push(`${periodo.mes}/${periodo.ano}`);
  } else if (foto.mes_referencia && foto.ano) {
    partes.push(`${foto.mes_referencia}/${foto.ano}`);
  } else {
    const dataFmt = formatDateBR(foto.created_date);
    if (dataFmt) partes.push(dataFmt);
  }

  return partes.length > 0 ? partes.join(' — ') : (foto.file_name || 'Foto');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try { user = await base44.auth.me(); } catch {}
    if (!user) return Response.json({ success: false, error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { dry_run = false, limit = 500 } = body;

    // Buscar ReportPhoto importadas do Drive (fonte_ia = 'drive_sync')
    const fotos = await base44.asServiceRole.entities.ReportPhoto.filter({
      fonte_ia: 'drive_sync'
    }).catch(() => []);

    const lote = (fotos || []).slice(0, limit);
    let atualizadas = 0;
    let semMudanca = 0;
    const erros: any[] = [];

    // Preparar updates em lote
    const updates: any[] = [];

    for (const foto of lote) {
      const novaLegenda = gerarLegendaEstruturada(foto);
      const legendaAtual = foto.caption || foto.legenda || '';

      if (novaLegenda && novaLegenda !== legendaAtual) {
        if (!dry_run) {
          updates.push({
            id: foto.id,
            caption: novaLegenda,
            legenda: novaLegenda,
          });
        } else {
          atualizadas++;
        }
      } else {
        semMudanca++;
      }
    }

    // Executar updates em lote (bulkUpdate)
    if (!dry_run && updates.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        try {
          await base44.asServiceRole.entities.ReportPhoto.bulkUpdate(chunk);
          atualizadas += chunk.length;
        } catch (e: any) {
          erros.push({ chunk: i, erro: String(e?.message || e) });
        }
      }
    }

    return Response.json({
      success: erros.length === 0,
      dry_run,
      total_processadas: lote.length,
      atualizadas,
      sem_mudanca: semMudanca,
      erros: erros.length,
      erros_detalhe: erros.slice(0, 10),
      mensagem: dry_run
        ? `Simulação: ${atualizadas} legendas seriam atualizadas.`
        : `${atualizadas} legendas atualizadas com sucesso.`,
    });
  } catch (error: any) {
    return Response.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
});