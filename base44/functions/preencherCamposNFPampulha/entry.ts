import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import OpenAI from 'npm:openai';

/**
 * preencherCamposNFPampulha — v2
 *
 * Preenche o campo `cod` (N4 oficial, 2 dígitos) nas compras do Noturno Pampulha.
 *
 * CASO 1: tem rubrica vinculada → resolve pelo grupo/rubrica (mapa expandido)
 * CASO 2: sem rubrica vinculada → infere diretamente da descrição + fornecedor
 *         usando mapa fixo por subcategoria do Pampulha
 *
 * Nunca sobrescreve status_cod=OK existente, a menos que force=true.
 */

const PAMPULHA_CENTROS = ['Noturno Pampulha', 'Noturno nos Museus Pampulha', 'Noturno 2026', 'Noturno nos Museus 2026'];
const CODIGOS_VALIDOS = new Set(['02', '13', '17', '22', '23', '24', '41', '42', '99']);

// ── Normalização ───────────────────────────────────────────────────────────────
function norm(v: string): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── MAPA FIXO: grupo/rubrica → cod ────────────────────────────────────────────
// Cobertura total dos grupos do Noturno Pampulha e Noturno 2026
function resolverCodPorGrupo(rubrica: any): string | 'COMUNICACAO' | null {
  const texto = norm([
    rubrica.grupo || '',
    rubrica.rubrica || rubrica.nome || '',
    rubrica.descricao || '',
  ].join(' '));

  // Artistas / atrações → 22
  if (
    texto.includes('artista') ||
    texto.includes('atracao') ||
    texto.includes('atracoes') ||
    texto.includes('contratacao de artistas') ||
    texto.includes('apresentacoes culturais') ||
    texto.includes('apresentacao cultural')
  ) return '22';

  // Segurança → 02
  if (texto.includes('seguranca')) return '02';

  // Limpeza → 41
  if (texto.includes('limpeza')) return '41';

  // Kit iluminação → 17
  if (texto.includes('kit de iluminacao') || texto.includes('kit iluminacao')) return '17';

  // Infraestrutura / produção infra → 99
  if (
    texto.includes('infraestrutura') ||
    texto.includes('producao e infraestrutura') ||
    texto.includes('producao infraestrutura') ||
    texto.includes('sonorizacao') ||
    texto.includes('iluminacao') ||
    texto.includes('locacao de grades') ||
    texto.includes('carreto') ||
    texto.includes('mobiliario') ||
    texto.includes('camarim')
  ) return '99';

  // Equipe técnica / coordenação / assistente de produção / monitores → 42
  if (
    texto.includes('equipe tecnica') ||
    texto.includes('equipe e coordenacao') ||
    texto.includes('coordenacao') ||
    texto.includes('assistente de producao') ||
    texto.includes('monitor') ||
    texto.includes('tecnica e coordenacao')
  ) return '42';

  // Comunicação e divulgação → análise secundária
  if (
    texto.includes('comunicacao e divulgacao') ||
    texto.includes('comunicacao') ||
    texto.includes('divulgacao') ||
    texto.includes('design') ||
    texto.includes('midia')
  ) return 'COMUNICACAO';

  // Vídeo / fotografia → 24
  if (
    texto.includes('video') ||
    texto.includes('video e fotografia') ||
    texto.includes('audiovisual') ||
    texto.includes('fotografia')
  ) return '24';

  return null;
}

