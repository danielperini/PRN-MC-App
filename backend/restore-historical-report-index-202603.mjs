import pg from 'pg';

// The 2026-03-11 Drive index predates the August Base44 export. These exact
// source IDs no longer exist in the app. Preserve them as read-only historical
// records: a PDF proves only the fields and activity titles listed below, not
// any photo ownership or editable form field that the PDF omitted.
const sources = [
  {
    id: '69b0d38ec44e365e97709071', author: 'Daniel Perini', month: 'Março',
    originalStatus: 'DRAFT', created: '2026-03-11T02:29:34.262Z',
  },
  {
    id: '69a89cdd04f3a7af56024bcd', author: 'Daniel Perini', month: 'Fevereiro',
    protocol: 'MC-SEM2026-00007', originalStatus: 'APPROVED', museum: 'Atuação Geral',
    role: 'Coordenador', created: '2026-03-04T20:58:05.219Z',
    pdfId: '1vSp75ja3rh3iHrcTWByyQNzvlfxInvVz',
    activities: [['Contratação Consultoria', 'META'], ['Reunião de Apresentação', 'ROTINA']],
  },
  {
    id: '69a98fe66eb9f56a8a15c181', author: 'claraassumpcaoctt', month: 'Fevereiro',
    protocol: 'MC-FEV2026-00008', originalStatus: 'APPROVED', museum: 'MUMO',
    role: 'Educador', created: '2026-03-05T14:15:02.865Z',
    pdfId: '17O1gbOHgnORLIvJm9OZCTOj53VnYZi7P',
    activities: [['Visitas Mediadas', 'ROTINA']],
  },
  {
    id: '69a97d7009651a5e0f65bd5f', author: 'Daniela Assis', month: 'Fevereiro',
    protocol: 'MC-FEV2026-00007', originalStatus: 'APPROVED', museum: 'MUMO',
    role: 'Produtor Cultural', created: '2026-03-05T12:56:16.462Z',
    pdfId: '1QO4m8IvQCIPzVybSU11JAeuoS3MXA_xf',
    activities: [['Acompanhamento - Finalização Manutenção Vidraçaria', 'META']],
  },
  {
    id: '69a9c4bd7987faf7b211ea0b', author: 'Daniela Assis', month: 'Fevereiro',
    protocol: 'MC-FEV2026-00009', originalStatus: 'APPROVED', museum: 'MUMO',
    role: 'Produtor Cultural', created: '2026-03-05T18:00:29.036Z',
    pdfId: '13COu_1x--3m8mpzDS_8TYL_2IRSztswJ',
    activities: [['Atividade 1', 'META']],
  },
  {
    id: '69a7258458de3becfc09afca', author: 'Caroline Abasse', month: 'Fevereiro',
    protocol: 'MC-FEV2026-00006', originalStatus: 'APPROVED', museum: 'Atuação Geral',
    role: 'Outro', created: '2026-03-03T18:16:36.407Z',
    pdfId: '1K21vC6NIOHpfCaD1sZrPe-qJwsKrzpdT',
    activities: [['Vídeo Story - MIS BH', 'ROTINA']],
  },
  {
    id: '69a8a0dcbc90cddfd03f5a6a', author: 'Produção Viaduto das Artes', month: 'Fevereiro',
    protocol: 'MC-FEV2026-00008', originalStatus: 'APPROVED', museum: 'MHAB',
    role: 'Produtor Cultural', created: '2026-03-04T21:15:08.426Z',
    pdfId: '1BgfY6DbDUnWEzY-IRuNeSOhfvMZIv6c4',
    activities: [
      ['Reunião apresentação', 'EXTRA'], ['Ritual de gestão', 'EXTRA'],
      ['Reunião programação', 'EXTRA'], ['Prestação de contas', 'EXTRA'],
      ['Contato', 'EXTRA'],
    ],
  },
  {
    id: '69a6e2151945c0b8aaa8ab7c', author: 'Lara Carvalho Ferreira', month: 'Fevereiro',
    protocol: 'MC-FEV2026-00001', originalStatus: 'APPROVED', museum: 'MHAB',
    role: 'Educador', created: '2026-03-03T13:28:53.613Z',
    pdfId: '1sbKtPu4TY2YuulUU_xNXWfizvYPCuU3v',
    activities: [['Educativo Aberto', 'ROTINA']],
  },
  {
    id: '69a7195980b8fcf771b54be9', author: 'Produção Viaduto das Artes', month: 'Fevereiro',
    protocol: 'MC-FEV2026-00004', originalStatus: 'APPROVED', museum: 'MIS',
    role: 'Produtor Cultural', created: '2026-03-03T17:24:41.113Z',
    pdfId: '113JYOFe4aOP9ccbXNTjm4-_o5iNGPHHB',
  },
  {
    id: '69a6e3e76dc0f3d8460fa8d2', author: 'Juliana Silva', month: 'Fevereiro',
    protocol: 'MC-FEV2026-00002', originalStatus: 'APPROVED', museum: 'MIS',
    role: 'Educador', created: '2026-03-03T13:36:39.207Z',
    pdfId: '1HSJlJLvFwv0GQK5lFR5mCB0jMEVXUWzu',
    activities: [
      ['Abertura da Exposição "Do Traço ao Pixel: Memórias da Animação Brasileira"', 'EXTRA'],
      ['Visitas Mediadas', 'ROTINA'], ['Entrevista', 'EXTRA'],
    ],
  },
];

