const normalize = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function compactRow(row) {
  const result = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (value !== null && value !== undefined && String(value).trim() !== "") result[normalize(key)] = value;
  }
  return result;
}

function pick(row, ...aliases) {
  const source = row.__normalized || compactRow(row);
  for (const alias of aliases) {
    const value = source[normalize(alias)];
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return "";
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBoolean(value) {
  const normalized = normalize(value);
  return /^(sim|s|yes|true|1|ok|realizado)$/.test(normalized);
}

function participantCount(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

export function rowsToObjects(rows = []) {
  if (!rows.length) return [];
  const headerIndex = rows.findIndex((row) => Array.isArray(row) && row.some((cell) => String(cell || "").trim()));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex].map((value, index) => String(value || `Coluna ${index + 1}`).trim());
  return rows.slice(headerIndex + 1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values?.[index] ?? ""]))).filter((row) => Object.values(row).some((value) => String(value || "").trim()));
}

function mapInspection(row, detail) {
  const source = { ...row, __normalized: compactRow(row) };
  const mapped = {
    date: pick(source, "Data", "Data inspeção", "Data da inspeção"),
    sector: pick(source, "Setor", "Local", "Área"),
    item: pick(source, "Item verificado", "Item", "Origem"),
    condition: pick(source, "Situação encontrada", "Condição observada", "Não conformidade", "Pendência"),
    risk: pick(source, "Risco", "Risco observado"),
    action: pick(source, "Ação necessária", "Ação corretiva", "Tratativa"),
    due: pick(source, "Prazo", "Data limite", "Vencimento"),
    status: pick(source, "Status", "Situação"),
    priority: pick(source, "Prioridade", "Criticidade"),
    // Colunas que antes so iam para o relatorio. O painel mostra a aba inteira.
    owner: pick(source, "Responsável", "Responsavel"),
    evidence: pick(source, "Foto/Evidência", "Evidência", "Foto"),
    notes: pick(source, "Observações", "Observacao"),
  };
  return mapped;
}

function mapDds(row, detail) {
  const source = { ...row, __normalized: compactRow(row) };
  const mapped = {
    date: pick(source, "Data"),
    time: pick(source, "Horário", "Horario"),
    topic: pick(source, "Tema do DDS", "Tema"),
    sector: pick(source, "Setor", "Área"),
    shift: pick(source, "Turno"),
    participants: participantCount(pick(source, "Participantes", "Quantidade de participantes", "Qtd participantes")),
    // O texto original da coluna Participantes, para nada se perder quando a
    // celula nao for um numero (por exemplo "Colaboradores").
    participantsLabel: String(pick(source, "Participantes", "Quantidade de participantes", "Qtd participantes") || "").trim(),
    registered: asBoolean(pick(source, "Registro realizado?", "Registro realizado", "Registrado")),
    owner: pick(source, "Responsável", "Responsavel"),
    notes: pick(source, "Observações"),
  };
  return mapped;
}

function mapAbsence(row) {
  const source = { ...row, __normalized: compactRow(row) };
  return {
    interviewDate: pick(source, "Data entrevista", "Data da entrevista"),
    absenceDate: pick(source, "Data(s) ausência", "Data ausência", "Data da ausência"),
    sector: pick(source, "Setor", "Área"),
    days: asNumber(pick(source, "Qtd. dias", "Qtd dias", "Quantidade de dias", "Dias")),
    notified: asBoolean(pick(source, "Ausência comunicada?", "Ausência comunicada", "Comunicada")),
    // Indicadores de controle, sim ou nao. Nao identificam a pessoa nem revelam
    // o motivo. Nome, CID, motivo, descricao do ocorrido e orientacao/restricao
    // continuam fora: sao dados pessoais e medicos, e o painel e publico.
    certificate: asBoolean(pick(source, "Atestado/documento?", "Atestado/documento", "Atestado")),
    fitOnReturn: asBoolean(pick(source, "Apto no retorno?", "Apto no retorno")),
  };
}

function mapPending(row, detail) {
  const source = { ...row, __normalized: compactRow(row) };
  const mapped = {
    date: pick(source, "Data", "Data registro"),
    sector: pick(source, "Setor", "Área", "Local"),
    description: pick(source, "Não conformidade / problema", "Pendência", "Descrição", "Situação encontrada", "Não conformidade", "Item"),
    action: pick(source, "Ação necessária", "Ação corretiva", "Tratativa"),
    due: pick(source, "Prazo", "Data limite", "Vencimento"),
    priority: pick(source, "Prioridade", "Criticidade"),
    status: pick(source, "Status", "Situação"),
    origin: pick(source, "Origem", "Tipo"),
    completedAt: pick(source, "Data de conclusão", "Conclusão"),
    owner: pick(source, "Responsável", "Responsavel"),
    evidence: pick(source, "Evidência", "Evidencia", "Foto/Evidência"),
    notes: pick(source, "Observações"),
  };
  return mapped;
}

function isMeaningful(record) {
  return Object.values(record).some((value) => value !== null && value !== undefined && value !== "" && value !== false && value !== 0);
}

