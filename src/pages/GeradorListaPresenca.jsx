import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { motion } from "framer-motion";
import { Printer, Trash2, Plus, Wand2, Save, CheckCircle2, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import QuickParticipantForm from "@/components/presenca/QuickParticipantForm";
import {
  findDuplicateParticipants,
  presenceIdentityKey,
  splitParticipantName,
} from "@/utils/presenca/deduplicateParticipants";
import { PUBLICO_TIPOS, normalizePresenceDate } from "@/utils/presenca/presenceMetrics";

function normalizeName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(text) {
  return text
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function isLikelyName(text) {
  const value = normalizeName(text);
  if (!value) return false;
  if (value.length < 5 || value.length > 80) return false;
  if (/[@/\\]|\d{3,}/.test(value)) return false;
  if (/^(cpf|rg|email|telefone|celular|endere[cç]o|bairro|cidade|cep|cnpj|pix|banco|ag[eê]ncia|conta|assinatura|data|atividade|oficina)$/i.test(value)) return false;
  const words = value.split(" ").filter(Boolean);
  if (words.length < 2) return false;
  const alphaWords = words.filter((w) => /[A-Za-zÀ-ÿ]/.test(w));
  if (alphaWords.length < 2) return false;
  return true;
}

function uniqueNames(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const cleaned = titleCase(normalizeName(item));
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function extractNamesFromRows(rows) {
  const candidates = [];
  for (const row of rows) {
    for (const cell of row) {
      const value = normalizeName(cell);
      if (!value) continue;
      if (isLikelyName(value)) candidates.push(value);
    }
  }
  return uniqueNames(candidates);
}

function extractNamesFromText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => normalizeName(line.replace(/[•\-–—]\s*/g, "")))
    .filter(Boolean);

  const candidates = [];

  for (const line of lines) {
    if (isLikelyName(line)) {
      candidates.push(line);
      continue;
    }

    const parts = line
      .split(/[;,|]/)
      .map((part) => normalizeName(part))
      .filter(Boolean);

    for (const part of parts) {
      if (isLikelyName(part)) candidates.push(part);
    }
  }

  return uniqueNames(candidates);
}

async function parseSpreadsheet(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const allRows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    allRows.push(...rows);
  }

  return extractNamesFromRows(allRows);
}

async function parseDocx(file) {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return extractNamesFromText(result.value);
}

async function parseDocFallback(file) {
  const text = await file.text();
  return extractNamesFromText(text);
}

const MUSEUS = ["MHAB", "MIS", "MUMO", "Museus Centro", "Noturno nos Museus"];

function emptyRows(count = 20) {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, nome: "", nome_social: "", telefone: "", email: "", cpf: "", participant_id: "", presencas: {}, assinatura: "" }));
}

function normalizeListResponse(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  return [];
}

function getProgramacaoTitle(item) {
  return item?.nome_acao || item?.titulo || item?.atividade || item?.nome || item?.evento || "Atividade";
}

function getProgramacaoDate(item) {
  return normalizePresenceDate(item?.data_realizacao || item?.data_programacao || item?.data_inicio || item?.data);
}

async function auditPresence(payload) {
  try {
    if (base44.entities.PresenceAuditLog?.create) {
      await base44.entities.PresenceAuditLog.create(payload);
      return;
    }
    await base44.entities.AuditLog?.create?.({
      action: payload.action || "PRESENCE_REGISTERED",
      entity_type: "PresenceRecord",
      entity_id: payload.presence_id || payload.lista_presenca_id || "",
      details: payload.details || "Presença registrada na lista de presença",
      metadata: payload,
    });
  } catch (error) {
    console.warn("Auditoria de presença não registrada:", error);
  }
}

