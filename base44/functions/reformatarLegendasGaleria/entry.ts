import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const MUSEU_MAP = {
  'MISBH': 'MIS',
  'MISH': 'MIS',
  'MUMO': 'MUMO',
  'MHAB': 'MHAB',
  'MAB': 'MHAB',
  'MIS': 'MIS',
  'GERAL': 'Geral',
};

function toTitleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(w => {
      if (w.length <= 2 && ['de','da','do','a','o','e'].includes(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

// Patterns:
// "Foto de Registro — 2026-05-MHAB-OFICINA RASTROS E REMIX João Perdigão"
// "2026-05-MUMO-COLOQUIO Daniel Moreira"
// "2026-MUMO-Nome da atividade"
function parseLegenda(legenda, photo) {
  if (!legenda) return null;

  // Pattern 1: ANO-MES-MUSEU-ATIVIDADE (e.g. 2026-05-MHAB-NOME)
  const m1 = legenda.match(/(20\d{2})-(\d{2})-(MISBH|MHAB|MUMO|MAB|MIS|GERAL)-(.+?)(?:\s*[-–]\s*\w[\w\s]+)?$/i);
  if (m1) {
    const ano = m1[1];
    const mes = parseInt(m1[2], 10);
    const museuRaw = m1[3].toUpperCase();
    const museu = MUSEU_MAP[museuRaw] || museuRaw;
    const atividadeRaw = m1[4]
      .replace(/[\u00B7·].*$/, '') // remove crédito após "·"
      .replace(/\s+-\s+[A-ZÁÉÍÓÚ][a-záéíóú][a-záéíóú]+(\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)*.*$/, '') // remove " - Nome Sobrenome"
      .trim();
    const atividade = toTitleCase(atividadeRaw);
    const mesNome = MESES[mes - 1] || `${mes}`;
    return `${atividade} — ${museu} — ${mesNome}/${ano}`;
  }

  // Pattern 2: ANO-MUSEU-ATIVIDADE (sem mês)
  const m2 = legenda.match(/(20\d{2})-(MISBH|MHAB|MUMO|MAB|MIS|GERAL)-(.+?)(?:\s*[-–]|$)/i);
  if (m2) {
    const ano = m2[1];
    const museuRaw = m2[2].toUpperCase();
    const museu = MUSEU_MAP[museuRaw] || museuRaw;
    const atividade = toTitleCase(m2[3].replace(/[\u00B7·].*$/, '').trim());
    // fallback para mes_referencia do relatório
    const mesRef = photo.mes_referencia || '';
    return `${atividade} — ${museu}${mesRef ? ` — ${mesRef}/${ano}` : ` — ${ano}`}`;
  }

  return null;
}

function buildFallback(photo) {
  const museu = photo.museu || '';
  const mes = photo.mes_referencia || '';
  const ano = photo.ano || '';
  if (museu && mes && ano) return `${museu} — ${mes}/${ano}`;
  if (museu && mes) return `${museu} — ${mes}`;
  if (museu) return museu;
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const skip = Number(body.skip || 0);
    const limit = Number(body.limit || 100);
    const dryRun = Boolean(body.dry_run);

    const photos = await base44.asServiceRole.entities.ReportPhoto.list(null, limit, skip);

    let atualizadas = 0;
    let sem_mudanca = 0;
    let erros = 0;
    const exemplos = [];

    for (const photo of photos) {
      try {
        const novaLegenda = parseLegenda(photo.legenda, photo) || buildFallback(photo);
        if (!novaLegenda) { sem_mudanca++; continue; }

        const mudou = (photo.legenda !== novaLegenda) || (photo.caption !== novaLegenda);
        if (!mudou) { sem_mudanca++; continue; }

        if (!dryRun) {
          await base44.asServiceRole.entities.ReportPhoto.update(photo.id, {
            legenda: novaLegenda,
            caption: novaLegenda,
          });
        }

        atualizadas++;
        if (exemplos.length < 3) {
          exemplos.push({ antes: photo.legenda, depois: novaLegenda });
        }
      } catch (e) {
        erros++;
      }
    }

    const has_more = photos.length === limit;
    const proximo_skip = skip + photos.length;

    return Response.json({ atualizadas, sem_mudanca, erros, has_more, proximo_skip, exemplos });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});