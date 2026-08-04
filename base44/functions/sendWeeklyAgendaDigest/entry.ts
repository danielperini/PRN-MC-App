import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const APP_URL = (typeof process !== 'undefined' && process.env && process.env.APP_URL) || 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';
const AGENDA_URL = `${APP_URL}/Agenda`;

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const MUSEU_STYLES = {
  MIS: { badge: 'background:#2563eb;color:#ffffff;', label: 'MIS' },
  MHAB: { badge: 'background:#16a34a;color:#ffffff;', label: 'MHAB' },
  MUMO: { badge: 'background:#7c3aed;color:#ffffff;', label: 'MUMO' },
  EXTERNO: { badge: 'background:#64748b;color:#ffffff;', label: 'Externo' },
};

function normalizeMuseu(value) {
  const v = String(value || '').trim().toUpperCase();
  if (!v) return 'EXTERNO';
  if (v.includes('MIS')) return 'MIS';
  if (v.includes('MHAB') || v.includes('MAB')) return 'MHAB';
  if (v.includes('MUMO')) return 'MUMO';
  return 'EXTERNO';
}

function museuBadge(museu) {
  const key = normalizeMuseu(museu);
  return MUSEU_STYLES[key] || MUSEU_STYLES.EXTERNO;
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Dom..6=Sab
  const diff = (day === 0 ? -6 : 1 - day); // back to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function getNextWeekRange(fromDate) {
  const base = startOfWeekMonday(fromDate || new Date());
  const monday = new Date(base);
  monday.setDate(base.getDate() + 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  // ISO direto
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;
  // Tentar DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function fmtDateBR(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

function fmtDateRangeBR(monday, sunday) {
  const sameYear = monday.getFullYear() === sunday.getFullYear();
  if (sameYear) {
    return `${fmtDateBR(monday)} a ${fmtDateBR(sunday)}/${monday.getFullYear()}`;
  }
  return `${fmtDateBR(monday)}/${monday.getFullYear()} a ${fmtDateBR(sunday)}/${sunday.getFullYear()}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dayLabel(date) {
  const diaSemana = DIAS_SEMANA[date.getDay()];
  return `${diaSemana}, ${date.getDate()} de ${MESES_PT[date.getMonth()]}`;
}

function buildActivityCard(item) {
  const museu = museuBadge(item.museu);
  const titulo = escapeHtml(item.titulo || item.nome_acao || 'Atividade sem título');
  const horario = item.horario ? escapeHtml(item.horario) : '';
  const local = item.local || item.endereco ? escapeHtml(item.local || item.endereco) : '';
  const publico = item.publico_alvo ? escapeHtml(item.publico_alvo) : '';
  const vagas = item.vagas ? escapeHtml(String(item.vagas)) : '';
  const inscricao = item.inscricao || item.link_inscricao ? escapeHtml(item.inscricao || item.link_inscricao) : '';
  const sinopse = item.sinopse || item.descricao ? escapeHtml(item.sinopse || item.descricao) : '';

  const metaLinhas = [];
  if (horario) metaLinhas.push(`<span style="color:#475569;"><strong>🕐 Horário:</strong> ${horario}</span>`);
  if (local) metaLinhas.push(`<span style="color:#475569;"><strong>📍 Local:</strong> ${local}</span>`);
  if (publico) metaLinhas.push(`<span style="color:#475569;"><strong>👥 Público-alvo:</strong> ${publico}</span>`);
  if (vagas) metaLinhas.push(`<span style="color:#475569;"><strong>🎫 Vagas:</strong> ${vagas}</span>`);
  if (inscricao) metaLinhas.push(`<span style="color:#475569;"><strong>📝 Inscrição:</strong> ${inscricao}</span>`);

  return `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.5px;${museu.badge}">${museu.label}</span>
          <span style="font-size:15px;font-weight:700;color:#1e293b;">${titulo}</span>
        </div>
        ${metaLinhas.length > 0 ? `<div style="display:flex;flex-direction:column;gap:4px;font-size:13px;line-height:1.5;">${metaLinhas.join('')}</div>` : ''}
        ${sinopse ? `<div style="font-size:13px;color:#475569;line-height:1.6;margin-top:8px;border-top:1px dashed #e2e8f0;padding-top:8px;">${sinopse}</div>` : ''}
      </div>`;
}

function groupByDay(items, range) {
  const buckets = []; // 0=seg..6=dom
  for (let i = 0; i < 7; i++) buckets.push([]);
  const semData = [];

  for (const item of items) {
    const d = parseDate(item.data_inicio);
    if (d && d >= range.monday && d <= range.sunday) {
      // bucket por dia: monday=0..sunday=6
      const idx = Math.floor((d - range.monday) / 86400000);
      const clamped = Math.max(0, Math.min(6, idx));
      buckets[clamped].push(item);
    } else if (!d && item.data_fim) {
      const df = parseDate(item.data_fim);
      if (df && df >= range.monday && df <= range.sunday) {
        const idx = Math.floor((df - range.monday) / 86400000);
        const clamped = Math.max(0, Math.min(6, idx));
        buckets[clamped].push(item);
      }
    } else if (!d) {
      semData.push(item);
    }
  }

  return { buckets, semData };
}

function buildDaySection(date, items) {
  if (items.length === 0) return '';
  // agrupar por museu mantendo ordem estável
  const porMuseu = {};
  for (const it of items) {
    const key = normalizeMuseu(it.museu);
    if (!porMuseu[key]) porMuseu[key] = [];
    porMuseu[key].push(it);
  }
  const ordemMuseus = ['MIS', 'MHAB', 'MUMO', 'EXTERNO'];
  const cards = [];
  for (const key of ordemMuseus) {
    if (!porMuseu[key]) continue;
    for (const it of porMuseu[key]) cards.push(buildActivityCard(it));
  }

  return `
    <div style="margin-top:22px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:6px;height:22px;background:#2563eb;border-radius:3px;"></div>
        <div style="font-size:16px;font-weight:700;color:#1e293b;">${escapeHtml(dayLabel(date))}</div>
        <div style="font-size:12px;color:#94a3b8;">${items.length} ${items.length === 1 ? 'atividade' : 'atividades'}</div>
      </div>
      ${cards.join('')}
    </div>`;
}

function buildSemDataSection(items) {
  if (items.length === 0) return '';
  const cards = items.map(buildActivityCard).join('');
  return `
    <div style="margin-top:22px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:6px;height:22px;background:#94a3b8;border-radius:3px;"></div>
        <div style="font-size:16px;font-weight:700;color:#1e293b;">Datas a confirmar</div>
        <div style="font-size:12px;color:#94a3b8;">${items.length} ${items.length === 1 ? 'atividade' : 'atividades'}</div>
      </div>
      ${cards}
    </div>`;
}

function buildEmailBody(range, items, isTest) {
  const { buckets, semData } = groupByDay(items, range);
  const totalAtividades = buckets.reduce((acc, b) => acc + b.length, 0) + semData.length;

  const daysHtml = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(range.monday);
    d.setDate(range.monday.getDate() + i);
    daysHtml.push(buildDaySection(d, buckets[i]));
  }
  daysHtml.push(buildSemDataSection(semData));

  const subjectDate = fmtDateRangeBR(range.monday, range.sunday);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:28px;">
      <div style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Museus Centro · Viaduto das Artes</div>
      <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:6px;">📅 Agenda da Semana</div>
      <div style="color:rgba(255,255,255,0.85);font-size:15px;margin-top:6px;">Semana de ${escapeHtml(subjectDate)}</div>
    </div>

    <div style="padding:28px;">
      <p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 12px 0;">
        Esta é a programação da próxima semana dos <strong>Museus Centro</strong> (MIS · MHAB · MUMO · espaços externos).
        Confira abaixo as atividades agrupadas por dia e por museu.
      </p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:8px;">
        <p style="font-size:13px;color:#1e40af;margin:0;"><strong>${totalAtividades}</strong> ${totalAtividades === 1 ? 'atividade programada' : 'atividades programadas'} para esta semana.</p>
      </div>
      ${daysHtml.join('')}

      <div style="text-align:center;margin-top:28px;">
        <a href="${AGENDA_URL}"
           style="display:inline-block;background:#1e293b;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">
          Ver Agenda completa →
        </a>
      </div>

      <p style="font-size:13px;color:#94a3b8;text-align:center;margin-top:20px;line-height:1.6;">
        Programação sujeita a alterações.<br>
        ${isTest ? '<strong style="color:#b45309;">E-mail de teste — não foi enviado para a lista oficial.</strong><br>' : ''}
       Este boletim é gerado automaticamente pela plataforma Museus Centro.
      </p>
    </div>

    <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">
        Museus Centro · Viaduto das Artes — Boletim Semanal da Agenda
      </p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let payload = {};
    try {
      const text = await req.text();
      if (text) payload = JSON.parse(text);
    } catch (_) { /* sem body ou inválido: rota automática */ }

    const force = !!payload.force;
    const testEmail = (payload.test_email || '').toString().trim();

    const { monday, sunday } = getNextWeekRange(new Date());
    const subjectDate = fmtDateRangeBR(monday, sunday);

    // ── Destinatários ──
    let recipients = [];
    if (force && testEmail) {
      recipients = [testEmail];
    } else {
      let config;
      try {
        const cfg = await base44.asServiceRole.entities.MetadadosConfig.filter({
          categoria: 'agenda_digest',
          chave_config: 'destinatarios_boletim_semanal',
        });
        config = Array.isArray(cfg) && cfg.length > 0 ? cfg[0] : null;
      } catch (e) {
        console.warn('[sendWeeklyAgendaDigest] Erro ao ler destinatários:', e?.message);
      }
      const emails = config?.config_json?.emails;
      if (Array.isArray(emails)) {
        recipients = emails.map((e) => String(e || '').trim()).filter(Boolean);
      }
      if (recipients.length === 0) {
        return Response.json({
          success: true,
          skipped: true,
          reason: 'Nenhum destinatário configurado. Adicione e-mails no painel do PlataformaAdmin.',
          week: subjectDate,
        });
      }
    }

    // ── Buscar Programacao ──
    const all = await base44.asServiceRole.entities.Programacao.list('-created_date', 1000);

    // month_keys da semana seguinte (fallback para itens sem data parseável)
    const weekMonthKeys = new Set();
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      weekMonthKeys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const eligible = (all || []).filter((item) => {
      if (item.ativo === false) return false;
      if (String(item.status || '').toUpperCase() === 'CANCELADA') return false;
      const d = parseDate(item.data_inicio);
      if (d) return d >= monday && d <= sunday;
      const df = parseDate(item.data_fim);
      if (df) return df >= monday && df <= sunday;
      // fallback month_key
      if (item.month_key && weekMonthKeys.has(String(item.month_key).slice(0, 7))) return true;
      return false;
    });

    if (eligible.length === 0) {
      return Response.json({
        success: true,
        skipped: true,
        reason: 'Nenhuma atividade na próxima semana — e-mail suprimido.',
        week: subjectDate,
        recipients: force ? recipients : recipients.length,
      });
    }

    const subject = `${force ? '[TESTE] ' : ''}Agenda Museus Centro — Semana de ${subjectDate}`;
    const body = buildEmailBody({ monday, sunday }, eligible, force);

    let enviados = 0;
    const erros = [];
    for (const email of recipients) {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject,
          body,
          from_name: 'Museus Centro — Boletim da Agenda',
        });
        enviados++;
        console.log(`[sendWeeklyAgendaDigest] Enviado para ${email}`);
      } catch (e) {
        console.warn(`[sendWeeklyAgendaDigest] Falha para ${email}:`, e?.message);
        erros.push({ email, erro: e?.message || String(e) });
      }
    }

    // ── Registrar último envio (somente em envios reais, não teste) ──
    if (!force) {
      try {
        const existing = await base44.asServiceRole.entities.MetadadosConfig.filter({
          categoria: 'agenda_digest',
          chave_config: 'ultimo_envio_boletim_semanal',
        });
        const payloadCfg = {
          categoria: 'agenda_digest',
          chave_config: 'ultimo_envio_boletim_semanal',
          label: 'Último envio do Boletim Semanal da Agenda',
          config_json: {
            data: new Date().toISOString(),
            enviados,
            total_destinatarios: recipients.length,
            semana: subjectDate,
            atividades: eligible.length,
          },
        };
        if (Array.isArray(existing) && existing.length > 0 && existing[0].id) {
          await base44.asServiceRole.entities.MetadadosConfig.update(existing[0].id, payloadCfg);
        } else {
          await base44.asServiceRole.entities.MetadadosConfig.create(payloadCfg);
        }
      } catch (logErr) {
        console.warn('[sendWeeklyAgendaDigest] Falha ao registrar último envio:', logErr?.message);
      }
    }

    return Response.json({
      success: true,
      week: subjectDate,
      total_atividades: eligible.length,
      recipients,
      enviados,
      erros,
      is_test: force,
    });
  } catch (error) {
    console.error('[sendWeeklyAgendaDigest] Erro:', error);
    return Response.json({ success: false, error: error?.message || String(error) }, { status: 500 });
  }
});