export default function GeradorListaPresenca() {
  const queryClient = useQueryClient();
  const [atividadeTipo, setAtividadeTipo] = useState("Oficina");
  const [atividadeNome, setAtividadeNome] = useState("");
  const [data, setData] = useState("");
  const [datasMultiplas, setDatasMultiplas] = useState("");
  const [museu, setMuseu] = useState("MHAB");
  const [tipoPublico, setTipoPublico] = useState("oficina");
  const [atividadeId, setAtividadeId] = useState("");
  const [savingPresence, setSavingPresence] = useState(false);
  const [local, setLocal] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [rows, setRows] = useState(emptyRows());
  const [arquivoInfo, setArquivoInfo] = useState("");
  const [status, setStatus] = useState("Carregue um arquivo Excel ou Word, ou preencha manualmente.");
  const [erro, setErro] = useState("");
  const fileInputRef = useRef(null);

  const { data: participants = [] } = useQuery({
    queryKey: ["participants-presenca"],
    queryFn: async () => base44.entities.Participant?.list ? normalizeListResponse(await base44.entities.Participant.list("-updated_date", 2000)) : [],
  });

  const { data: programacao = [] } = useQuery({
    queryKey: ["programacao-presenca"],
    queryFn: async () => base44.entities.Programacao?.list ? normalizeListResponse(await base44.entities.Programacao.list("-data_realizacao", 1000)) : [],
  });

  const { data: presenceRecords = [] } = useQuery({
    queryKey: ["presence-records"],
    queryFn: async () => base44.entities.PresenceRecord?.list ? normalizeListResponse(await base44.entities.PresenceRecord.list("-data", 3000)) : [],
  });

  const tituloCabecalho = useMemo(() => {
    const tipo = atividadeTipo || "Atividade";
    return atividadeNome ? `${tipo} - ${atividadeNome}` : tipo;
  }, [atividadeTipo, atividadeNome]);

  const datasPresenca = useMemo(() => {
    const explicit = datasMultiplas
      .split(/[,;\n]/)
      .map((item) => normalizePresenceDate(item.trim()))
      .filter(Boolean);
    const all = explicit.length ? explicit : [normalizePresenceDate(data)].filter(Boolean);
    return Array.from(new Set(all)).sort();
  }, [data, datasMultiplas]);

  const selectedProgramacao = useMemo(() => programacao.find((item) => String(item.id) === String(atividadeId)), [programacao, atividadeId]);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setErro("");
    setArquivoInfo(`${file.name} (${Math.round(file.size / 1024)} KB)`);
    setStatus("Lendo arquivo e tentando identificar os nomes...");

    try {
      const lower = file.name.toLowerCase();
      let nomes = [];

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        nomes = await parseSpreadsheet(file);
      } else if (lower.endsWith(".docx")) {
        nomes = await parseDocx(file);
      } else if (lower.endsWith(".doc")) {
        nomes = await parseDocFallback(file);
      } else {
        throw new Error("Formato não suportado. Use .xls, .xlsx, .doc ou .docx.");
      }

      if (!nomes.length) {
        setRows(emptyRows());
        setStatus("Nenhum nome foi encontrado automaticamente. Você pode preencher manualmente.");
        return;
      }

      const loadedRows = nomes.map((nome, index) => ({ id: index + 1, nome, nome_social: "", telefone: "", email: "", cpf: "", participant_id: "", presencas: {}, assinatura: "" }));
      const minRows = Math.max(loadedRows.length, 20);
      while (loadedRows.length < minRows) {
        loadedRows.push({ id: loadedRows.length + 1, nome: "", nome_social: "", telefone: "", email: "", cpf: "", participant_id: "", presencas: {}, assinatura: "" });
      }

      setRows(loadedRows);
      setStatus(`${nomes.length} nome(s) identificado(s) com sucesso.`);
    } catch (e) {
      console.error(e);
      setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      setStatus("Falha na leitura do arquivo.");
    }
  }

  function updateRow(id, field, value) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { id: current.length + 1, nome: "", nome_social: "", telefone: "", email: "", cpf: "", participant_id: "", presencas: {}, assinatura: "" }]);
  }

  function fillFromParticipant(rowId, participantId) {
    const participant = participants.find((item) => String(item.id) === String(participantId));
    if (!participant) return;
    setRows((current) => current.map((row) => row.id === rowId ? {
      ...row,
      participant_id: participant.id,
      nome: participant.nome_completo || participant.nome || "",
      nome_social: participant.nome_social || "",
      telefone: participant.telefone || "",
      email: participant.email || "",
      cpf: participant.cpf || participant.passaporte || "",
    } : row));
  }

  function togglePresence(rowId, date) {
    setRows((current) => current.map((row) => row.id === rowId ? {
      ...row,
      presencas: {
        ...(row.presencas || {}),
        [date]: row.presencas?.[date] === "presente" ? "ausente" : "presente",
      },
    } : row));
  }

  async function saveParticipant(participant) {
    if (!base44.entities.Participant?.create) throw new Error("Entidade Participant ainda não está disponível no Base44.");
    const duplicate = findDuplicateParticipants(participant, participants)[0]?.participant;
    const payload = {
      ...participant,
      museu: participant.museu || museu,
      atividade_id: atividadeId || "",
      atividade_nome: atividadeNome || getProgramacaoTitle(selectedProgramacao),
      oficina_id: atividadeTipo === "Oficina" ? atividadeId : "",
      origem: "GeradorListaPresenca",
      updated_at: new Date().toISOString(),
    };
    const saved = duplicate?.id
      ? await base44.entities.Participant.update(duplicate.id, payload)
      : await base44.entities.Participant.create({ ...payload, created_at: new Date().toISOString() });
    await base44.entities.ParticipantAuditLog?.create?.({
      action: duplicate?.id ? "PARTICIPANT_UPDATED" : "PARTICIPANT_CREATED",
      participant_id: saved?.id || duplicate?.id || "",
      museu,
      atividade_id: atividadeId,
      details: `Participante ${participant.nome_completo} salvo pela lista de presença`,
      created_at: new Date().toISOString(),
    }).catch(() => null);
    await queryClient.invalidateQueries({ queryKey: ["participants-presenca"] });
    return saved || duplicate;
  }

  async function getOrCreateParticipant(row) {
    if (row.participant_id) return participants.find((item) => String(item.id) === String(row.participant_id)) || { id: row.participant_id, nome_completo: row.nome };
    const parts = splitParticipantName(row.nome);
    const candidate = {
      nome_completo: row.nome,
      nome_social: row.nome_social || "",
      telefone: row.telefone || "",
      email: row.email || "",
      cpf: row.cpf || "",
      ...parts,
      museu,
    };
    const duplicate = findDuplicateParticipants(candidate, participants)[0]?.participant;
    if (duplicate?.id) return duplicate;
    return base44.entities.Participant.create({ ...candidate, origem: "GeradorListaPresenca", created_at: new Date().toISOString() });
  }

  async function savePresenceList() {
    if (!base44.entities.PresenceRecord?.create) {
      toast.error("Entidade PresenceRecord ainda não está disponível no Base44.");
      return;
    }
    const validRows = rows.filter((row) => normalizeName(row.nome));
    if (!validRows.length) {
      toast.error("Inclua ao menos um participante.");
      return;
    }
    if (!museu) {
      toast.error("Selecione o museu.");
      return;
    }
    if (!datasPresenca.length) {
      toast.error("Informe ao menos uma data.");
      return;
    }
    setSavingPresence(true);
    try {
      const listaId = `lista-${Date.now()}`;
      const existingKeys = new Set((presenceRecords || []).map(presenceIdentityKey));
      let created = 0;
      let skipped = 0;

      for (const row of validRows) {
        const participant = await getOrCreateParticipant(row);
        for (const date of datasPresenca) {
          const statusPresenca = row.presencas?.[date] || "presente";
          if (statusPresenca !== "presente") continue;
          const record = {
            participant_id: participant?.id || "",
            participant_name: participant?.nome_completo || row.nome,
            nome_completo: participant?.nome_completo || row.nome,
            museu,
            activity_id: atividadeId || selectedProgramacao?.id || "",
            atividade_id: atividadeId || selectedProgramacao?.id || "",
            atividade_nome: atividadeNome || getProgramacaoTitle(selectedProgramacao),
            oficina_id: atividadeTipo === "Oficina" ? (atividadeId || selectedProgramacao?.id || "") : "",
            data: date,
            data_presenca: date,
            tipo_presenca: tipoPublico,
            tipo_publico: tipoPublico,
            origem_lista: "GeradorListaPresenca",
            lista_presenca_id: listaId,
            responsavel,
            status_presenca: "presente",
            assinatura: row.assinatura || "",
            computed_as_public: true,
            created_at: new Date().toISOString(),
          };
          const key = presenceIdentityKey(record);
          if (existingKeys.has(key)) {
            skipped += 1;
            continue;
          }
          const saved = await base44.entities.PresenceRecord.create(record);
          existingKeys.add(key);
          created += 1;
          await auditPresence({
            action: "PRESENCE_REGISTERED",
            presence_id: saved?.id || "",
            lista_presenca_id: listaId,
            participant_id: participant?.id || "",
            museu,
            atividade_id: record.atividade_id,
            data: date,
            origem: "GeradorListaPresenca",
            responsavel,
            details: `Presença registrada para ${record.participant_name}`,
            created_at: new Date().toISOString(),
          });
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["presence-records"] }),
        queryClient.invalidateQueries({ queryKey: ["participants-presenca"] }),
      ]);
      toast.success(`${created} presença(s) registrada(s). ${skipped} duplicidade(s) evitada(s).`);
      setStatus(`${created} presença(s) alimentando indicadores. ${skipped} duplicidade(s) evitada(s).`);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao registrar presenças.");
    } finally {
      setSavingPresence(false);
    }
  }

  function resetForm() {
    setRows(emptyRows());
    setArquivoInfo("");
    setStatus("Campos limpos. Você pode carregar outro arquivo.");
    setErro("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function printPage() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 print:bg-white">
      <div className="mx-auto max-w-7xl grid gap-6 lg:grid-cols-[420px_1fr]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl shadow-sm print:hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Wand2 className="h-5 w-5" />
                Gerador de Lista de Presença
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Arquivo de origem</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx,.doc,.docx"
                  onChange={handleFileChange}
                />
                <p className="text-sm text-slate-500">
                  Compatível com Excel (.xls/.xlsx) e Word (.doc/.docx). Para arquivos antigos, o melhor resultado costuma vir após salvar em .xlsx ou .docx.
                </p>
                {arquivoInfo && <p className="text-sm font-medium">Arquivo: {arquivoInfo}</p>}
              </div>

              <Alert>
                <AlertDescription>{status}</AlertDescription>
              </Alert>

              {erro && (
                <Alert className="border-red-300">
                  <AlertDescription>{erro}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Museu *</Label>
                    <Select value={museu} onValueChange={setMuseu}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MUSEUS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de público</Label>
                    <Select value={tipoPublico} onValueChange={setTipoPublico}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PUBLICO_TIPOS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de atividade</Label>
                  <Select value={atividadeTipo} onValueChange={setAtividadeTipo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Oficina">Oficina</SelectItem>
                      <SelectItem value="Palestra">Palestra</SelectItem>
                      <SelectItem value="Curso">Curso</SelectItem>
                      <SelectItem value="Reunião">Reunião</SelectItem>
                      <SelectItem value="Treinamento">Treinamento</SelectItem>
                      <SelectItem value="Outra Atividade">Outra Atividade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Nome da atividade</Label>
                  <Input value={atividadeNome} onChange={(e) => setAtividadeNome(e.target.value)} placeholder="Ex.: Oficina de Empregabilidade" />
                </div>

                <div className="space-y-2">
                  <Label>Vincular à agenda / atividade existente</Label>
                  <Select
                    value={atividadeId || "__manual__"}
                    onValueChange={(value) => {
                      if (value === "__manual__") {
                        setAtividadeId("");
                        return;
                      }
                      const item = programacao.find((entry) => String(entry.id) === String(value));
                      setAtividadeId(value);
                      if (item) {
                        setAtividadeNome(getProgramacaoTitle(item));
                        setData(getProgramacaoDate(item) || data);
                        setLocal(item.local || item.local_museu || item.equipamento || local);
                        setMuseu(item.museu || item.centro_custo || museu);
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar atividade" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manual__">Lista manual sem agenda vinculada</SelectItem>
                      {programacao.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {getProgramacaoDate(item) || "sem data"} · {getProgramacaoTitle(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Local</Label>
                    <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: CRAS Barreiro" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Datas adicionais</Label>
                  <Textarea value={datasMultiplas} onChange={(e) => setDatasMultiplas(e.target.value)} placeholder="Uma data por linha, ou separadas por vírgula. Ex.: 2026-04-01, 2026-04-08, 2026-04-15" className="resize-none" rows={2} />
                  <p className="text-xs text-slate-500">Cada data gera uma coluna de presença e impede duplicidade por participante, atividade e data.</p>
                </div>

                <Card className="border-dashed shadow-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Cadastro rápido de participante</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <QuickParticipantForm defaultMuseu={museu} onSave={saveParticipant} />
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Nome do responsável" />
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Informações adicionais..." className="resize-none" rows={3} />
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={addRow} className="flex-1" variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar linha
                  </Button>
                  <Button onClick={resetForm} variant="outline">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button onClick={printPage} className="flex-1">
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir
                  </Button>
                </div>
                <Button onClick={savePresenceList} disabled={savingPresence} className="w-full bg-emerald-700 hover:bg-emerald-800">
                  {savingPresence ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Registrar presenças e alimentar indicadores
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle>{tituloCabecalho}</CardTitle>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-500">
                <Badge variant="outline">{museu}</Badge>
                <Badge variant="outline">{tipoPublico}</Badge>
                {datasPresenca.map((item) => <Badge key={item} variant="secondary">{new Date(`${item}T00:00:00`).toLocaleDateString("pt-BR")}</Badge>)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="min-w-56">Participante</TableHead>
                      <TableHead className="min-w-44 print:hidden">Reutilizar cadastro</TableHead>
                      <TableHead className="min-w-36">Telefone</TableHead>
                      <TableHead className="min-w-44">E-mail</TableHead>
                      <TableHead className="min-w-36">CPF/passaporte</TableHead>
                      {datasPresenca.map((item) => <TableHead key={item} className="min-w-24 text-center">{new Date(`${item}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</TableHead>)}
                      <TableHead className="w-48">Assinatura participante</TableHead>
                      <TableHead className="w-48">Assinatura educador/professor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...rows].sort((a, b) => normalizeName(a.nome).localeCompare(normalizeName(b.nome))).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-slate-600">{row.id}</TableCell>
                        <TableCell>
                          <Input
                            value={row.nome}
                            onChange={(e) => updateRow(row.id, "nome", e.target.value)}
                            placeholder="Nome do participante"
                            className="print:border-0 print:p-0"
                          />
                          {row.nome_social && <p className="mt-1 text-xs text-slate-500">Nome social: {row.nome_social}</p>}
                        </TableCell>
                        <TableCell className="print:hidden">
                          <Select value={row.participant_id || "__none__"} onValueChange={(value) => value === "__none__" ? updateRow(row.id, "participant_id", "") : fillFromParticipant(row.id, value)}>
                            <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Novo participante</SelectItem>
                              {participants.map((participant) => (
                                <SelectItem key={participant.id} value={String(participant.id)}>
                                  {participant.nome_completo || participant.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input value={row.telefone || ""} onChange={(e) => updateRow(row.id, "telefone", e.target.value)} className="print:border-0 print:p-0" />
                        </TableCell>
                        <TableCell>
                          <Input value={row.email || ""} onChange={(e) => updateRow(row.id, "email", e.target.value)} className="print:border-0 print:p-0" />
                        </TableCell>
                        <TableCell>
                          <Input value={row.cpf || ""} onChange={(e) => updateRow(row.id, "cpf", e.target.value)} className="print:border-0 print:p-0" />
                        </TableCell>
                        {datasPresenca.map((item) => (
                          <TableCell key={item} className="text-center">
                            <Button type="button" size="sm" variant={row.presencas?.[item] === "ausente" ? "outline" : "default"} onClick={() => togglePresence(row.id, item)} className="h-8 w-8 p-0 print:hidden">
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <span className="hidden print:inline">{row.presencas?.[item] === "ausente" ? "Ausente" : "Presente"}</span>
                          </TableCell>
                        ))}
                        <TableCell className="print:border-b print:border-slate-300">
                          <Input value={row.assinatura || ""} onChange={(e) => updateRow(row.id, "assinatura", e.target.value)} className="print:hidden" placeholder="assinatura digital opcional" />
                        </TableCell>
                        <TableCell className="print:border-b print:border-slate-300" />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {responsavel && (
            <Card className="rounded-2xl shadow-sm print:hidden">
              <CardContent className="pt-6">
                <div className="text-sm text-slate-600">
                  <p><strong>Responsável:</strong> {responsavel}</p>
                  {observacoes && <p className="mt-2"><strong>Observações:</strong> {observacoes}</p>}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}
