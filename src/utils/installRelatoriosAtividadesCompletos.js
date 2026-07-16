import { base44 } from '@/api/base44Client';

const STATUS_APROVADO = new Set(['approved', 'aprovado', 'aprovado_coord', 'aprovado_admin', 'publicado', 'finalizado', 'concluido']);
const FOTO_CAMPOS = ['foto_url', 'image_url', 'url', 'file_url', 'arquivo_url', 'photo_url', 'media_url', 'drive_url', 'gallery_url'];
const PUBLICO_CAMPOS = ['publico_total', 'total_publico', 'publico_realizado', 'publico_presente', 'quantidade_publico', 'participantes', 'visitantes', 'presentes', 'attendance_count', 'total_participantes'];

const texto = (valor) => String(valor ?? '').trim();
const lista = (valor) => Array.isArray(valor) ? valor : [];
const normalizar = (valor) => texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

function frasePtBr(valor) {
  const limpo = texto(valor).replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
  if (!limpo) return '';
  if (!(limpo.length > 30 && limpo === limpo.toUpperCase())) return limpo;
  const convertido = limpo.toLocaleLowerCase('pt-BR');
  return convertido.charAt(0).toLocaleUpperCase('pt-BR') + convertido.slice(1);
}

function unico(itens, chaveFn) {
  const mapa = new Map();
  for (const item of itens || []) {
    const chave = chaveFn(item);
    if (chave && !mapa.has(chave)) mapa.set(chave, item);
  }
  return [...mapa.values()];
}

async function listarSeguro(nome, limite = 10000) {
  try {
    const entidade = base44?.entities?.[nome];
    if (!entidade?.list) return [];
    const retorno = await entidade.list('-created_date', limite);
    return Array.isArray(retorno) ? retorno : [];
  } catch (erro) {
    const status = Number(erro?.response?.status || erro?.status || 0);
    if (status !== 403 && status !== 404) console.warn(`[Relatórios mensais] Falha ao consultar ${nome}.`, erro);
    return [];
  }
}

function aprovado(relatorio = {}) {
  const status = normalizar(relatorio.status || relatorio.situacao || relatorio.estado || relatorio.review_status).replace(/\s+/g, '_');
  return STATUS_APROVADO.has(status);
}

function idAtividade(item = {}) {
  return texto(item.id || item.activity_id || item.atividade_id || item.evento_id || item.programacao_id || item.agenda_id);
}

function idRelatorio(item = {}) {
  return texto(item.report_id || item.relatorio_id || item.reportId || item.relatorioId);
}

function tituloAtividade(item = {}) {
  return frasePtBr(item.titulo || item.nome_acao || item.nome || item.atividade || item.descricao || item.description || item.relato || item.resumo || 'Atividade registrada');
}

function dataAtividade(item = {}) {
  return texto(item.data || item.data_atividade || item.data_inicio || item.start_date || item.created_date);
}

function publicoAtividade(item = {}) {
  for (const campo of PUBLICO_CAMPOS) {
    const valor = item?.[campo];
    if (Array.isArray(valor)) return valor.length;
    const numero = Number(valor);
    if (Number.isFinite(numero) && numero > 0) return numero;
  }
  return lista(item.lista_presenca).length || lista(item.participantes_lista).length || 0;
}

function urlFoto(item = {}) {
  for (const campo of FOTO_CAMPOS) if (texto(item?.[campo])) return texto(item[campo]);
  return '';
}

