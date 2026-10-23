import './theme.js';
import { fetchJson, escapeHtml as e, formatDate, toDateKey } from './shared.js';
import { buildReport } from './report-model.js';
import { saveReportToHistory, listSavedReports, deleteSavedReport, getSavedReport, listLocalPhotos } from './storage.js';

const $ = id => document.getElementById(id), demo = new URLSearchParams(location.search).get('demo') === '1';
const state = { data: null, report: null, type: 'daily', etag: '', timer: null, loading: false, aiBusy: false, photos: [], photoRequest: 0 };
const MAX_PHOTOS = 12, MAX_SIDE = 1400;

// Fotos extras da prévia são reduzidas no navegador; as evidências oficiais vêm do Drive ou do armazenamento local.
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`${file.name} não é uma imagem válida.`));
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        resolve({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, source: 'local', name: file.name, caption: '', width: w, height: h, dataUrl: canvas.toDataURL('image/jpeg', 0.72) });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderPhotos() {
  const list = state.photos;
  const driveCount = list.filter(p => p.source === 'drive').length;
  const localEvidenceCount = list.filter(p => p.source === 'local-evidence').length;
  $('report-photo-count').textContent = list.length
    ? `${list.length} de ${MAX_PHOTOS} foto(s): ${driveCount ? `${driveCount} do Drive, ` : ''}${localEvidenceCount ? `${localEvidenceCount} das frentes, ` : ''}${list.length - driveCount - localEvidenceCount} anexada(s) nesta emissão.`
    : 'Nenhuma foto encontrada neste período. O relatório e o PDF são gerados normalmente sem elas.';
  $('report-photo-list').innerHTML = list.map((p, i) => {
    const badge = p.source === 'drive' ? 'Google Drive' : p.source === 'local-evidence' ? 'Frente salva' : 'Anexo';
    return `<figure class="photo-item"><img src="${p.dataUrl || e(p.contentUrl)}" alt="Foto ${i + 1}: ${e(p.name || '')}"><label class="photo-caption">Legenda<input type="text" maxlength="160" data-photo-caption="${p.id}" value="${e(p.caption || '')}" placeholder="Onde foi, o que mostra"></label><div class="photo-item-footer"><span class="count-badge">${badge}</span><button class="button ghost" type="button" data-photo-remove="${p.id}">Remover</button></div></figure>`;
  }).join('');
  $('report-photo-preview').innerHTML = list.length ? list.map((p, i) => `<figure><img src="${p.dataUrl || e(p.contentUrl)}" alt="Foto ${i + 1}"><figcaption>Foto ${i + 1}${p.caption ? ` — ${e(p.caption)}` : ''}</figcaption></figure>`).join('') : '<p class="report-empty">Nenhuma foto anexada a este relatório.</p>';
  if (state.report) state.report.photos = list;
}

async function syncDrivePhotos() {
  if (!state.report) return;
  const request = ++state.photoRequest, start = state.report.filters.start, end = state.report.filters.end;
  const locals = state.photos.filter(p => p.source === 'local');
  // Fotos gravadas localmente pelas frentes no mesmo período
  const localEvidence = listLocalPhotos().filter(p => {
    const d = toDateKey(p.date || p.reportDate);
    return !d || (d >= start && d <= end);
  }).map(p => ({
    id: p.id || `loc-${Math.random().toString(36).slice(2, 7)}`,
    source: 'local-evidence',
    name: p.name || 'Evidência de campo',
    caption: p.caption || '',
    dataUrl: p.dataUrl,
    frontLabel: p.frontLabel || '',
    sector: p.sector || '',
    date: p.date || p.reportDate || ''
  }));

  try {
    let drive = [];
    if (!demo) {
      try {
        const result = await fetchJson(`/api/fotos?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=${MAX_PHOTOS}`, { timeout: 15000 });
        drive = (result.photos || []).map(p => ({ ...p, source: 'drive' }));
      } catch {}
    }
    if (request !== state.photoRequest) return;
    const combined = [...drive, ...localEvidence].sort((a, b) => String(a.frontLabel).localeCompare(String(b.frontLabel), 'pt-BR') || String(a.date).localeCompare(String(b.date)));
    state.photos = [...combined, ...locals].slice(0, MAX_PHOTOS);
    renderPhotos();
  } catch (error) {
    if (request === state.photoRequest) status(`Prévia pronta com fotos disponíveis.`);
  }
}