// ── MAPA DE INFERÊNCIA SEM RUBRICA: palavras-chave da compra → cod ─────────────
// Usado quando não há rubrica_id vinculado
function inferirCodSemRubrica(compra: any): { cod: string | null; motivo: string } {
  const texto = norm([
    compra.descricao_item || '',
    compra.fornecedor_nome || '',
    compra.categoria || '',
    compra.observacoes || '',
  ].join(' '));

  // Segurança → 02
  if (texto.includes('seguranca') || texto.includes('vigilancia')) {
    return { cod: '02', motivo: 'inferido_sem_rubrica: segurança' };
  }

  // Limpeza → 41
  if (texto.includes('limpeza') || texto.includes('higienizacao')) {
    return { cod: '41', motivo: 'inferido_sem_rubrica: limpeza' };
  }

  // Kit iluminação → 17
  if (texto.includes('kit de iluminacao') || texto.includes('kit iluminacao') || texto.includes('arte em iluminar')) {
    return { cod: '17', motivo: 'inferido_sem_rubrica: kit iluminação' };
  }

  // Sinalização física → 13
  if (
    texto.includes('sinalizacao') ||
    texto.includes('servico grafico de sinalizacao') ||
    texto.includes('flag impressao') ||
    texto.includes('impressao de sinalizacao')
  ) {
    return { cod: '13', motivo: 'inferido_sem_rubrica: sinalização' };
  }

  // Fotografia / vídeo / audiovisual → 24
  if (
    texto.includes('audiovisual') ||
    texto.includes('video e fotografia') ||
    texto.includes('fotografo') ||
    texto.includes('filmagem') ||
    texto.includes('cobertura fotografica') ||
    texto.includes('registro audiovisual') ||
    texto.includes('noturno nos museus audiovisual')
  ) {
    return { cod: '24', motivo: 'inferido_sem_rubrica: fotografia/vídeo' };
  }

  // Artistas / apresentações culturais / samba / atrações → 22
  if (
    texto.includes('artista') ||
    texto.includes('apresentacao cultural') ||
    texto.includes('apresentacoes culturais') ||
    texto.includes('samba') ||
    texto.includes('velha guarda') ||
    texto.includes('atipica de lhamas') ||
    texto.includes('margaret baba') ||
    texto.includes('kdu da favelinha') ||
    texto.includes('colares de mandalas') ||
    texto.includes('rodrigo borges') ||
    texto.includes('prata de colagem') ||
    texto.includes('prata colagem')
  ) {
    return { cod: '22', motivo: 'inferido_sem_rubrica: artistas/apresentações' };
  }

  // Equipe / assistente de produção / coordenação / monitores / daniela isis → 42
  if (
    texto.includes('assistente de producao') ||
    texto.includes('coordenacao') ||
    texto.includes('equipe tecnica') ||
    texto.includes('monitor') ||
    texto.includes('daniela isis') ||
    texto.includes('equipe pampulha') ||
    texto.includes('producao pampulha')
  ) {
    return { cod: '42', motivo: 'inferido_sem_rubrica: equipe/coordenação' };
  }

  // Design gráfico / identidade visual / marketing → 23
  if (
    texto.includes('design grafico') ||
    texto.includes('designer') ||
    texto.includes('identidade visual') ||
    texto.includes('marketing') ||
    texto.includes('redes sociais') ||
    texto.includes('social media')
  ) {
    return { cod: '23', motivo: 'inferido_sem_rubrica: design/comunicação' };
  }

  // Infraestrutura: sonorização, iluminação (cênica), grades, carreto, tendas, palco → 99
  if (
    texto.includes('sonorizacao') ||
    texto.includes('iluminacao') ||
    texto.includes('locacao de grades') ||
    texto.includes('locacao de grade') ||
    texto.includes('carreto') ||
    texto.includes('mobiliario') ||
    texto.includes('camarim') ||
    texto.includes('tenda') ||
    texto.includes('palco') ||
    texto.includes('atelie do evento') ||
    texto.includes('polvo studio') ||
    texto.includes('global support') ||
    texto.includes('flag digital') ||
    texto.includes('estrutura') ||
    texto.includes('locacao de equipamento')
  ) {
    return { cod: '99', motivo: 'inferido_sem_rubrica: infraestrutura/produção' };
  }

  return { cod: null, motivo: 'sem_match_possivel' };
}