const apply = process.argv.includes('--apply');
const validate = process.argv.includes('--validate');
const pool = new pg.Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor',
  user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const existing = (await client.query(
    'SELECT base44_id FROM reports WHERE base44_id=ANY($1::text[]) FOR UPDATE',
    [sources.map((item) => item.id)],
  )).rows;
  const seen = new Set(existing.map((row) => row.base44_id));
  const planned = sources.filter((item) => !seen.has(item.id));
  const result = { mode: apply ? 'apply' : validate ? 'validate_rollback' : 'dry_run', source: 'Drive relatorios-2026-03-11.json',
    source_count: sources.length, already_present: seen.size, to_restore: planned.length,
    restored: 0, activities_restored: 0, original_pdf_available: planned.filter((item) => item.pdfId).length };
  if (apply || validate) {
    for (const source of planned) {
      const pdfUrl = source.pdfId ? `https://drive.google.com/file/d/${source.pdfId}/view` : null;
      const activities = (source.activities || []).map(([title, classification], index) => ({
        id: `historical-${source.id}-${index + 1}`, nome: title,
        classificacao: classification, recuperada_de_pdf: true, fotos: [],
      }));
      const raw = {
        historical_recovery: {
          source_index_id: '1asik2CN7q-k6EzrreENtETYeKAZKpBkn',
          original_id: source.id, original_status: source.originalStatus,
          original_pdf_id: source.pdfId || null,
          evidence: source.pdfId ? 'index_and_original_pdf' : 'index_only',
          recovered_at: new Date().toISOString(),
        },
        atividades: activities, fotos: [],
        attachments: pdfUrl ? [{ name: `Relatório histórico ${source.protocol || source.id}.pdf`,
          url: pdfUrl, type: 'application/pdf', historical_source: true }] : [],
      };
      const account = (await client.query(
        'SELECT id,email,base44_id FROM users WHERE lower(full_name)=lower($1) ORDER BY id',
        [source.author],
      )).rows;
      const owner = account.length === 1 ? account[0] : null;
      const row = (await client.query(`INSERT INTO reports
        (base44_id,created_by_id,created_by,author_email,author_name,author_role,funcao,museu,
         mes_referencia,ano,tipo,status,review_status,numero_protocolo,resumo_periodo,
         drive_backup_relatorio_id,drive_backup_relatorio_url,raw_data,created_date,updated_date)
        VALUES ($1,$2,$3,$3,$4,'ARQUIVO_HISTORICO',$5,$6,$7,2026,'mensal','ARCHIVED',
          'historical_recovery',$8,$9,$10,$11,$12::jsonb,$13,$13) RETURNING id`, [
        source.id, owner?.base44_id || String(owner?.id || '') || null, owner?.email || null,
        source.author, source.role || null, source.museum || null, source.month,
        source.protocol || null,
        source.pdfId
          ? 'Registro histórico recuperado do índice de março de 2026. Consulte o PDF original; campos ausentes não foram reconstruídos.'
          : 'Registro histórico encontrado somente no índice de março de 2026. O conteúdo integral não foi localizado.',
        source.pdfId || null, pdfUrl, JSON.stringify(raw), source.created,
      ])).rows[0];
      for (const activity of activities) {
        await client.query(`INSERT INTO report_activities
          (base44_activity_id,report_id,report_base44_id,classificacao,nome,descricao,
           museu_lista,tipo_acao_lista,equipe_participante_ids,meta_vinculada_ids,
           quantas_vezes_ocorreu,publico_medio_sessao,publico_estimado,
           quantidade_produtos,total_produtos,raw_data)
          VALUES ($1,$2,$3,$4,$5,'Título recuperado do PDF histórico.',$6::jsonb,
            '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,1,0,0,0,0,$7::jsonb)`, [
          activity.id, String(row.id), source.id, activity.classificacao, activity.nome,
          JSON.stringify(source.museum ? [source.museum] : []), JSON.stringify(activity),
        ]);
        result.activities_restored++;
      }
      result.restored++;
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  } else {
    await client.query('ROLLBACK');
  }
  console.log('HISTORICAL_REPORT_RESTORE', JSON.stringify(result));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