async function hydrateDrivePhotos(photos) {
  return Promise.all(photos.map(async photo => {
    if (photo.dataUrl || !photo.contentUrl) return photo;
    try {
      const response = await fetch(photo.contentUrl, { cache: 'no-store' });
      if (!response.ok) return photo;
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
      return { ...photo, dataUrl };
    } catch {
      return photo;
    }
  }));
}

async function addPhotos(files) {
  const livres = MAX_PHOTOS - state.photos.length;
  if (livres <= 0) { status(`Limite de ${MAX_PHOTOS} fotos por relatório. Remova alguma para anexar outra.`); return; }
  const selecionadas = [...files].slice(0, livres);
  const ignoradas = files.length - selecionadas.length;
  for (const file of selecionadas) {
    try { state.photos.push(await readPhoto(file)); }
    catch (error) { status(error.message); }
  }
  renderPhotos();
  status(`${state.photos.length} foto(s) no relatório${ignoradas ? `; ${ignoradas} ignorada(s) pelo limite de ${MAX_PHOTOS}` : ''}.`);
}

const today = toDateKey(new Date());
if ($('report-day')) $('report-day').value = today;
if ($('report-week')) $('report-week').value = today;
if ($('report-month')) $('report-month').value = today.slice(0, 7);
if (demo) document.querySelectorAll('a[href="/"]').forEach(a => a.href = '/?demo=1');

function status(text) { $('report-status').textContent = text; }

function options() {
  const dateValue = state.type === 'daily'
    ? $('report-day')?.value || today
    : state.type === 'weekly'
      ? $('report-week')?.value || today
      : $('report-month')?.value || today.slice(0, 7);
  return {
    type: state.type,
    date: dateValue,
    owner: $('report-owner').value,
    filters: {
      sector: $('report-sector').value,
      status: $('report-filter-status').value,
      priority: $('report-priority').value,
      search: $('report-search').value
    },
    photos: state.photos,
    demo
  };
}

function createPreview(clearNotes = true) {
  if (!state.data) return;
  const opt = options();
  if (!opt.date) { status('Selecione uma data válida para o relatório.'); return; }
  if (clearNotes) $('report-notes').value = '';
  state.report = buildReport(state.data, { ...opt, notes: $('report-notes').value });
  const r = state.report, m = r.metrics;
  $('report-title').textContent = r.title;
  $('report-period').textContent = r.period;
  $('report-meta-owner').textContent = r.owner;
  $('report-signature-owner').textContent = r.owner;
  $('report-date').textContent = formatDate(new Date());
  $('report-areas').textContent = r.filterLabel;
  $('report-draft-banner').textContent = demo ? 'DEMONSTRAÇÃO · Dados fictícios. Não utilizar como relatório real.' : 'PRÉVIA · Revisão e aprovação técnica necessárias antes da emissão';
  $('report-metrics').innerHTML = [[m.inspections, 'Inspeções'], [m.dds, 'DDS'], [m.absenceDays, 'Dias de ausência'], [m.resolved, 'Pendências resolvidas']].map(([v, label]) => `<div><strong>${v}</strong><span>${label}</span></div>`).join('');
  $('report-findings-empty').hidden = !!r.data.inspections.length;
  $('report-findings-body').innerHTML = r.data.inspections.map(i => `<tr><td>${e(i.sector || 'Não informado')}<br>${formatDate(i.date)}</td><td>${e(i.condition || i.item || 'Não informada')}</td><td>${e(i.risk || 'Não informado')}</td><td>${e(i.action || 'Não informada')}</td><td>${e(i.priority || 'Não informada')}</td></tr>`).join('');
  $('report-pending-body').innerHTML = r.data.pending.length ? r.data.pending.map(i => `<tr><td>${e(i.sector)}<br>${e(i.description)}</td><td>${e(i.action || 'Não informada')}</td><td>${e(i.owner || 'Não informado')}</td><td>${formatDate(i.due)}<br>${e(i.status || 'Não informado')}</td></tr>`).join('') : '<tr><td colspan="4">Nenhuma pendência registrada no recorte.</td></tr>';
  $('report-conclusion').textContent = r.notes || 'Sem observações adicionais.';
  const typeLabel = r.type === 'daily' ? 'Diário' : r.type === 'monthly' ? 'Mensal' : 'Semanal';
  status(`Prévia do Relatório ${typeLabel} (${r.period}) · ${r.data.inspections.length} inspeções e ${r.data.pending.length} pendências.`);
}