function dateMonth(value) {
  if (!value) return "";
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.valueOf()) ? "" : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${String(br[2]).padStart(2, "0")}`;
  return "";
}

// A aba "Indicativo Diário" nao segue o formato das outras: tem titulo na primeira
// linha, uma linha de identificacao (Empresa / Responsavel / Data) e so entao o
// cabecalho real. A coluna "Período" vem mesclada, entao as linhas seguintes
// chegam vazias e herdam o periodo anterior.
// Recebe as linhas cruas, em array, e nao objetos por cabecalho.
const DAILY_DONE = /^(ok|feito|concluid|realizad|sim|pronto)/;

export function mapDailyIndicator(rows = []) {
  // A planilha usa espacos para alinhar dentro da celula; colapsamos para exibir.
  const table = (rows || []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim()) : []));
  const headerIndex = table.findIndex((row) => row.some((cell) => normalize(cell) === "atividade"));
  if (headerIndex < 0) return { owner: "", date: "", items: [] };
  const headers = table[headerIndex].map(normalize);
  const at = (...names) => {
    for (const name of names) { const index = headers.indexOf(normalize(name)); if (index >= 0) return index; }
    return -1;
  };
  const columns = { period: at("Período"), time: at("Horário"), activity: at("Atividade"), sector: at("Setor"), detail: at("Detalhamento"), status: at("Status"), notes: at("Observações") };

  // "____/____/______" e campo em branco, nao uma data.
  const semPlaceholder = (value) => {
    const texto = String(value || "").replace(/_+/g, "").trim();
    return /^[/\-.\s]*$/.test(texto) ? "" : texto;
  };
  const valorDoRotulo = (row, index) => {
    const cell = row[index] || "";
    const inline = cell.includes(":") ? cell.slice(cell.indexOf(":") + 1).trim() : "";
    if (inline) return semPlaceholder(inline);
    for (let i = index + 1; i < row.length; i++) {
      const vizinho = String(row[i] || "").trim();
      if (!vizinho) continue;
      if (vizinho.endsWith(":")) break; // e o proximo rotulo, nao o valor deste
      return semPlaceholder(vizinho);
    }
    return "";
  };

  let owner = "", date = "";
  for (const row of table.slice(0, headerIndex)) {
    row.forEach((cell, index) => {
      const key = normalize(cell);
      if (!owner && key.startsWith("responsavel")) owner = valorDoRotulo(row, index);
      if (!date && key.startsWith("data")) date = valorDoRotulo(row, index);
    });
  }

  let period = "";
  const items = [];
  for (const row of table.slice(headerIndex + 1)) {
    if (columns.period >= 0 && row[columns.period]) period = row[columns.period];
    const value = (key) => (columns[key] >= 0 ? row[columns[key]] || "" : "");
    const activity = value("activity");
    if (!activity) continue;
    const status = value("status");
    items.push({ period, time: value("time"), activity, sector: value("sector"), detail: value("detail"), status, done: DAILY_DONE.test(normalize(status)), notes: value("notes") });
  }
  return { owner, date, items };
}

// Aba "Resumo Mensal": titulo na primeira linha, depois o cabecalho
// Indicador | Quantidade | Observações e as linhas de indicadores.
// Tambem chega em linhas cruas, em array.
export function mapMonthlySummary(rows = []) {
  const table = (rows || []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim()) : []));
  const headerIndex = table.findIndex((row) => row.some((cell) => normalize(cell) === "indicador"));
  if (headerIndex < 0) return { items: [] };
  const headers = table[headerIndex].map(normalize);
  const at = (...names) => {
    for (const name of names) { const index = headers.indexOf(normalize(name)); if (index >= 0) return index; }
    return -1;
  };
  const columns = { indicator: at("Indicador"), amount: at("Quantidade"), notes: at("Observações") };
  const items = [];
  for (const row of table.slice(headerIndex + 1)) {
    const value = (key) => (columns[key] >= 0 ? row[columns[key]] || "" : "");
    const indicator = value("indicator");
    if (!indicator) continue;
    const amount = value("amount");
    items.push({ indicator, amount, filled: String(amount).trim() !== "", notes: value("notes") });
  }
  return { items };
}

export function transformWorkbook(raw, { detail = "public" } = {}) {
  const inspections = (raw.inspections || []).map((row) => mapInspection(row, detail)).filter(isMeaningful);
  const dds = (raw.dds || []).map((row) => mapDds(row, detail)).filter(isMeaningful);
  const absences = (raw.absences || []).map(mapAbsence).filter(isMeaningful);
  const pending = (raw.pending || []).map((row) => mapPending(row, detail)).filter(isMeaningful);
  const months = [...new Set([
    ...inspections.map((item) => dateMonth(item.date)),
    ...dds.map((item) => dateMonth(item.date)),
    ...absences.map((item) => dateMonth(item.interviewDate || item.absenceDate)),
    ...pending.map((item) => dateMonth(item.date)),
  ].filter(Boolean))].sort();
  return { inspections, dds, absences, pending, months, daily: mapDailyIndicator(raw.daily), summary: mapMonthlySummary(raw.summary) };
}

export function containsSensitiveAbsenceFields(payload) {
  const forbidden = new Set(['colaborador', 'cid', 'cid se houver', 'motivo informado', 'descricao do ocorrido']);
  function scan(value) {
    return !!value && typeof value === 'object' && Object.entries(value).some(([key, child]) => forbidden.has(normalize(key)) || scan(child));
  }
  return scan(payload);
}