function mesNumero(valor) {
  const meses = { janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const chave = normalizar(valor);
  if (meses[chave]) return meses[chave];
  const numero = Number(chave);
  return numero >= 1 && numero <= 12 ? numero : 0;
}

function museuNormalizado(valor) {
  const chave = normalizar(valor);
  if (/\b(mhab|mab|abilio barreto)\b/.test(chave)) return 'mhab';
  if (/\b(mumo|mumu|moda)\b/.test(chave)) return 'mumo';
  if (/\b(mis|imagem e som)\b/.test(chave)) return 'mis';
  if (/\b(map|pampulha)\b/.test(chave)) return 'pampulha';
  return chave;
}

function competenciaRelatorio(relatorio = {}) {
  return {
    ano: Number(relatorio.ano || relatorio.ano_referencia || 0),
    mes: mesNumero(relatorio.mes_referencia || relatorio.mes || 0),
    museu: museuNormalizado(relatorio.museu || relatorio.filtro_museu),
  };
}

function pertenceAoRelatorio(item, relatorio) {
  if (idRelatorio(item) && idRelatorio(item) === texto(relatorio.id)) return true;

  const competencia = competenciaRelatorio(relatorio);
  const data = dataAtividade(item);
  if (!data || !competencia.ano || !competencia.mes) return false;
  const dataObj = new Date(data);
  if (Number.isNaN(dataObj.getTime())) return false;
  if (dataObj.getFullYear() !== competencia.ano || dataObj.getMonth() + 1 !== competencia.mes) return false;

  const museuItem = museuNormalizado(item.museu || item.unidade || item.local || item.centro_custo || `${item.titulo || ''} ${item.descricao || ''}`);
  if (!competencia.museu) return true;
  return Boolean(museuItem && (museuItem.includes(competencia.museu) || competencia.museu.includes(museuItem)));
}

function atividadesDoRelatorio(relatorio = {}) {
  return [
    relatorio.atividades,
    relatorio.activities,
    relatorio.atividades_realizadas,
    relatorio.descricao_acoes?.atividades,
    relatorio.tabelas_estruturadas?.atividades,
  ].flatMap(lista).map((atividade, indice) => ({
    ...atividade,
    id: atividade?.id || `${relatorio.id}-atividade-${indice}`,
    report_id: relatorio.id,
    museu: atividade?.museu || relatorio.museu,
    source_entity: 'Relatório mensal',
  }));
}

function fotosDoRelatorio(relatorio = {}) {
  return [relatorio.fotos, relatorio.photos, relatorio.anexos_evidencias, relatorio.anexos_fotograficos, relatorio.galeria_fotos, relatorio._fotos_atividades]
    .flatMap(lista)
    .map((foto, indice) => ({ ...foto, id: foto?.id || `${relatorio.id}-foto-${indice}`, report_id: relatorio.id }));
}

function fotoDaAtividade(foto, atividade, relatorio) {
  const vinculo = texto(foto.activity_id || foto.atividade_id || foto.evento_id || foto.programacao_id || foto.agenda_id);
  if (vinculo && vinculo === idAtividade(atividade)) return true;
  if (idRelatorio(foto) && idRelatorio(foto) !== texto(relatorio.id)) return false;
  const legenda = normalizar(`${foto.atividade_nome || ''} ${foto.legenda || ''} ${foto.titulo || ''} ${foto.descricao || ''}`);
  const titulo = normalizar(tituloAtividade(atividade));
  return titulo.length >= 6 && legenda.includes(titulo);
}

function galeriaLink(relatorio = {}, fotos = []) {
  const direto = texto(relatorio.gallery_url || relatorio.galeria_url || relatorio.drive_gallery_url || relatorio.pasta_fotos_url);
  if (direto) return direto;
  return fotos.map(urlFoto).find((url) => /drive\.google\.com|photos\.app\.goo\.gl/i.test(url)) || '';
}

function construirPacoteRelatorio(relatorio, fontes) {
  const internas = atividadesDoRelatorio(relatorio);
  const externas = [...fontes.agendas, ...fontes.atividades, ...fontes.programacoes]
    .filter((item) => pertenceAoRelatorio(item, relatorio))
    .map((item) => ({ ...item, source_entity: item.source_entity || 'Agenda/Atividade' }));

  const atividades = unico([...internas, ...externas], (item) => idAtividade(item) || `${dataAtividade(item)}|${normalizar(tituloAtividade(item))}|${museuNormalizado(item.museu || item.local)}`);
  const fotos = unico([
    ...fotosDoRelatorio(relatorio),
    ...fontes.reportPhotos.filter((foto) => idRelatorio(foto) === texto(relatorio.id)),
    ...fontes.documentIntakes.filter((item) => /foto|imagem|image/i.test(`${item.tipo_detectado || ''} ${item.file_name_original || ''} ${item.mime_type || ''}`) && pertenceAoRelatorio(item, relatorio)),
  ].filter((item) => urlFoto(item)), (item) => urlFoto(item).split('?')[0]);

  const linhas = atividades.map((atividade) => {
    const todasFotos = fotos.filter((foto) => fotoDaAtividade(foto, atividade, relatorio));
    const documentos = unico([...lista(atividade.documentos), ...lista(atividade.anexos), ...lista(atividade.arquivos)], (item) => texto(item?.url || item?.file_url || item?.id || item));
    return {
      atividade_id: idAtividade(atividade),
      relatorio_id: relatorio.id,
      agenda_id: texto(atividade.agenda_id || atividade.id),
      meta_id: texto(atividade.meta_id || atividade.project_meta_id || atividade.meta_codigo || atividade.codigo_meta),
      atividade: tituloAtividade(atividade),
      descricao: frasePtBr(atividade.descricao_executado || atividade.descricao || atividade.objetivo || atividade.resultado_alcancado || ''),
      data: dataAtividade(atividade) || 'Data não informada',
      museu: texto(atividade.museu || atividade.unidade || atividade.local || relatorio.museu) || 'Não informado',
      publico_total: publicoAtividade(atividade),
      origem: atividade.source_entity || 'Relatório mensal',
      fotos_total: todasFotos.length,
      fotos_destaque: todasFotos.slice(0, 2).map((foto, indice) => ({ titulo: frasePtBr(foto.legenda || foto.titulo || foto.atividade_nome || `Foto ${indice + 1}`), url: urlFoto(foto) })),
      galeria_url: galeriaLink(relatorio, todasFotos) || galeriaLink(relatorio, fotos),
      documentos: documentos.map((item) => ({ titulo: frasePtBr(item?.titulo || item?.nome || item?.file_name || item), url: texto(item?.url || item?.file_url || item?.arquivo_url) })),
    };
  });

  return {
    relatorio,
    atividades: linhas,
    resumo: {
      total_atividades: linhas.length,
      publico_total: linhas.reduce((soma, linha) => soma + Number(linha.publico_total || 0), 0),
      fotos_total: linhas.reduce((soma, linha) => soma + Number(linha.fotos_total || 0), 0),
      documentos_total: linhas.reduce((soma, linha) => soma + linha.documentos.length, 0),
    },
    galeria_url: galeriaLink(relatorio, fotos),
  };
}

async function urlParaDataUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;
  const resposta = await fetch(url, { credentials: 'include' });
  if (!resposta.ok) throw new Error(`Imagem indisponível (${resposta.status})`);
  const blob = await resposta.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Arquivo não é imagem');
  return await new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ''));
    leitor.onerror = reject;
    leitor.readAsDataURL(blob);
  });
}