function renderSavedReports() {
  const container = $('saved-reports-list');
  const countBadge = $('saved-reports-count');
  if (!container) return;
  const saved = listSavedReports();
  if (countBadge) countBadge.textContent = `${saved.length} salvo${saved.length === 1 ? '' : 's'}`;
  if (!saved.length) {
    container.innerHTML = '<div class="saved-reports-empty"><strong>Nenhum relatório salvo no histórico ainda.</strong><span>Gere um relatório diário, semanal ou mensal e clique em <b>Salvar no histórico</b> ou <b>Salvar em PDF</b> para deixá-lo arquivado com todas as fotos para consulta posterior.</span></div>';
    return;
  }
  container.innerHTML = saved.map(item => {
    const badgeClass = item.type === 'daily' ? 'daily-tag' : item.type === 'monthly' ? 'monthly-tag' : 'weekly-tag';
    const typeLabel = item.type === 'daily' ? 'Diário' : item.type === 'monthly' ? 'Mensal' : 'Semanal';
    const photosCount = Array.isArray(item.photos) ? item.photos.length : 0;
    const thumbsHtml = photosCount ? `<div class="saved-report-thumbs">${item.photos.slice(0, 4).map(p => `<img src="${p.dataUrl || p.contentUrl}" alt="Foto" loading="lazy">`).join('')}${photosCount > 4 ? `<span>+${photosCount - 4}</span>` : ''}</div>` : '';
    const dateFormatted = item.savedAt ? new Date(item.savedAt).toLocaleString('pt-BR') : '-';

    return `<div class="saved-report-card">
      <div class="saved-report-card-top">
        <span class="report-badge ${badgeClass}">${typeLabel}</span>
        <strong>${e(item.period || item.title)}</strong>
        <small>Salvo em ${dateFormatted}</small>
      </div>
      <div class="saved-report-meta">
        <span><b>Responsável:</b> ${e(item.owner || 'Não informado')}</span>
        <span><b>Indicadores:</b> ${item.findingsCount || 0} inspeção(ões) · ${item.pendingCount || 0} pendência(s) · ${photosCount} foto(s)</span>
      </div>
      ${thumbsHtml}
      <div class="saved-report-actions">
        <button class="button secondary small-btn" type="button" data-saved-open="${e(item.id)}">Visualizar</button>
        <button class="button primary small-btn" type="button" data-saved-pdf="${e(item.id)}">Baixar PDF</button>
        <button class="button ghost small-btn danger-text" type="button" data-saved-delete="${e(item.id)}" title="Remover este relatório">Excluir</button>
      </div>
    </div>`;
  }).join('');
}

async function load() {
  if (state.loading) return; state.loading = true;
  try {
    const data = await fetchJson(demo ? '/data/demo-data.json' : '/api/dados?detail=report');
    const changed = state.data && state.data.revision !== data.revision;
    const selection = $('report-sector').value;
    state.data = data;
    const listados = (data.sectors || []).filter(Boolean);
    const sectors = listados.length ? listados : [...new Set(['inspections', 'pending', 'dds', 'absences'].flatMap(k => data[k].map(r => r.sector)).filter(Boolean))].sort();
    $('report-sector').innerHTML = '<option value="">Todos os setores</option>' + sectors.map(s => `<option value="${e(s)}">${e(s)}</option>`).join('');
    $('report-sector').value = selection;
    if (!state.report) {
      createPreview();
      await syncDrivePhotos();
    } else if (changed) {
      status('Há dados novos na planilha. Clique em Gerar prévia para atualizá-la.');
    }
  } catch (error) {
    status(`Falha na sincronização: ${error.message}. A prévia existente foi preservada.`);
  } finally {
    state.loading = false;
    schedule();
  }
}

function schedule() {
  clearTimeout(state.timer);
  if (!demo && !document.hidden) state.timer = setTimeout(load, 15000);
}

async function initialize() {
  try {
    const auth = demo ? { authenticated: true, protected: false } : await fetchJson('/api/relatorios-acesso');
    $('access-gate').hidden = auth.authenticated;
    $('reports-workspace').hidden = !auth.authenticated;
    $('logout-button').hidden = !auth.protected;
    if (auth.authenticated) {
      await load();
      renderSavedReports();
    }
  } catch (error) {
    $('access-gate').hidden = false;
    $('access-error').textContent = error.message;
  }
}

