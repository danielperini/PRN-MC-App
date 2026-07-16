import { base44 } from '@/api/base44Client';

const META_ENTITIES = ['ProjectMeta', 'MetaProjeto', 'Meta'];
const NESTED_TEXT_FIELDS = ['descricao_acoes', 'publico_alvo'];

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function metaId(meta = {}) {
  return text(meta.id || meta.meta_id || meta.meta_codigo || meta.codigo);
}

function metaName(meta = {}) {
  return text(meta.meta_nome || meta.nome || meta.titulo || meta.descricao || meta.label);
}

function nestedTextObject(content = '', current = {}) {
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  return {
    ...base,
    texto_ia: text(base.texto_ia || content),
    texto_editado: text(base.texto_editado),
    modo: base.modo || (base.texto_editado ? 'manual' : 'ia'),
    editavel: base.editavel !== false,
  };
}

function asNestedObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return nestedTextObject('', value);
  if (typeof value === 'string' || typeof value === 'number') return nestedTextObject(value);
  return null;
}

function sanitizeReportPayload(payload = {}, { omitEmpty = true } = {}) {
  const next = { ...payload };

  for (const field of NESTED_TEXT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(next, field)) continue;

    const normalized = asNestedObject(next[field]);
    const hasContent = Boolean(normalized?.texto_ia || normalized?.texto_editado);

    if (!normalized || (omitEmpty && !hasContent)) delete next[field];
    else next[field] = normalized;
  }

  return next;
}

function omitNestedFields(payload = {}) {
  const next = { ...payload };
  for (const field of NESTED_TEXT_FIELDS) delete next[field];
  return next;
}

function isNestedObjectValidationError(error) {
  const message = text(error?.message || error);
  return message.includes('Input should be a valid dictionary or instance of NestedObject')
    && (message.includes('publico_alvo') || message.includes('descricao_acoes'));
}

let officialMetaPromise = null;

async function loadOfficialMetas() {
  if (officialMetaPromise) return officialMetaPromise;

  officialMetaPromise = (async () => {
    const rows = [];
    for (const entityName of META_ENTITIES) {
      try {
        const entity = base44.entities?.[entityName];
        if (!entity?.list) continue;
        const result = await entity.list('ordem', 5000);
        if (Array.isArray(result)) rows.push(...result);
      } catch (_) {}
    }

    const byId = new Map();
    const byName = new Map();
    for (const meta of rows) {
      const id = metaId(meta);
      const name = metaName(meta);
      if (!id || !name) continue;
      if (!byId.has(id)) byId.set(id, meta);
      if (!byName.has(normalize(name))) byName.set(normalize(name), meta);
    }

    return { byId, byName, rows: [...byId.values()] };
  })();

  return officialMetaPromise;
}

function parseLabel(label) {
  const lines = text(label?.innerText || label?.textContent)
    .split('\n')
    .map((line) => text(line))
    .filter(Boolean);
  const name = lines[0] || '';
  const rawId = lines.slice(1).find((line) => /^ID\s+/i.test(line)) || lines[1] || '';
  return { name, id: rawId.replace(/^ID\s+/i, '').trim() };
}

async function filterMetaSelector() {
  if (typeof window === 'undefined' || !/RelatorioExecucaoObjeto/i.test(window.location.pathname)) return;

  const { byId, byName } = await loadOfficialMetas();
  const headings = Array.from(document.querySelectorAll('label, h1, h2, h3, h4, p, span'));
  const title = headings.find((element) => normalize(element.textContent).includes('metas a serem relatadas'));
  const container = title?.closest('.rounded-xl.border') || title?.parentElement?.parentElement;
  if (!container) return;

  container.querySelectorAll('label').forEach((label) => {
    const checkbox = label.querySelector('input[type="checkbox"]');
    if (!checkbox) return;

    const parsed = parseLabel(label);
    const official = byId.get(parsed.id) || byName.get(normalize(parsed.name));
    const valid = Boolean(official);

    label.dataset.metaOficial = valid ? 'true' : 'false';
    label.style.display = valid ? '' : 'none';

    if (!valid && checkbox.checked) checkbox.click();

    if (valid) {
      const spans = label.querySelectorAll('span');
      const nameElement = Array.from(spans).find((element) => element.classList.contains('font-medium'));
      const idElement = Array.from(spans).find((element) => element.classList.contains('text-slate-500'));
      if (nameElement) nameElement.textContent = metaName(official);
      if (idElement) idElement.textContent = metaId(official) ? `ID ${metaId(official)}` : '';
    }
  });
}