// ── Análise determinística da descrição para grupo Comunicação ─────────────────
function resolverCodComunicacaoDeterministico(descricao: string): string | null {
  const d = norm(descricao);

  // Sinalização física → 13
  if (
    d.includes('sinalizacao') ||
    d.includes('grafico de sinalizacao') ||
    d.includes('placa') ||
    d.includes('faixa') ||
    d.includes('banner') ||
    d.includes('impressao de sinalizacao') ||
    d.includes('flag impressao') ||
    d.includes('flag digital')
  ) return '13';

  // Designer / identidade visual / marketing → 23
  if (
    d.includes('designer') ||
    d.includes('design grafico') ||
    d.includes('identidade visual') ||
    d.includes('marketing') ||
    d.includes('redes sociais') ||
    d.includes('social media') ||
    d.includes('post') ||
    d.includes('assessoria de imprensa')
  ) return '23';

  // Fotografia / vídeo → 24
  if (
    d.includes('fotografia') ||
    d.includes('fotografo') ||
    d.includes('video') ||
    d.includes('audiovisual') ||
    d.includes('filmagem') ||
    d.includes('cobertura fotografica')
  ) return '24';

  return null;
}

// ── Fallback IA para comunicação ambígua ──────────────────────────────────────
async function resolverCodComunicacaoIA(descricao: string): Promise<string | null> {
  try {
    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
    const prompt = `Você é um classificador de despesas culturais. Dado o objeto/descrição de uma compra do projeto "Noturno nos Museus Pampulha", retorne APENAS o código N4 de 2 dígitos mais adequado, sem nenhum texto adicional.

Regras:
- '13' → sinalização física, impressão gráfica de sinalização, comunicação visual impressa, banner, faixa, placa
- '23' → design gráfico, identidade visual, marketing digital, redes sociais, peças gráficas digitais, assessoria de imprensa
- '24' → fotografia, vídeo, filmagem, registro audiovisual

Objeto da compra: "${descricao}"

Responda APENAS com o código (13, 23 ou 24). Se não for possível classificar, responda "null".`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10,
      temperature: 0,
    });

    const resultado = (resp.choices[0]?.message?.content || '').trim();
    if (['13', '23', '24'].includes(resultado)) return resultado;
    return null;
  } catch (e) {
    console.error('[preencherCamposNFPampulha] Falha IA comunicação:', e?.message || e);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const force: boolean = body.force === true;

    // ── Buscar rubricas do Noturno Pampulha e Noturno 2026 ─────────────────────
    const rubricasLists = await Promise.all(
      PAMPULHA_CENTROS.map(cc => base44.asServiceRole.entities.Rubrica.filter({ centro_custo: cc, ativo: true }))
    );
    const rubricas: any[] = rubricasLists.flat();
    const rubricaMap = new Map<string, any>();
    for (const r of rubricas) rubricaMap.set(r.id, r);

    // ── Buscar compras do Noturno Pampulha e Noturno 2026 ──────────────────────
    const comprasLists = await Promise.all(
      PAMPULHA_CENTROS.map(cc => base44.asServiceRole.entities.PurchaseRequest.filter({ centro_custo: cc }))
    );
    const compras: any[] = comprasLists.flat();
    // Deduplicar por id
    const vistos = new Set<string>();
    const comprasUnicas = compras.filter(c => { if (vistos.has(c.id)) return false; vistos.add(c.id); return true; });

    // ── Contadores ─────────────────────────────────────────────────────────────
    let atualizadas = 0;
    let sem_match = 0;
    let sem_cod_comunicacao = 0;
    let ja_completas = 0;
    let inferidas_sem_rubrica = 0;
    const detalhes: any[] = [];

    for (const compra of comprasUnicas) {
      // Já tem cod OK e não é force → pular
      if (!force && compra.cod && CODIGOS_VALIDOS.has(String(compra.cod)) && compra.status_cod === 'OK') {
        ja_completas++;
        continue;
      }
      // Cod já preenchido mas sem status OK → continuar para validar

      const rubrica = compra.rubrica_id ? (rubricaMap.get(compra.rubrica_id) || null) : null;

      let cod: string | null = null;
      let fonte = '';
      let motivo = '';

      if (!rubrica) {
        // ── CASO 2: sem rubrica → inferência por palavras-chave da compra ───────
        const inferencia = inferirCodSemRubrica(compra);
        cod = inferencia.cod;
        fonte = 'inferido_sem_rubrica';
        motivo = inferencia.motivo;

        if (!cod) {
          sem_match++;
          detalhes.push({
            id: compra.id,
            descricao: compra.descricao_item,
            fornecedor: compra.fornecedor_nome,
            motivo: 'sem_rubrica_e_sem_match_por_descricao',
            cod_aplicado: null,
            rubrica_grupo: null,
            campos_atualizados: [],
          });
          continue;
        }
        inferidas_sem_rubrica++;
      } else {
        // ── CASO 1: tem rubrica → resolve pelo grupo ──────────────────────────
        const grupoResult = resolverCodPorGrupo(rubrica);

        if (grupoResult === 'COMUNICACAO') {
          const descricao = compra.descricao_item || '';
          cod = resolverCodComunicacaoDeterministico(descricao);
          if (cod) {
            fonte = 'determinístico_comunicação';
          } else {
            cod = await resolverCodComunicacaoIA(descricao);
            if (cod) {
              fonte = 'ia_comunicação';
            } else {
              sem_cod_comunicacao++;
              detalhes.push({
                id: compra.id,
                descricao: compra.descricao_item,
                fornecedor: compra.fornecedor_nome,
                motivo: 'sem_cod_comunicacao_apos_ia',
                cod_aplicado: null,
                rubrica_grupo: rubrica.grupo || rubrica.rubrica,
                campos_atualizados: [],
              });
              continue;
            }
          }
        } else if (grupoResult && CODIGOS_VALIDOS.has(grupoResult)) {
          cod = grupoResult;
          fonte = 'grupo_rubrica';
        } else {
          // Grupo não mapeado → tentar inferência pela descrição como fallback
          const inferencia = inferirCodSemRubrica(compra);
          if (inferencia.cod) {
            cod = inferencia.cod;
            fonte = 'inferido_descricao_fallback';
            motivo = inferencia.motivo + ` (grupo rubrica: "${rubrica.grupo || ''}")`;
          } else {
            sem_match++;
            detalhes.push({
              id: compra.id,
              descricao: compra.descricao_item,
              fornecedor: compra.fornecedor_nome,
              motivo: 'grupo_rubrica_nao_mapeado',
              cod_aplicado: null,
              rubrica_grupo: rubrica.grupo || rubrica.rubrica,
              campos_atualizados: [],
            });
            continue;
          }
        }
      }

      // ── Aplicar updates ────────────────────────────────────────────────────────
      const camposAtualizados: string[] = [];
      const statusCod = fonte === 'inferido_sem_rubrica' || fonte === 'inferido_descricao_fallback' ? 'INFERIDO' : 'OK';

      await base44.asServiceRole.entities.PurchaseRequest.update(compra.id, { cod, status_cod: statusCod });
      camposAtualizados.push('cod', 'status_cod');

      // Sincronizar rubrica.codigo se vazio
      if (rubrica && !rubrica.codigo) {
        await base44.asServiceRole.entities.Rubrica.update(rubrica.id, { codigo: cod }).catch(() => null);
        camposAtualizados.push('rubrica.codigo');
      }

      atualizadas++;
      detalhes.push({
        id: compra.id,
        descricao: compra.descricao_item,
        fornecedor: compra.fornecedor_nome,
        cod_aplicado: cod,
        status_cod: statusCod,
        fonte,
        motivo: motivo || fonte,
        rubrica_grupo: rubrica ? (rubrica.grupo || rubrica.rubrica) : '(sem rubrica)',
        campos_atualizados: camposAtualizados,
      });
    }

    return Response.json({
      success: true,
      total: comprasUnicas.length,
      atualizadas,
      ja_completas,
      sem_match,
      sem_cod_comunicacao,
      inferidas_sem_rubrica,
      detalhes,
    });

  } catch (error: any) {
    console.error('[preencherCamposNFPampulha]', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});