async function analyse() {
  if (!state.report || state.aiBusy) return;
  if (demo) { status('A demonstração não consome IA. Edite as observações e baixe um PDF de exemplo.'); return; }
  state.aiBusy = true; $('ai-report-button').disabled = true;
  const captured = state.report, originalNotes = $('report-notes').value; status('Gerando rascunho com IA, sem enviar nomes ou informações médicas...');
  try {
    const result = await fetchJson('/api/ia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'report', question: 'Redija as observações finais do relatório a partir destes indicadores. Indique limitações dos dados e próximos passos de acompanhamento.', filters: captured.filters }), timeout: 30000 });
    if (captured !== state.report || originalNotes !== $('report-notes').value || captured.revision !== result.revision) { status('O recorte, os dados ou o texto mudaram durante a análise. A resposta não substituiu suas alterações. Gere uma nova prévia.'); return; }
    $('report-notes').value = result.answer; captured.notes = result.answer; $('report-conclusion').textContent = result.answer;
    status(`Rascunho gerado (${result.usage?.total_tokens || '—'} tokens). Revise o texto antes de baixar. ${result.budget?.remainingCalls ?? ''} chamadas no limite diário.`);
  } catch (error) { status(`${error.message}${error.retryAfter ? ` Aguarde ${error.retryAfter} s.` : ''}`); }
  finally { state.aiBusy = false; $('ai-report-button').disabled = false; }
}

$('access-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await fetchJson('/api/relatorios-acesso', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('access-code').value }) });
    $('access-code').value = '';
    await initialize();
  } catch (error) { $('access-error').textContent = error.message; }
});

$('logout-button').addEventListener('click', async () => {
  try { await fetchJson('/api/relatorios-acesso', { method: 'DELETE' }); location.reload(); }
  catch (error) { status(error.message); }
});

document.querySelectorAll('[data-report-type]').forEach(b => b.addEventListener('click', async () => {
  state.type = b.dataset.reportType;
  document.querySelectorAll('[data-report-type]').forEach(x => x.classList.toggle('active', x === b));
  $('day-control').hidden = state.type !== 'daily';
  $('week-control').hidden = state.type !== 'weekly';
  $('month-control').hidden = state.type !== 'monthly';
  createPreview();
  await syncDrivePhotos();
}));

for (const id of ['report-day', 'report-week', 'report-month']) {
  const el = $(id);
  if (el) el.addEventListener('change', async () => { createPreview(); await syncDrivePhotos(); });
}

for (const id of ['report-sector', 'report-filter-status', 'report-priority', 'report-search']) {
  $(id).addEventListener('change', () => createPreview());
}

$('report-owner').addEventListener('input', () => {
  if (state.report) {
    state.report.owner = $('report-owner').value;
    $('report-meta-owner').textContent = state.report.owner;
    $('report-signature-owner').textContent = state.report.owner;
  }
});

$('report-notes').addEventListener('input', () => {
  if (state.report) {
    state.report.notes = $('report-notes').value;
    $('report-conclusion').textContent = state.report.notes || 'Sem observações adicionais.';
  }
});

$('generate-button').addEventListener('click', () => createPreview());
$('ai-report-button').addEventListener('click', analyse);

$('save-history-button').addEventListener('click', async () => {
  if (!state.report) { status('Gere uma prévia antes de salvar no histórico.'); return; }
  $('save-history-button').disabled = true;
  try {
    status('Salvando relatório e anexando fotos para acesso posterior…');
    state.report.photos = await hydrateDrivePhotos(state.photos);
    state.report.notes = $('report-notes').value;
    saveReportToHistory(state.report);
    renderSavedReports();
    status(`✓ Relatório ${state.report.type === 'daily' ? 'Diário' : state.report.type === 'monthly' ? 'Mensal' : 'Semanal'} salvo no histórico com ${state.photos.length} foto(s)!`);
  } catch (err) {
    status(`Não foi possível salvar no histórico: ${err.message}`);
  } finally {
    $('save-history-button').disabled = false;
  }
});

$('report-photos').addEventListener('change', async event => {
  const input = event.target; input.disabled = true;
  try { await addPhotos(input.files || []); }
  finally { input.value = ''; input.disabled = false; }
});

$('report-photo-list').addEventListener('click', event => {
  const id = event.target.dataset?.photoRemove;
  if (!id) return;
  state.photos = state.photos.filter(p => p.id !== id);
  renderPhotos();
  status(`Foto removida. ${state.photos.length} foto(s) no relatório.`);
});

