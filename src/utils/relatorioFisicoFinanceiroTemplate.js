
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;');
}

export function montarHtmlRelatorioFisicoFinanceiro({
  contexto = {},
  textos = {},
}) {
  const atividades = contexto?.atividades || [];

  return `
<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<title>Relatório Curatorial</title>

<style>
body{
  font-family: Arial;
  background:#f4f4f4;
  padding:40px;
  color:#111;
}

.page{
  background:white;
  max-width:1000px;
  margin:auto;
  padding:60px;
  border-radius:18px;
}

.activity{
  border:1px solid #ddd;
  border-radius:16px;
  padding:24px;
  margin-bottom:28px;
}

.photos{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}

.photos img{
  width:100%;
  border-radius:12px;
}
</style>
</head>

<body>

<div class="page">

<h1>Relatório Editorial Curatorial</h1>

<p>${escapeHtml(textos?.introducao || '')}</p>

${atividades.map((atividade, index) => `
<div class="activity">

<h2>${escapeHtml(atividade.nome)}</h2>

<p><strong>Museu:</strong> ${escapeHtml(atividade.museu)}</p>
<p><strong>Categoria:</strong> ${escapeHtml(atividade.categoria_editorial)}</p>
<p><strong>Data:</strong> ${escapeHtml(atividade.data)}</p>
<p><strong>Local:</strong> ${escapeHtml(atividade.local)}</p>
<p><strong>Público:</strong> ${escapeHtml(atividade.publico)}</p>

<p>
${escapeHtml(
  textos?.atividades_descricoes?.[index] || atividade.descricao || ''
)}
</p>

<div class="photos">
${(atividade?.fotos || []).slice(0,4).map((foto)=>`
  <img src="${foto?.url || foto?.file_url || ''}" />
`).join('')}
</div>

</div>
`).join('')}

</div>
</body>
</html>
`;
}

export default montarHtmlRelatorioFisicoFinanceiro;
