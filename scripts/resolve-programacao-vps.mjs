import fs from 'node:fs';

function updateFile(file, transform) {
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) console.log('SEM_ALTERACAO', file);
  else {
    fs.writeFileSync(file, after);
    console.log('ATUALIZADO', file);
  }
}

updateFile('backend/Dockerfile', (source) => {
  let out = source;
  out = out.replace(/(RUN\s+npm\s+init\s+-y\s+&&\s+npm\s+install\s+)([^\r\n]+)/, (line, prefix, packages) => {
    return /(?:^|\s)xlsx(?:\s|$)/.test(packages) ? line : `${prefix}${packages.trim()} xlsx`;
  });
  if (!/COPY\s+programacao-sync\.mjs\s+\.\//.test(out)) {
    const anchor = /COPY\s+server\.mjs\s+\.\/\s*\r?\n/;
    if (!anchor.test(out)) throw new Error('COPY server.mjs não encontrado no Dockerfile');
    out = out.replace(anchor, match => `${match}COPY programacao-sync.mjs ./\n`);
  }
  out = out.replace(/^CMD\s+\[(.+)\]\s*$/m, (line, content) => {
    if (content.includes('programacao-sync.mjs')) return line;
    const parts = content.split(',').map(value => value.trim());
    const serverIndex = parts.findIndex(value => /["']server\.mjs["']/.test(value));
    if (serverIndex < 0) throw new Error('CMD do servidor não reconhecido no Dockerfile');
    parts.splice(serverIndex, 0, '"--import"', '"./programacao-sync.mjs"');
    return `CMD [${parts.join(', ')}]`;
  });
  return out;
});

updateFile('backend/server.mjs', (source) => {
  let out = source;
  if (!out.includes("from './programacao-sync.mjs'")) {
    const anchor = "import { Server as SocketIOServer } from 'socket.io';";
    if (!out.includes(anchor)) throw new Error('Import do Socket.IO não encontrado');
    out = out.replace(anchor, `${anchor}\nimport { syncProgramacao } from './programacao-sync.mjs';`);
  }
  if (!out.includes("name === 'syncBaseConhecimento' && req.body?.force_programacao_sync")) {
    const route = /app\.post\('\/api\/apps\/:appId\/functions\/:functionName',[\s\S]*?\n\s*try\s*\{/;
    const match = out.match(route);
    if (!match) throw new Error('Rota de funções não encontrada em server.mjs');
    const block = `\n    if (name === 'syncBaseConhecimento' && req.body?.force_programacao_sync) {\n      const result = await syncProgramacao();\n      if (result?.error) return res.status(502).json({ success:false, function:name, error:'programacao_sync_failed', message:result.error });\n      return res.status(200).json({ success:true, function:name, programacao_sync:result });\n    }`;
    out = out.replace(match[0], `${match[0]}${block}`);
  }
  return out;
});

console.log('RESOLUCAO_PROGRAMACAO_APLICADA');
