// Leitura direta do Google Sheets pelo navegador, para publicacoes que contem
// apenas a pasta dist (sem funcoes de servidor). Quando as funcoes existem,
// este arquivo nao faz nada: ele so assume o controle se /api/... nao responder.
//
// A regra de negocio nao e duplicada: transformWorkbook e o MESMO modulo usado
// pela funcao de servidor, so que empacotado para o navegador.
import { transformWorkbook, containsSensitiveAbsenceFields } from "../netlify/functions/_shared/data.mjs";

// Guardado antes de qualquer substituicao, para o proprio modulo nao chamar a si mesmo.
const originalFetch = globalThis.fetch.bind(globalThis);

const SHEET_ID = document.documentElement.dataset.sheetId || "1BcHzuaOFOm2MMs11l-BNBzMmlnzdHdPrnhSnIPk7z30";

const SHEETS = {
  inspections: "Inspeções por Setor",
  dds: "DDS",
  absences: "Absenteísmo",
  pending: "Pendências",
};

// Mesma analise de resposta gviz usada no servidor.
function parseGviz(body) {
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("A planilha não está disponível para leitura pública.");
  const json = body.slice(start, end + 1).replace(/("(?:\\.|[^"\\])*")|Date\(\d+,\d+,\d+(?:,\d+,\d+,\d+)?\)/g, (match, quoted) => quoted || JSON.stringify(match));
  const parsed = JSON.parse(json);
  if (parsed.status === "error") throw new Error("O Google recusou a leitura da planilha.");
  const headers = (parsed.table?.cols || []).map((column, index) => column.label || column.id || `Coluna ${index + 1}`);
  return (parsed.table?.rows || []).map((row) => Object.fromEntries(headers.map((header, index) => {
    const cell = row.c?.[index];
    let value = cell?.f ?? cell?.v ?? "";
    if (!cell?.f && typeof value === "string") {
      const match = value.match(/^Date\((\d+),(\d+),(\d+)/);
      if (match) value = `${match[1]}-${String(+match[2] + 1).padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    }
    return [header, value];
  })));
}

// Lista suspensa de setores: coluna U da aba DDS. E consultada pela letra da coluna,
// entao continua funcionando mesmo se a celula de titulo mudar ou ficar vazia.
async function fetchSectorList() {
  const params = new URLSearchParams({ tqx: "out:json", sheet: SHEETS.dds, tq: "select U" });
  const response = await originalFetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(SHEET_ID)}/gviz/tq?${params}`, { signal: AbortSignal.timeout(10000), credentials: "omit" });
  if (!response.ok) return [];
  let rows;
  try { rows = parseGviz(await response.text()); } catch { return []; }
  const seen = new Set();
  const list = [];
  for (const row of rows) {
    const value = String(Object.values(row)[0] ?? "").trim();
    if (!value) continue;
    const key = value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    // "Todos os setores" ja existe como opcao fixa do seletor.
    if (key === "todos os setores" || seen.has(key)) continue;
    seen.add(key);
    list.push(value);
  }
  return list;
}

async function fetchSheet(name) {
  const params = new URLSearchParams({ tqx: "out:json", headers: "1", sheet: name });
  const response = await originalFetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(SHEET_ID)}/gviz/tq?${params}`, { signal: AbortSignal.timeout(10000), credentials: "omit" });
  if (!response.ok) throw new Error(`A aba ${name} não pôde ser lida (${response.status}). Confira se a planilha está compartilhada por link.`);
  return parseGviz(await response.text());
}

// Hash curto e estavel, so para gerar o ETag. Nao e seguranca, e comparacao.
function revisionOf(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
    h2 = Math.imul(h2 + code, 2246822519) >>> 0;
  }
  return (h1.toString(16) + h2.toString(16)).padStart(16, "0");
}

let cached = null;
let inFlight = null;

async function workbook() {
  if (!cached || Date.now() - cached.time >= 10000) {
    if (!inFlight) {
      inFlight = Promise.all([
        Promise.all(Object.entries(SHEETS).map(async ([key, name]) => [key, await fetchSheet(name)])),
        fetchSectorList(),
      ])
        .then(([entries, sectors]) => { cached = { data: Object.fromEntries(entries), sectors, time: Date.now() }; })
        .finally(() => { inFlight = null; });
    }
    await inFlight;
  }
  return cached;
}

const chave = (valor) => String(valor).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

// Os setores estao numa validacao de dados do Google Sheets (o menu que aparece
// ao clicar na celula). Esse tipo de lista NAO fica em celula nenhuma e a leitura
// publica do Google nao consegue ve-la, por isso ela vive aqui.
// "Todos os setores" nao entra: ja e a opcao fixa do seletor.
// Qualquer setor novo que apareca na coluna U ou nos registros se junta a esta
// lista automaticamente, sem precisar mexer no codigo.
const SETORES_PADRAO = ["Matéria Prima", "Moinho", "Logística", "Produção", "Manutenção", "Ferramentaria", "Montagem", "Embarque", "Galpão"];

// A lista suspensa junta duas fontes: a coluna U da aba DDS e os setores que ja
// aparecem nos registros. Assim ela funciona se a planilha guardar a lista em
// celulas e tambem se usar apenas a validacao de dados do Google, que a leitura
// publica nao consegue enxergar.
function mesclarSetores(listados = [], usados = []) {
  const vistos = new Set();
  const resultado = [];
  for (const valor of [...listados, ...usados]) {
    const texto = String(valor ?? "").trim();
    if (!texto) continue;
    const k = chave(texto);
    // "Todos os setores" ja e a opcao fixa do seletor.
    if (k === "todos os setores" || vistos.has(k)) continue;
    vistos.add(k);
    resultado.push(texto);
  }
  return resultado;
}

async function snapshot(detail) {
  const source = await workbook();
  const data = transformWorkbook(source.data, { detail });
  if (containsSensitiveAbsenceFields(data)) throw new Error("Falha na proteção dos dados pessoais.");
  const count = ["inspections", "dds", "pending", "absences"].reduce((sum, key) => sum + data[key].length, 0);
  const payload = {
    ...data,
    sectors: mesclarSetores(SETORES_PADRAO, [...(source.sectors || []), ...["inspections", "dds", "pending", "absences"].flatMap((key) => (data[key] || []).map((row) => row.sector))]),
    generatedAt: new Date(source.time).toISOString(),
    source: "navegador-direto",
    message: count
      ? "Google Sheets conectado, leitura direta pelo navegador. Edição dos dados feita na planilha."
      : "Planilha conectada, ainda sem lançamentos nas abas de dados.",
  };
  payload.revision = revisionOf(JSON.stringify(payload));
  return payload;
}

function json(status, body, headers = {}) {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

async function localApi(path, init = {}) {
  const url = new URL(path, location.origin);
  if (url.pathname === "/api/relatorios-acesso") return json(200, { protected: false, authenticated: true });
  if (url.pathname === "/api/ia") {
    return json(503, { error: "Esta publicação não inclui o servidor da IA. Os indicadores, filtros e o PDF continuam funcionando normalmente." });
  }
  if (url.pathname !== "/api/dados") return json(404, { error: "Recurso indisponível." });
  try {
    const detail = url.searchParams.get("detail") === "report" ? "report" : "public";
    const payload = await snapshot(detail);
    const etag = `"${payload.revision}"`;
    const requested = new Headers(init.headers || {}).get("If-None-Match");
    if (requested === etag) return json(304, null, { ETag: etag });
    return json(200, payload, { ETag: etag });
  } catch (error) {
    return json(502, { error: error.name === "TimeoutError" ? "O Google demorou para responder. Nova tentativa automática." : error.message });
  }
}

// Por ENDPOINT, nunca global: numa publicacao com /api/ia de verdade e sem
// /api/dados, a rota da IA precisa continuar indo ao servidor mesmo depois de
// /api/dados ter caido para a leitura direta da planilha.
// 'server' = existe no servidor; 'local' = respondido aqui no navegador.
const modos = new Map();

globalThis.fetch = async function (input, init) {
  const path = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url || "";
  if (!path.startsWith("/api/")) return originalFetch(input, init);
  const rota = new URL(path, location.origin).pathname;
  if (modos.get(rota) === "local") return localApi(path, init);
  try {
    const response = await originalFetch(input, init);
    if (response.status === 404) { modos.set(rota, "local"); return localApi(path, init); }
    modos.set(rota, "server");
    return response;
  } catch (error) {
    if (modos.get(rota) === "server") throw error;
    modos.set(rota, "local");
    return localApi(path, init);
  }
};
