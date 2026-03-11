import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, FileText, Printer, Trash2, Plus, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

function emptyRows(count = 20) {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, nome: "", assinatura: "" }));
}

export default function GeradorListaPresenca() {
  const [atividadeTipo, setAtividadeTipo] = useState("Oficina");
  const [atividadeNome, setAtividadeNome] = useState("");
  const [data, setData] = useState("");
  const [local, setLocal] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [rows, setRows] = useState(emptyRows());
  const [arquivoInfo, setArquivoInfo] = useState("");
  const [status, setStatus] = useState("Carregue um arquivo Excel ou Word, ou preencha manualmente.");
  const [erro, setErro] = useState("");
  const fileInputRef = useRef(null);

  const tituloCabecalho = useMemo(() => {
    const tipo = atividadeTipo || "Atividade";
    return atividadeNome ? `${tipo} - ${atividadeNome}` : tipo;
  }, [atividadeTipo, atividadeNome]);

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

      const loadedRows = nomes.map((nome, index) => ({ id: index + 1, nome, assinatura: "" }));
      const minRows = Math.max(loadedRows.length, 20);
      while (loadedRows.length < minRows) {
        loadedRows.push({ id: loadedRows.length + 1, nome: "", assinatura: "" });
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
    setRows((current) => [...current, { id: current.length + 1, nome: "", assinatura: "" }]);
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
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle>{tituloCabecalho}</CardTitle>
              {data && <p className="text-sm text-slate-500 mt-2">{new Date(data).toLocaleDateString("pt-BR")}</p>}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="w-48">Assinatura</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-slate-600">{row.id}</TableCell>
                        <TableCell>
                          <Input
                            value={row.nome}
                            onChange={(e) => updateRow(row.id, "nome", e.target.value)}
                            placeholder="Nome do participante"
                            className="print:border-0 print:p-0"
                          />
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