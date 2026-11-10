/**
 * SAFE — script da planilha.
 * Recebe os lançamentos do dashboard, grava nas abas e guarda fotos e PDFs no Drive
 * de quem instalou. Instalação: veja apps-script/COMO-INSTALAR.md.
 */

const SAFE_SHEET_ID = '1BcHzuaOFOm2MMs11l-BNBzMmlnzdHdPrnhSnIPk7z30';
const SAFE_FOLDER_NAME = 'SAFE - Evidências e relatórios';
const SAFE_APP = 'dashboard-safe';

const SAFE_PAREAMENTO_DIAS = 7;

// Rode esta função uma vez pelo editor: autoriza o script e cria a pasta no Drive.
function configurar() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SAFE_CONFIGURADO_EM')) props.setProperty('SAFE_CONFIGURADO_EM', new Date().toISOString());
  pasta_();
  SpreadsheetApp.openById(SAFE_SHEET_ID).getName();
  Logger.log('Pronto. Não precisa copiar nada: o dashboard se conecta sozinho na primeira chamada.');
}

// Pareamento: o primeiro token do dashboard (64 caracteres hexadecimais) recebido até
// 7 dias depois da instalação passa a ser o único aceito. Ninguém copia senha à mão.
function tokenAceito_(recebido) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SAFE_PAREADO')) return props.getProperty('SAFE_TOKEN');
  if (!/^[a-f0-9]{64}$/.test(String(recebido || ''))) return props.getProperty('SAFE_TOKEN');
  let inicio = props.getProperty('SAFE_CONFIGURADO_EM');
  if (!inicio) {
    inicio = new Date().toISOString();
    props.setProperty('SAFE_CONFIGURADO_EM', inicio);
  }
  if (Date.now() - Date.parse(inicio) > SAFE_PAREAMENTO_DIAS * 86400000) return props.getProperty('SAFE_TOKEN');
  const trava = LockService.getScriptLock();
  trava.waitLock(10000);
  try {
    if (!props.getProperty('SAFE_PAREADO')) {
      props.setProperty('SAFE_TOKEN', recebido);
      props.setProperty('SAFE_PAREADO', new Date().toISOString());
    }
    return props.getProperty('SAFE_TOKEN');
  } finally {
    trava.releaseLock();
  }
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const token = tokenAceito_(req.token);
    if (!token || req.token !== token) return saida_({ ok: false, error: 'O script da planilha está pareado com outro dashboard. Para refazer, apague as propriedades SAFE_TOKEN e SAFE_PAREADO do script e rode configurar.' });
    const acao = ACOES_[req.action];
    if (!acao) return saida_({ ok: false, error: 'Ação desconhecida.' });
    return saida_(Object.assign({ ok: true }, acao(req)));
  } catch (err) {
    return saida_({ ok: false, error: String((err && err.message) || err) });
  }
}

const ACOES_ = {
  ping: function () {
    return { pareado: true };
  },

  // Primeiras linhas da aba: o servidor encontra o cabeçalho e monta a linha.
  rows: function (req) {
    const aba = aba_(req.sheetName);
    const linhas = Math.min(20, Math.max(1, aba.getLastRow()));
    return { values: aba.getRange(1, 1, linhas, Math.max(1, aba.getLastColumn())).getDisplayValues() };
  },

  appendRow: function (req) {
    const aba = aba_(req.sheetName);
    const row = (req.row || []).map(function (v) { return v === null || v === undefined ? '' : String(v); });
    if (!row.length) throw new Error('Linha vazia.');
    // A coluna A define a última linha: listas auxiliares em outras colunas não empurram o lançamento.
    const colunaA = aba.getRange(1, 1, Math.max(1, aba.getLastRow()), 1).getDisplayValues();
    let ultima = colunaA.length;
    while (ultima > 0 && !String(colunaA[ultima - 1][0]).trim()) ultima--;
    const destino = aba.getRange(ultima + 1, 1, 1, row.length);
    // Campo vazio não apaga o que já existe na linha (ex.: lista de setores ao lado do DDS).
    const atual = destino.getDisplayValues()[0];
    destino.setNumberFormat('@');
    destino.setValues([row.map(function (v, i) { return v === '' ? atual[i] : v; })]);
    return { row: ultima + 1 };
  },

  upload: function (req) {
    const blob = Utilities.newBlob(Utilities.base64Decode(req.base64), req.mimeType, req.name);
    const arquivo = pasta_().createFile(blob);
    arquivo.setDescription(JSON.stringify({ safe: req.appProperties || {}, details: req.details || {} }));
    return { file: arquivoParaJson_(arquivo) };
  },

  list: function (req) {
    const encontrados = [];
    const it = pasta_().getFiles();
    while (it.hasNext()) {
      const f = arquivoParaJson_(it.next());
      const p = f.appProperties;
      if (p.safeApp !== SAFE_APP) continue;
      if (req.kind && p.safeKind !== req.kind) continue;
      if (req.front && p.front !== req.front) continue;
      if (req.reportKey && p.reportKey !== req.reportKey) continue;
      encontrados.push(f);
    }
    encontrados.sort(function (a, b) { return a.createdTime < b.createdTime ? 1 : -1; });
    return { files: encontrados.slice(0, Math.min(1000, req.limit || 100)) };
  },

  get: function (req) {
    const arquivo = DriveApp.getFileById(String(req.id));
    const pastaId = pasta_().getId();
    let dentro = false;
    const pais = arquivo.getParents();
    while (pais.hasNext()) if (pais.next().getId() === pastaId) dentro = true;
    if (!dentro) throw new Error('Arquivo fora da pasta protegida.');
    return { file: arquivoParaJson_(arquivo), base64: Utilities.base64Encode(arquivo.getBlob().getBytes()) };
  },
};

function arquivoParaJson_(arquivo) {
  let meta = {};
  try { meta = JSON.parse(arquivo.getDescription() || '{}'); } catch (err) {}
  return {
    id: arquivo.getId(),
    name: arquivo.getName(),
    mimeType: arquivo.getMimeType(),
    size: String(arquivo.getSize()),
    createdTime: arquivo.getDateCreated().toISOString(),
    description: JSON.stringify(meta.details || {}),
    appProperties: meta.safe || {},
    webViewLink: arquivo.getUrl(),
  };
}

function aba_(nome) {
  const aba = SpreadsheetApp.openById(SAFE_SHEET_ID).getSheetByName(String(nome || ''));
  if (!aba) throw new Error('A aba ' + nome + ' não existe na planilha.');
  return aba;
}

function pasta_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SAFE_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) {}
  }
  const pasta = DriveApp.createFolder(SAFE_FOLDER_NAME);
  props.setProperty('SAFE_FOLDER_ID', pasta.getId());
  return pasta;
}

function saida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
