import { escapeHtml as e, monthLabel, recordMonth, calculateMetrics, fetchJson, formatDate, statusBucket, priorityBucket, isOverdue, normalizeText, COLORS } from './shared.js';
import { emptyFilters, validateFilters, filterData, flattenRecords, sortRecords, filterDescription, validateActions, STATUS_LABELS, PRIORITY_LABELS, TYPE_LABELS } from './filters.js';
import { setTheme } from './theme.js';
const $ = id => document.getElementById(id);
const demo = new URLSearchParams(location.search).get('demo') === '1';
const state = { data: null, filtered: {}, filters: emptyFilters(), source: 'all', sort: 'date-desc', page: 1, busy: false, paused: false, failures: 0, etag: '', timer: null, undo: null };
try { state.filters = validateFilters(JSON.parse(localStorage.getItem('safe-filters') || '{}')); } catch {}
if (demo) document.querySelectorAll('a[href="/relatorios"]').forEach(a => a.href = '/relatorios?demo=1');
function persist() { try { localStorage.setItem('safe-filters', JSON.stringify(state.filters)); } catch {} }
function options(id, values, all) { const select = $(id); select.innerHTML = `<option value="">${all}</option>` + values.map(x => `<option value="${e(x)}">${e(x)}</option>`).join(''); }
function syncControls() {
  for (const key of Object.keys(emptyFilters()).filter(k => k !== 'months')) { const input = $(`filter-${key}`); if (input) input.type === 'checkbox' ? input.checked = state.filters[key] : input.value = state.filters[key]; }
  $('record-sort').value = state.sort;
  document.querySelectorAll('[data-source]').forEach(b => { b.classList.toggle('active', b.dataset.source === state.source); b.setAttribute('aria-pressed', String(b.dataset.source === state.source)); });
  const selected = state.filters.months;
  $('month-summary').textContent = !selected.length ? 'Todos os meses' : selected.length === 1 ? (selected[0] === 'undated' ? 'Sem data' : monthLabel(selected[0], true)) : `${selected.length} meses selecionados`;
  $('month-options').querySelectorAll('input').forEach(input => { input.checked = selected.includes(input.value); });
}
function populateOptions() {
  const records = flattenRecords(state.data);
  const unique = values => [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
  const listed = (state.data.sectors || []).filter(Boolean);
  const sectors = listed.length ? [...new Set([...listed, state.filters.sector].filter(Boolean))] : unique([...records.map(r => r.sector), state.filters.sector]);
  options('filter-sector', sectors, 'Todos os setores');
  options('filter-shift', unique([...state.data.dds.map(r => r.shift), state.filters.shift]), 'Todos os turnos');
  const months = [...new Set([...(state.data.months || []), ...state.filters.months])].filter(m => m !== 'undated').sort().reverse();
  if (records.some(r => !r.recordDate) || state.filters.months.includes('undated')) months.push('undated');
  $('month-options').innerHTML = `<div class="month-actions"><button type="button" class="text-button" data-months="all">Todos</button><button type="button" class="text-button" data-months="latest">Mais recente</button></div>` + (months.length ? months.map(m => `<label><input type="checkbox" value="${e(m)}">${m === 'undated' ? 'Sem data' : e(monthLabel(m))}</label>`).join('') : '<p class="filter-note">Os meses aparecerão após o preenchimento das datas.</p>');
  syncControls();
}
function applyFilters() { state.page = 1; state.filters = validateFilters(state.filters); syncControls(); persist(); render(); }
function render() {
  if (!state.data) return;
  state.filtered = filterData(state.data, state.filters);
  const m = calculateMetrics(state.filtered);
  for (const key of ['critical','overdue','progress','resolved']) $(`rail-${key}`).textContent = m[key];
  $('metric-inspections').textContent = m.inspections;
  $('metric-resolution').textContent = m.resolutionRate === null ? '—' : `${m.resolutionRate}%`;
  $('metric-resolution-note').textContent = `${m.resolved} de ${m.actions} pendências ativas ou resolvidas`;
  $('metric-dds').textContent = m.dds;
  const unknownParticipants = state.filtered.dds.filter(r => r.participants === null).length;
  $('metric-dds-note').textContent = `${m.participants} participações informadas${unknownParticipants ? ` · ${unknownParticipants} registro(s) sem quantidade` : ''}`;
  $('metric-absence').textContent = m.absenceDays;
  $('metric-absence-note').textContent = `${m.interviews} entrevistas · data da entrevista`;
  $('active-filters').textContent = filterDescription(state.filters);
  renderTrend(); renderStatus(); renderSectors(); renderTable();
}
function renderTrend() {
  const colors = [COLORS.blue, COLORS.cyan, COLORS.yellow];
  const types = ['inspections','dds','pending'];
  const months = [...new Set(types.flatMap(type => state.filtered[type].map(r => recordMonth(r,type))).filter(Boolean))].sort();
  $('trend-legend').innerHTML = types.map((t,i) => `<span><i style="background:${colors[i]}"></i>${TYPE_LABELS[t]}</span>`).join('');
  if (!months.length) { $('trend-chart').innerHTML = '<div class="chart-empty">Nenhuma atividade datada neste recorte.</div>'; return; }
  const values = months.map(m => types.map(t => state.filtered[t].filter(r => recordMonth(r,t) === m).length));
  const max = Math.max(1,...values.flat());
  const width = Math.max(600, months.length * 105), height = 250, group = (width - 70) / months.length;
  let svg = `<svg viewBox="0 0 ${width} ${height}" style="min-width:${width}px" aria-label="Atividades por mês; selecione uma barra para filtrar" role="group">`;
  for (let i = 0; i < 4; i++) { const y=205-i*60; svg += `<line x1="35" x2="${width-10}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="25" y="${y+4}" text-anchor="end">${Math.ceil(max*i/3)}</text>`; }
  months.forEach((m,i) => { const x=45+i*group; const bw=Math.min(20,(group-20)/3); values[i].forEach((v,j) => { const h=v/max*180; svg+=`<g role="button" tabindex="0" data-month="${m}" aria-label="${e(monthLabel(m))}: ${TYPE_LABELS[types[j]]}, ${v}"><rect x="${x+j*(bw+3)}" y="${205-h}" width="${bw}" height="${Math.max(h,2)}" rx="3" fill="${colors[j]}"><title>${e(monthLabel(m))} · ${TYPE_LABELS[types[j]]}: ${v}. Clique para filtrar.</title></rect></g>`; }); svg+=`<text x="${x+28}" y="235" text-anchor="middle">${e(monthLabel(m,true))}</text>`; });
  $('trend-chart').innerHTML = svg + '</svg>';
}
function renderStatus() {
  const counts = Object.keys(STATUS_LABELS).map(key => ({ key, count: state.filtered.pending.filter(r => statusBucket(r.status) === key).length }));
  const colors = [COLORS.yellow,COLORS.blue,COLORS.cyan,COLORS.gray], total = state.filtered.pending.length;
  let angle=0;
  const gradient = counts.map((x,i) => { const start=angle; angle+=total ? x.count/total*100 : 0; return `${colors[i]} ${start}% ${angle}%`; }).join(',');
  $('status-donut').style.background = total ? `conic-gradient(${gradient})` : 'var(--line)';
  $('status-donut').innerHTML = `<span><strong>${total}</strong><small>pendências</small></span>`;
  $('status-key').innerHTML = counts.map((x,i) => `<button type="button" data-status="${x.key}" class="legend-button"><i style="background:${colors[i]}"></i>${STATUS_LABELS[x.key]}<b>${x.count}</b></button>`).join('');
}
function renderSectors() {
  const groups = {};
  for (const r of state.filtered.inspections) groups[r.sector || 'Sem setor'] = (groups[r.sector || 'Sem setor'] || 0) + 1;
  const entries = Object.entries(groups).sort((a,b) => b[1]-a[1]), max = Math.max(1,...Object.values(groups));
  $('sector-chart').innerHTML = entries.length ? entries.map(([sector,count]) => `<button class="sector-row" type="button" data-sector="${e(sector)}" title="Filtrar ${e(sector)}"><span>${e(sector)}</span><span class="bar-track"><i style="width:${count/max*100}%"></i></span><strong>${count}</strong></button>`).join('') : '<div class="chart-empty">Sem inspeções neste recorte.</div>';
}
function renderTable() {
  const rows = sortRecords(flattenRecords(state.filtered).filter(r => state.source === 'all' || state.source === r.type), state.sort);
  const pages = Math.max(1, Math.ceil(rows.length/12)); state.page = Math.min(state.page,pages);
  $('actions-count').textContent = `${rows.length} registros`;
  $('actions-empty').hidden = !!rows.length;
  $('page-info').textContent = `Página ${state.page} de ${pages} · ${rows.length} registros`;
  $('prev-page').disabled = state.page <= 1; $('next-page').disabled = state.page >= pages;
  $('actions-table').innerHTML = rows.slice((state.page-1)*12,state.page*12).map(r => {
    const action = ['pending','inspections'].includes(r.type), status = statusBucket(r.status), priority = priorityBucket(r.priority);
    const description = r.condition || r.description || r.topic || (r.type === 'absences' ? `${r.days} dia(s) de ausência · ${r.notified ? 'comunicada' : 'não comunicada'}` : 'Descrição não informada');
    return `<tr><td>${formatDate(r.recordDate)}<small class="cell-note">${TYPE_LABELS[r.type]}</small></td><td>${e(r.sector || 'Não informado')}</td><td class="description-cell"><strong>${e(r.item || '')}</strong>${e(description)}${r.action ? `<small class="cell-note">Ação: ${e(r.action)}</small>` : ''}${r.type === 'dds' ? `<small class="cell-note">${r.participants ?? 'Quantidade não informada'}${r.participants === null ? '' : ' participações'} · ${e(r.shift || 'Turno não informado')}</small>` : ''}</td><td>${action ? formatDate(r.due) : '—'}${isOverdue(r) ? '<small class="overdue-label">Vencido</small>' : ''}</td><td>${action ? `<span class="status-chip ${priority}">${PRIORITY_LABELS[priority]}</span>` : '—'}</td><td>${action ? `<span class="status-chip ${status}">${r.status ? e(r.status) : 'Não informado'}</span>` : r.type === 'dds' ? (r.registered ? 'Registrado' : 'Não registrado') : 'Sem dados pessoais'}</td></tr>`;
  }).join('');
}
function live(text, kind='') { $('live-state').className = `live-state ${kind}`; $('live-state').innerHTML = `<span></span>${e(text)}`; }
function schedule() { clearTimeout(state.timer); if (!demo && !state.paused && !document.hidden) state.timer = setTimeout(load, Math.min(120000,15000 * 2 ** state.failures)); }
async function load() {
  if (state.busy) return; state.busy=true; $('refresh-button').disabled=true;
  try {
    const response = await fetch(demo ? '/data/demo-data.json' : '/api/dados', { headers: state.etag ? { 'If-None-Match': state.etag } : {}, cache:'no-cache', signal:AbortSignal.timeout(14000) });
    if (response.status !== 304) {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível sincronizar.');
      state.data = data; state.etag = response.headers.get('etag') || ''; populateOptions(); render();
    }
    state.failures=0;
    $('data-status').textContent = demo ? 'DEMONSTRAÇÃO · dados fictícios, não são os registros da sua planilha.' : state.data.message;
    $('last-update').textContent = `Verificado às ${new Date().toLocaleTimeString('pt-BR')}`;
    live(demo ? 'Demonstração' : state.paused ? 'Pausado' : 'Sincronização ativa', demo ? '' : 'ready');
  } catch (error) {
    state.failures=Math.min(state.failures+1,3); live('Sem sincronização','error');
    $('data-status').textContent = `${state.data ? 'Exibindo a última leitura, que pode estar desatualizada. ' : ''}${error.name === 'TimeoutError' ? 'A conexão demorou. Nova tentativa automática.' : error.message}`;
  } finally { state.busy=false; $('refresh-button').disabled=false; schedule(); }
}
function addMessage(text, kind='system') { const node=document.createElement('div'); node.className=`message ${kind}`; node.textContent=text; $('assistant-messages').append(node); node.scrollIntoView({ block:'nearest' }); }
function organize(actions) {
  if (!actions.length) return;
  state.undo = { filters:structuredClone(state.filters),source:state.source,sort:state.sort,theme:document.documentElement.dataset.theme };
  $('undo-ai').hidden=false;
  for (const a of validateActions(actions)) {
    if (a.type==='set_filters') state.filters=a.filters;
    if (a.type==='reset_filters') state.filters=emptyFilters();
    if (a.type==='set_theme') setTheme(a.theme);
    if (a.type==='set_source') state.source=a.source;
    if (a.type==='set_sort') state.sort=a.sort;
    if (a.type==='refresh') load();
    if (a.type==='open_reports') location.href=demo ? '/relatorios?demo=1' : '/relatorios';
  }
  if (state.data) populateOptions(); applyFilters(); addMessage('Organização aplicada neste navegador. Você pode desfazer abaixo.');
}
function localCommand(text) {
  const q=normalizeText(text).replace(/[.!?]/g,'');
  if (/^(ativar |mudar para |usar )?modo (escuro|claro)$/.test(q)) return [{type:'set_theme',theme:q.endsWith('escuro') ? 'dark':'light'}];
  if (/^(limpar|remover) (os )?filtros$/.test(q)) return [{type:'reset_filters'}];
  if (q === 'mostrar pendencias vencidas') return [{type:'set_filters',filters:{...state.filters,overdue:true}},{type:'set_source',source:'pending'},{type:'set_sort',sort:'due'}];
  return null;
}
async function ask(event) {
  event.preventDefault(); const question=$('assistant-question').value.trim(); if (!question) return;
  const button=$('assistant-form').querySelector('[type="submit"]'); if(button.disabled) return;
  addMessage(question,'user'); $('assistant-question').value='';
  const local=localCommand(question); if(local) { organize(local); $('assistant-limit').textContent='Comando visual aplicado sem gastar tokens.'; return; }
  if (demo) { addMessage('A demonstração não consome IA. Use os comandos visuais rápidos ou abra o dashboard conectado à planilha.'); return; }
  button.disabled=true; $('assistant-limit').textContent='Consultando os indicadores da planilha...';
  try {
    const payload = await fetchJson('/api/ia', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'dashboard',question,filters:state.filters}),timeout:30000});
    addMessage(payload.answer); organize(payload.actions);
    $('assistant-limit').textContent=`${payload.usage?.total_tokens || '—'} tokens usados · ${payload.budget.remainingCalls} chamadas no limite diário. Intervalo entre consultas: 65 s.`;
  } catch(error) { addMessage(error.message,'error'); $('assistant-limit').textContent=error.retryAfter ? `Tente novamente em ${error.retryAfter} s. Sem repetição automática.` : 'Filtros e gráficos continuam disponíveis.'; }
  finally { button.disabled=false; }
}
for (const key of Object.keys(emptyFilters()).filter(k => k !== 'months')) {
  const input=$(`filter-${key}`); let debounce;
  input?.addEventListener(key==='search'?'input':'change',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.filters[key]=input.type==='checkbox'?input.checked:input.value;applyFilters();},key==='search'?200:0);});
}
$('month-options').addEventListener('change',event=>{if(event.target.type!=='checkbox')return;const set=new Set(state.filters.months);event.target.checked?set.add(event.target.value):set.delete(event.target.value);state.filters.months=[...set];applyFilters();});
$('month-options').addEventListener('click',event=>{const type=event.target.dataset.months;if(!type)return;state.filters.months=type==='all'?[]:(state.data.months || []).slice(-1);applyFilters();});
$('clear-filters').addEventListener('click',()=>{state.filters=emptyFilters();state.source='all';applyFilters();});
$('record-sort').addEventListener('change',()=>{state.sort=$('record-sort').value;renderTable();});
document.querySelectorAll('[data-source]').forEach(b=>b.addEventListener('click',()=>{state.source=b.dataset.source;applyFilters();}));
$('prev-page').addEventListener('click',()=>{state.page--;renderTable();}); $('next-page').addEventListener('click',()=>{state.page++;renderTable();});
function chartFilter(event) { const target=event.target.closest('[data-month],[data-status],[data-sector]');if(!target)return;if(target.dataset.month)state.filters.months=[target.dataset.month];if(target.dataset.status)state.filters.status=target.dataset.status;if(target.dataset.sector)state.filters.sector=target.dataset.sector;applyFilters(); }
for(const id of ['trend-chart','status-key','sector-chart']) $(id).addEventListener('click',chartFilter);
$('trend-chart').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();chartFilter(event);}});
$('refresh-button').addEventListener('click',load);
$('pause-button').addEventListener('click',()=>{state.paused=!state.paused;$('pause-button').textContent=state.paused?'Retomar':'Pausar';$('pause-button').setAttribute('aria-pressed',String(state.paused));live(state.paused?'Pausado':'Sincronização ativa');schedule();if(!state.paused)load();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!state.paused)load();else clearTimeout(state.timer);}); window.addEventListener('online',()=>{if(!state.paused&&!document.hidden)load();});
function toggleAssistant(open) { $('assistant-panel').hidden=!open;$('assistant-launcher').hidden=open;$('assistant-launcher').setAttribute('aria-expanded',String(open));if(open)$('assistant-question').focus();else $('assistant-launcher').focus(); }
$('assistant-launcher').addEventListener('click',()=>toggleAssistant(true));$('assistant-close').addEventListener('click',()=>toggleAssistant(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('assistant-panel').hidden)toggleAssistant(false);});
$('assistant-form').addEventListener('submit',ask);document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{$('assistant-question').value=b.dataset.command;$('assistant-form').requestSubmit();}));
$('undo-ai').addEventListener('click',()=>{if(!state.undo)return;Object.assign(state,{filters:state.undo.filters,source:state.undo.source,sort:state.undo.sort});setTheme(state.undo.theme);populateOptions();applyFilters();state.undo=null;$('undo-ai').hidden=true;addMessage('Visualização anterior restaurada.');});
syncControls(); load();