$('report-photo-list').addEventListener('input', event => {
  const id = event.target.dataset?.photoCaption;
  if (!id) return;
  const photo = state.photos.find(p => p.id === id);
  if (!photo) return;
  photo.caption = event.target.value;
  const idx = state.photos.indexOf(photo);
  const captions = $('report-photo-preview').querySelectorAll('figcaption');
  if (captions[idx]) captions[idx].textContent = `Foto ${idx + 1}${photo.caption ? ` — ${photo.caption}` : ''}`;
});

$('print-button').addEventListener('click', async () => {
  if (!state.report) { status('Aguarde a leitura dos dados antes de gerar o PDF.'); return; }
  if (state.aiBusy) { status('Aguarde a conclusão da análise antes de baixar.'); return; }
  $('print-button').disabled = true;
  try {
    status('Preparando fotos e montando o PDF…');
    state.report.photos = await hydrateDrivePhotos(state.photos);
    state.report.notes = $('report-notes').value;
    // Salva automaticamente no histórico para acesso posterior
    saveReportToHistory(state.report);
    renderSavedReports();

    const { downloadReport } = await import('./pdf.bundle.js');
    downloadReport(state.report);
    status(`PDF gerado e salvo no histórico com todos os registros e ${state.photos.length} foto(s).`);
  } catch (err) {
    status('Não foi possível baixar o PDF. Recarregue a página e tente novamente.');
  } finally {
    $('print-button').disabled = false;
  }
});

// Delegação de eventos no histórico de relatórios salvos
$('saved-reports-list').addEventListener('click', async event => {
  const openId = event.target.dataset?.savedOpen;
  const pdfId = event.target.dataset?.savedPdf;
  const deleteId = event.target.dataset?.savedDelete;

  if (openId) {
    const item = getSavedReport(openId);
    if (!item) return;
    const r = item.reportSnapshot || item;
    state.report = r;
    state.photos = item.photos || [];
    $('report-notes').value = r.notes || '';
    $('report-title').textContent = r.title;
    $('report-period').textContent = r.period;
    $('report-meta-owner').textContent = r.owner;
    $('report-signature-owner').textContent = r.owner;
    $('report-date').textContent = formatDate(r.emittedAt || new Date());
    $('report-areas').textContent = r.filterLabel || 'Todos os setores';
    const m = r.metrics || {};
    $('report-metrics').innerHTML = [[m.inspections || 0, 'Inspeções'], [m.dds || 0, 'DDS'], [m.absenceDays || 0, 'Dias de ausência'], [m.resolved || 0, 'Pendências resolvidas']].map(([v, label]) => `<div><strong>${v}</strong><span>${label}</span></div>`).join('');
    if (r.data?.inspections) {
      $('report-findings-empty').hidden = !!r.data.inspections.length;
      $('report-findings-body').innerHTML = r.data.inspections.map(i => `<tr><td>${e(i.sector || 'Não informado')}<br>${formatDate(i.date)}</td><td>${e(i.condition || i.item || 'Não informada')}</td><td>${e(i.risk || 'Não informado')}</td><td>${e(i.action || 'Não informada')}</td><td>${e(i.priority || 'Não informada')}</td></tr>`).join('');
    }
    if (r.data?.pending) {
      $('report-pending-body').innerHTML = r.data.pending.length ? r.data.pending.map(i => `<tr><td>${e(i.sector)}<br>${e(i.description)}</td><td>${e(i.action || 'Não informada')}</td><td>${e(i.owner || 'Não informado')}</td><td>${formatDate(i.due)}<br>${e(i.status || 'Não informado')}</td></tr>`).join('') : '<tr><td colspan="4">Nenhuma pendência registrada no recorte.</td></tr>';
    }
    $('report-conclusion').textContent = r.notes || 'Sem observações adicionais.';
    renderPhotos();
    status(`Relatório carregado do histórico (${r.title} - ${r.period}).`);
    $('report-paper').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  if (pdfId) {
    const item = getSavedReport(pdfId);
    if (!item) return;
    const r = item.reportSnapshot || item;
    try {
      status('Gerando PDF do relatório arquivado…');
      const { downloadReport } = await import('./pdf.bundle.js');
      downloadReport(r);
      status(`PDF baixado com sucesso a partir do histórico.`);
    } catch {
      status('Erro ao gerar PDF do histórico.');
    }
    return;
  }

  if (deleteId) {
    if (confirm('Tem certeza que deseja remover este relatório do histórico?')) {
      deleteSavedReport(deleteId);
      renderSavedReports();
      status('Relatório removido do histórico.');
    }
    return;
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('reports-workspace').hidden) load();
  else clearTimeout(state.timer);
});

renderPhotos();
renderSavedReports();
initialize();
