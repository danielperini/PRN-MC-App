import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Upload, Loader2, CheckCircle2, AlertCircle, X, ShieldCheck, User } from
'lucide-react';

const STATUS_COLOR = {
  aguardando: 'bg-slate-100 text-slate-500',
  processando: 'bg-blue-100 text-blue-700',
  aprovado: 'bg-green-100 text-green-700',
  erro: 'bg-red-100 text-red-600'
};

export default function CoordBulkImportPanel() {
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  const [targetEmail, setTargetEmail] = useState('');
  const [targetName, setTargetName] = useState('');
  const [files, setFiles] = useState([]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]); // { name, status, tipo, nome_final, error }

  function handleFileChange(e) {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
    setResults([]);
    e.target.value = '';
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setResults([]);
  }

  async function handleProcessar() {
    if (!targetEmail.trim()) {
      toast({ title: 'Informe o e-mail do usuário emissor.', variant: 'destructive' });
      return;
    }
    if (files.length === 0) {
      toast({ title: 'Adicione ao menos um arquivo.', variant: 'destructive' });
      return;
    }

    setRunning(true);
    const res = files.map((f) => ({ name: f.name, status: 'aguardando', tipo: '', nome_final: '', error: '' }));
    setResults([...res]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // 1. Atualiza status → processando
      setResults((prev) => prev.map((r, idx) => idx === i ? { ...r, status: 'processando' } : r));

      try {
        // 2. Upload
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        // 3. Attachment de guarda
        const att = await base44.entities.Attachment.create({
          report_id: '',
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          file_url,
          description: `[COORD IMPORT] ${targetEmail}`,
          backup_done: false
        });

        // 4. Cria DocumentIntake
        const intake = await base44.entities.DocumentIntake.create({
          user_email: targetEmail.trim().toLowerCase(),
          user_name: targetName.trim() || targetEmail.trim(),
          arquivo_original_url: file_url,
          file_name_original: file.name,
          mime_type: file.type,
          status_processamento: 'ENVIADO',
          tipo_detectado: 'PENDENTE',
          entidade_destino: 'Attachment',
          entidade_destino_id: att.id
        });

        // 5. Processa e auto-aprova via função coordenadora
        const resp = await base44.functions.invoke('coordBulkImport', {
          intake_id: intake.id,
          target_user_email: targetEmail.trim().toLowerCase(),
          target_user_name: targetName.trim() || targetEmail.trim()
        });

        const data = resp?.data || {};

        setResults((prev) => prev.map((r, idx) =>
        idx === i ? {
          ...r,
          status: data.ok ? 'aprovado' : 'erro',
          tipo: data.tipo || '?',
          nome_final: data.nome_final || file.name,
          error: data.error || ''
        } : r
        ));

      } catch (e) {
        setResults((prev) => prev.map((r, idx) =>
        idx === i ? { ...r, status: 'erro', error: e.message } : r
        ));
      }
    }

    setRunning(false);
    toast({ title: 'Processamento concluído.', description: 'Verifique os resultados abaixo.' });
  }

  const aprovados = results.filter((r) => r.status === 'aprovado').length;
  const erros = results.filter((r) => r.status === 'erro').length;

  return (
    <div className="border-2 border-slate-300 rounded-2xl bg-slate-50 p-5 space-y-5 hidden">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-slate-600" />
        <span className="font-semibold text-slate-800 text-sm">Importação em Lote — Modo Coordenação</span>
        <Badge className="ml-auto bg-slate-200 text-slate-700 border-slate-400 text-xs">Restrito</Badge>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        Faça upload de múltiplos arquivos em nome de um profissional. A IA classifica, nomeia e aprova automaticamente, mesmo que sejam de meses anteriores.
      </p>

      {/* Usuário emissor */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-600 flex items-center gap-1">
            <User className="w-3 h-3" /> E-mail do profissional <span className="text-red-500">*</span>
          </Label>
          <Input
            placeholder="email@viadutodasartes.org.br"
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value)}
            disabled={running}
            className="text-sm h-8" />
          
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">Nome do profissional</Label>
          <Input
            placeholder="Nome completo (opcional)"
            value={targetName}
            onChange={(e) => setTargetName(e.target.value)}
            disabled={running}
            className="text-sm h-8" />
          
        </div>
      </div>

      {/* Upload */}
      <div
        className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => !running && fileInputRef.current?.click()}>
        
        <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
        <p className="text-xs text-slate-600">Clique para selecionar arquivos (PDF, XML, imagens)</p>
        <p className="text-xs text-slate-400 mt-0.5">Múltiplos arquivos permitidos</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.xml,.jpg,.jpeg,.png,.webp"
          onChange={handleFileChange}
          className="hidden"
          disabled={running} />
        
      </div>

      {/* Lista de arquivos selecionados */}
      {files.length > 0 &&
      <div className="space-y-1 max-h-52 overflow-y-auto">
          {files.map((file, i) => {
          const r = results[i];
          return (
            <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-100 text-xs">
                <span className="flex-1 truncate text-slate-700">{file.name}</span>

                {/* Status */}
                {r &&
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status]}`}>
                    {r.status === 'processando' && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
                    {r.status === 'aprovado' && <CheckCircle2 className="w-3 h-3 inline mr-1 text-green-600" />}
                    {r.status === 'erro' && <AlertCircle className="w-3 h-3 inline mr-1 text-red-500" />}
                    {r.status === 'aprovado' ? r.tipo || 'Aprovado' : r.status}
                  </span>
              }
                {r?.nome_final && r.nome_final !== file.name &&
              <span className="text-slate-500 truncate max-w-[120px]" title={r.nome_final}>→ {r.nome_final}</span>
              }
                {r?.error &&
              <span className="text-red-400 truncate max-w-[100px]" title={r.error}>{r.error}</span>
              }

                {!running && !r &&
              <button onClick={() => removeFile(i)} className="text-slate-300 hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
              }
              </div>);

        })}
        </div>
      }

      {/* Resumo */}
      {results.length > 0 && !running &&
      <div className="flex gap-4 text-xs font-medium">
          <span className="text-green-700">✔ {aprovados} aprovados</span>
          {erros > 0 && <span className="text-red-600">✖ {erros} com erro</span>}
        </div>
      }

      {/* Botão */}
      <Button
        onClick={handleProcessar}
        disabled={running || files.length === 0}
        className="w-full bg-black hover:bg-slate-800 text-white">
        
        {running ?
        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processando {results.filter((r) => r.status === 'processando').length > 0 ? `(${results.findIndex((r) => r.status === 'processando') + 1}/${files.length})` : ''}...</> :
        <><Upload className="w-4 h-4 mr-2" /> Classificar e Aprovar {files.length > 0 ? `(${files.length} arquivo${files.length > 1 ? 's' : ''})` : ''}</>
        }
      </Button>
    </div>);

}