function formatoImagem(dataUrl) {
  if (/^data:image\/png/i.test(dataUrl)) return 'PNG';
  if (/^data:image\/webp/i.test(dataUrl)) return 'WEBP';
  return 'JPEG';
}

async function exportarPacote(pacote, jsPDF) {
  const relatorio = pacote.relatorio;
  const pdf = new jsPDF('p', 'mm', 'a4');
  const largura = pdf.internal.pageSize.getWidth();
  const altura = pdf.internal.pageSize.getHeight();
  const margem = 12;
  let y = margem;
  const garantir = (espaco = 18) => { if (y + espaco > altura - margem) { pdf.addPage(); y = margem; } };
  const escrever = (valor, tamanho = 9, recuo = 0) => {
    const linhas = pdf.splitTextToSize(frasePtBr(valor) || '—', largura - 2 * margem - recuo);
    garantir(linhas.length * 4 + 3);
    pdf.setFontSize(tamanho);
    pdf.text(linhas, margem + recuo, y);
    y += linhas.length * 4 + 3;
  };

  pdf.setFontSize(18);
  pdf.text('Relatório mensal de atividades', margem, y);
  y += 9;
  escrever(`${relatorio.museu || 'Museu não informado'} — ${relatorio.mes_referencia || ''} ${relatorio.ano || ''}`, 11);
  escrever(`Profissional: ${relatorio.author_name || relatorio.created_by || 'Não informado'}`, 9);
  escrever(relatorio.resumo_executivo || relatorio.apresentacao_periodo || relatorio.resumo || 'Sem apresentação registrada.', 10);
  escrever(`${pacote.resumo.total_atividades} atividade(s); público total de ${pacote.resumo.publico_total.toLocaleString('pt-BR')}; ${pacote.resumo.fotos_total} foto(s); ${pacote.resumo.documentos_total} documento(s).`, 9);

  for (let indice = 0; indice < pacote.atividades.length; indice += 1) {
    const atividade = pacote.atividades[indice];
    garantir(28);
    pdf.setFontSize(11);
    pdf.text(`${indice + 1}. ${atividade.atividade}`, margem, y);
    y += 5;
    escrever(`Data: ${atividade.data} | Museu/local: ${atividade.museu} | Público: ${Number(atividade.publico_total || 0).toLocaleString('pt-BR')} | Origem: ${atividade.origem}`, 8, 3);
    if (atividade.meta_id) escrever(`Meta vinculada: ${atividade.meta_id}`, 8, 3);
    escrever(atividade.descricao || 'Sem descrição complementar.', 9, 3);

    let maiorAltura = 0;
    for (let fotoIndice = 0; fotoIndice < atividade.fotos_destaque.length; fotoIndice += 1) {
      const foto = atividade.fotos_destaque[fotoIndice];
      try {
        const dataUrl = await urlParaDataUrl(foto.url);
        const props = pdf.getImageProperties(dataUrl);
        const maxLargura = (largura - 2 * margem - 4) / 2;
        const proporcao = Math.min(maxLargura / props.width, 58 / props.height);
        const w = props.width * proporcao;
        const h = props.height * proporcao;
        maiorAltura = Math.max(maiorAltura, h);
        garantir(h + 12);
        const x = margem + fotoIndice * (maxLargura + 4);
        pdf.addImage(dataUrl, formatoImagem(dataUrl), x, y, w, h, undefined, 'FAST');
        pdf.setFontSize(7);
        pdf.text(pdf.splitTextToSize(foto.titulo || `Foto ${fotoIndice + 1}`, maxLargura), x, y + h + 3);
      } catch (erro) {
        console.warn('Foto não incluída no PDF:', foto.url, erro);
      }
    }
    if (maiorAltura) y += maiorAltura + 10;
    if (atividade.galeria_url) {
      garantir(8);
      pdf.setTextColor(0, 82, 204);
      pdf.textWithLink('Abrir galeria completa desta atividade', margem + 3, y, { url: atividade.galeria_url });
      pdf.setTextColor(0, 0, 0);
      y += 6;
    }
  }

  const nome = texto(relatorio.author_name || relatorio.created_by || 'relatorio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
  pdf.save(`relatorio_atividade_${nome}_${texto(relatorio.mes_referencia)}_${texto(relatorio.ano)}.pdf`);
}

async function carregarFontes() {
  const [agendas, atividades, programacoes, reports, reportPhotos, documentIntakes] = await Promise.all([
    listarSeguro('Agenda'), listarSeguro('Atividade'), listarSeguro('Programacao'), listarSeguro('Report'), listarSeguro('ReportPhoto'), listarSeguro('DocumentIntake'),
  ]);
  return { agendas, atividades, programacoes, reports: reports.filter(aprovado), reportPhotos, documentIntakes };
}

function ocultarValidacaoMensal() {
  if (!/Relatorios|Report/i.test(window.location.pathname)) return;
  document.querySelectorAll('button, a').forEach((elemento) => {
    const conteudo = normalizar(elemento.textContent);
    if (conteudo.includes('validar relatorio') || conteudo.includes('validacao do relatorio') || conteudo.includes('revisao automatica do relatorio')) {
      elemento.style.display = 'none';
      elemento.setAttribute('aria-hidden', 'true');
    }
  });
}

function instalarBotaoExportacao() {
  if (!/Relatorios/i.test(window.location.pathname) || /RelatorioExecucaoObjeto/i.test(window.location.pathname)) return;
  if (document.querySelector('[data-exportar-relatorios-completos]')) return;
  const titulo = [...document.querySelectorAll('h1')].find((item) => normalizar(item.textContent).includes('relatorios mensais'));
  const alvo = titulo?.parentElement?.parentElement?.querySelector('.flex.flex-wrap.gap-2');
  if (!alvo) return;
  const botao = document.createElement('button');
  botao.dataset.exportarRelatoriosCompletos = 'true';
  botao.className = 'inline-flex items-center justify-center rounded-md border border-black bg-white px-4 py-2 text-sm font-medium text-black hover:bg-gray-50 disabled:opacity-50';
  botao.textContent = 'Exportar aprovados com atividades e fotos';
  botao.addEventListener('click', async () => {
    if (botao.disabled) return;
    botao.disabled = true;
    const original = botao.textContent;
    try {
      const fontes = await carregarFontes();
      if (!fontes.reports.length) throw new Error('Nenhum relatório aprovado encontrado.');
      const { jsPDF } = await import('jspdf');
      for (let indice = 0; indice < fontes.reports.length; indice += 1) {
        botao.textContent = `Exportando ${indice + 1} de ${fontes.reports.length}`;
        await exportarPacote(construirPacoteRelatorio(fontes.reports[indice], fontes), jsPDF);
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      botao.textContent = 'Exportação concluída';
    } catch (erro) {
      console.error('Falha na exportação completa:', erro);
      botao.textContent = erro?.message || 'Falha na exportação';
    } finally {
      setTimeout(() => { botao.textContent = original; botao.disabled = false; }, 3000);
    }
  });
  alvo.prepend(botao);
}

function instalarContextoExecucao() {
  const entidade = base44?.entities?.RelatorioExecucaoObjeto;
  if (!entidade?.update || entidade.__relatoriosAtividadesCompletosWrapped) return;
  const atualizarOriginal = entidade.update.bind(entidade);
  entidade.update = async (id, payload = {}) => {
    const fontes = await carregarFontes();
    const pacotes = fontes.reports.map((relatorio) => construirPacoteRelatorio(relatorio, fontes));
    const linhas = unico(pacotes.flatMap((pacote) => pacote.atividades.map((atividade) => ({
      ...atividade,
      relatorio_id: pacote.relatorio.id,
      relatorio_titulo: frasePtBr(pacote.relatorio.titulo || `Relatório ${pacote.relatorio.museu || ''} ${pacote.relatorio.mes_referencia || ''} ${pacote.relatorio.ano || ''}`),
      fotos_destaque: atividade.fotos_destaque.slice(0, 2),
      galeria_url: atividade.galeria_url || pacote.galeria_url,
    }))), (item) => `${item.relatorio_id}|${item.atividade_id || `${item.data}|${normalizar(item.atividade)}`}`);

    const contexto = {
      integracao: 'relatorios_atividades_completos',
      relatorios_aprovados: fontes.reports.length,
      relatorios_aprovados_ids: fontes.reports.map((item) => item.id).filter(Boolean),
      total_atividades: linhas.length,
      publico_total: linhas.reduce((soma, item) => soma + Number(item.publico_total || 0), 0),
      fotos_total: linhas.reduce((soma, item) => soma + Number(item.fotos_total || 0), 0),
      documentos_total: linhas.reduce((soma, item) => soma + lista(item.documentos).length, 0),
      fontes: ['Agenda', 'Atividade', 'Programacao', 'Report', 'ReportPhoto', 'DocumentIntake'],
      atualizado_em: new Date().toISOString(),
    };

    return atualizarOriginal(id, {
      ...payload,
      tabela_atividades_evidencias: linhas,
      contexto_ia_atividades: linhas,
      resumo_atividades_ia: contexto,
      fontes_ia_relatorio_execucao: contexto,
      fotos_por_atividade: linhas.reduce((acc, item) => { if (item.atividade_id) acc[item.atividade_id] = item.fotos_destaque; return acc; }, {}),
      dados_atualizados_em: new Date().toISOString(),
    });
  };
  entidade.__relatoriosAtividadesCompletosWrapped = true;
}

export function installRelatoriosAtividadesCompletos() {
  if (typeof window === 'undefined' || window.__relatoriosAtividadesCompletosInstalled) return;
  window.__relatoriosAtividadesCompletosInstalled = true;
  instalarContextoExecucao();
  const executar = () => window.requestAnimationFrame(() => { ocultarValidacaoMensal(); instalarBotaoExportacao(); });
  new MutationObserver(executar).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', executar);
  window.addEventListener('hashchange', executar);
  executar();
}