async function createReportFallback(payload, reportEntity) {
  if (!reportEntity?.create) throw new Error('Entidade RelatorioExecucaoObjeto indisponível.');

  const created = await reportEntity.create({
    tipo: payload?.tipo || 'parcial',
    numero_relatorio: payload?.numero_relatorio || '',
    data_inicio: payload?.data_inicio || '',
    data_fim: payload?.data_fim || '',
    filtro_museu: payload?.filtro_museu || 'todos',
    filtro_versao: payload?.filtro_versao || 'consolidado',
    filtro_meta_ids: Array.isArray(payload?.filtro_meta_ids) ? payload.filtro_meta_ids : [],
    status: 'rascunho',
    criado_por_fallback_schema: true,
  });

  const id = created?.id || created?._id || created?.data?.id;
  if (!id) throw new Error('Não foi possível identificar o relatório criado.');
  return { data: { relatorio_id: id }, relatorio_id: id, success: true };
}

export function installRelatorioMetasSchemaFix() {
  if (typeof window === 'undefined' || window.__relatorioMetasSchemaFixInstalled) return;
  window.__relatorioMetasSchemaFixInstalled = true;

  const reportEntity = base44.entities?.RelatorioExecucaoObjeto;

  if (reportEntity?.update && !reportEntity.__nestedSchemaFixWrapped) {
    const originalUpdate = reportEntity.update.bind(reportEntity);
    reportEntity.update = async (id, payload = {}) => {
      const sanitized = sanitizeReportPayload(payload);
      try {
        return await originalUpdate(id, sanitized);
      } catch (error) {
        if (!isNestedObjectValidationError(error)) throw error;
        return originalUpdate(id, omitNestedFields(sanitized));
      }
    };
    reportEntity.__nestedSchemaFixWrapped = true;
  }

  if (reportEntity?.create && !reportEntity.__nestedSchemaCreateFixWrapped) {
    const originalCreate = reportEntity.create.bind(reportEntity);
    reportEntity.create = async (payload = {}) => {
      const sanitized = sanitizeReportPayload(payload);
      try {
        return await originalCreate(sanitized);
      } catch (error) {
        if (!isNestedObjectValidationError(error)) throw error;
        return originalCreate(omitNestedFields(sanitized));
      }
    };
    reportEntity.__nestedSchemaCreateFixWrapped = true;
  }

  const functions = base44.functions;
  if (functions?.invoke && !functions.__officialMetaFilterWrapped) {
    const originalInvoke = functions.invoke.bind(functions);
    functions.invoke = async (functionName, payload = {}) => {
      if (['iniciarRelatorioExecucao', 'preencherRelatorioComDados', 'gerarSecaoRelatorioExecucao'].includes(functionName)) {
        const { byId } = await loadOfficialMetas();
        const selected = Array.isArray(payload?.filtro_meta_ids) ? payload.filtro_meta_ids.map(String) : [];
        payload = {
          ...sanitizeReportPayload(payload),
          filtro_meta_ids: selected.filter((id) => byId.has(id)),
          separar_metas_de_rubricas: true,
          usar_apenas_cadastro_oficial_de_metas: true,
        };
      }

      if (functionName === 'iniciarRelatorioExecucao') {
        return createReportFallback(payload, reportEntity);
      }

      try {
        return await originalInvoke(functionName, payload);
      } catch (error) {
        if (!isNestedObjectValidationError(error)) throw error;
        return originalInvoke(functionName, omitNestedFields(payload));
      }
    };
    functions.__officialMetaFilterWrapped = true;
  }

  const run = () => window.requestAnimationFrame(filterMetaSelector);
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', run);
  window.addEventListener('hashchange', run);
  run();
}
