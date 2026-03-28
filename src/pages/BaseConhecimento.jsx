import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function BaseConhecimento() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      const data = await base44.entities.KnowledgeDocument.list();
      setFiles(data || []);
    } catch (err) {
      console.error('Erro ao carregar documentos:', err);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      await base44.entities.KnowledgeDocument.create({
        file_name: file.name,
        file,
      });

      carregar();
    } catch (err) {
      console.error('Erro upload:', err);
    }
  }

  async function remover(id) {
    try {
      await base44.entities.KnowledgeDocument.delete(id);
      carregar();
    } catch (err) {
      console.error('Erro ao remover:', err);
    }
  }

  return (
    <div className="space-y-4">

      <h1 className="text-2xl font-semibold">
        Base de Conhecimento
      </h1>

      <input type="file" onChange={upload} />

      {loading && <p>Carregando...</p>}

      {!loading && files.length === 0 && (
        <p>Nenhum arquivo enviado.</p>
      )}

      <div className="space-y-2">
        {files.map((f) => (
          <div key={f.id} className="border p-3 rounded flex justify-between">

            <a href={f.file_url} target="_blank">
              {f.file_name}
            </a>

            <button onClick={() => remover(f.id)}>
              Remover
            </button>

          </div>
        ))}
      </div>

    </div>
  );
}