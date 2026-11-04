// Sistema de armazenamento local para rascunhos de frentes, fotos em cache e histórico de relatórios
import { toDateKey, formatDate } from './shared.js';

const DRAFT_PREFIX = 'safe_draft_';
const SAVED_REPORTS_KEY = 'safe_saved_reports';
const LOCAL_RECORDS_KEY = 'safe_local_records';
const LOCAL_PHOTOS_KEY = 'safe_local_photos';

// --- RASCUNHOS DE FRENTES (CACHE DE FOTOS E FORMULÁRIOS) ---
export function getFrontDraft(frontKey) {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${frontKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveFrontDraft(frontKey, data) {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${frontKey}`, JSON.stringify({
      ...data,
      updatedAt: Date.now()
    }));
  } catch (err) {
    console.warn(`Não foi possível salvar rascunho de ${frontKey}:`, err);
  }
}

export function clearFrontDraft(frontKey) {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${frontKey}`);
  } catch {}
}

export function hasFrontDraft(frontKey) {
  const draft = getFrontDraft(frontKey);
  if (!draft) return false;
  const hasPhotos = Array.isArray(draft.photos) && draft.photos.length > 0;
  const hasFields = Boolean(draft.description || draft.action || draft.sector || draft.notes);
  return hasPhotos || hasFields;
}

// --- HISTÓRICO DE RELATÓRIOS SALVOS (ACESSO POSTERIOR) ---
export function listSavedReports() {
  try {
    const raw = localStorage.getItem(SAVED_REPORTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)) : [];
  } catch {
    return [];
  }
}

export function saveReportToHistory(report) {
  try {
    const current = listSavedReports();
    const id = report.id || `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const simplifiedPhotos = (report.photos || []).map((p, i) => ({
      id: p.id || `p-${i}`,
      name: p.name || `Foto ${i + 1}`,
      caption: p.caption || '',
      dataUrl: p.dataUrl || p.contentUrl || '',
      contentUrl: p.contentUrl || '',
      frontLabel: p.frontLabel || '',
      sector: p.sector || '',
      date: p.date || ''
    }));

    const entry = {
      id,
      type: report.type || 'daily',
      title: report.title,
      period: report.period,
      periodStart: report.filters?.start || toDateKey(new Date()),
      periodEnd: report.filters?.end || toDateKey(new Date()),
      owner: report.owner,
      notes: report.notes || '',
      filterLabel: report.filterLabel || '',
      metrics: report.metrics || {},
      findingsCount: report.data?.inspections?.length || 0,
      pendingCount: report.data?.pending?.length || 0,
      ddsCount: report.data?.dds?.length || 0,
      epiCount: report.data?.epi?.length || 0,
      photos: simplifiedPhotos,
      savedAt: Date.now(),
      reportSnapshot: report
    };

    // Remove item com mesmo ID se já existir
    const filtered = current.filter(r => r.id !== id);
    // Limita o histórico a 50 relatórios salvos para economizar espaço
    filtered.unshift(entry);
    writeReportHistory(filtered.slice(0, 50));
    return entry;
  } catch (err) {
    console.error('Falha ao salvar relatório no histórico:', err);
    throw new Error('Armazenamento cheio ou indisponível para salvar o relatório no histórico.');
  }
}

// Foto que tem cópia no Drive não precisa ocupar espaço dentro do histórico.
function withoutInlineDrivePhotos(photos) {
  return (photos || []).map(photo => (photo.contentUrl && !String(photo.contentUrl).startsWith('data:') ? { ...photo, dataUrl: '' } : photo));
}

function writeReportHistory(list) {
  try {
    localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(list));
    return;
  } catch {}
  let slim = list.map(item => ({
    ...item,
    photos: withoutInlineDrivePhotos(item.photos),
    reportSnapshot: item.reportSnapshot ? { ...item.reportSnapshot, photos: withoutInlineDrivePhotos(item.reportSnapshot.photos) } : item.reportSnapshot
  }));
  // Se ainda não couber, sai o relatório mais antigo; o mais novo é sempre o último a sair.
  for (;;) {
    try {
      localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(slim));
      return;
    } catch (err) {
      if (slim.length <= 1) throw err;
      slim = slim.slice(0, -1);
    }
  }
}

export function getSavedReport(id) {
  const all = listSavedReports();
  return all.find(r => r.id === id) || null;
}

export function deleteSavedReport(id) {
  try {
    const current = listSavedReports();
    const updated = current.filter(r => r.id !== id);
    localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(updated));
    return true;
  } catch {
    return false;
  }
}

// --- REGISTROS LOCAIS E EVIDÊNCIAS DE FRENTES ---
export function listLocalRecords(frontKey = null) {
  try {
    const raw = localStorage.getItem(LOCAL_RECORDS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!frontKey) return list;
    return list.filter(r => r.front === frontKey);
  } catch {
    return [];
  }
}

export function saveLocalRecord(record) {
  try {
    const current = listLocalRecords();
    current.unshift({
      ...record,
      savedAt: Date.now()
    });
    localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(current.slice(0, 300)));
  } catch (err) {
    console.warn('Erro ao salvar registro localmente:', err);
  }
}

export function listLocalPhotos(frontKey = null) {
  try {
    const raw = localStorage.getItem(LOCAL_PHOTOS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!frontKey) return list;
    return list.filter(p => p.front === frontKey);
  } catch {
    return [];
  }
}

export function saveLocalPhotos(photos) {
  try {
    const current = listLocalPhotos();
    const newItems = Array.isArray(photos) ? photos : [photos];
    const updated = [...newItems, ...current];
    localStorage.setItem(LOCAL_PHOTOS_KEY, JSON.stringify(updated.slice(0, 200)));
  } catch (err) {
    console.warn('Erro ao salvar fotos localmente:', err);
  }
}

export function removeLocalRecord(recordId) {
  try {
    localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(listLocalRecords().filter(r => r.recordId !== recordId)));
    localStorage.setItem(LOCAL_PHOTOS_KEY, JSON.stringify(listLocalPhotos().filter(p => p.recordId !== recordId)));
  } catch (err) {
    console.warn('Erro ao limpar registro local:', err);
  }
}

// --- FOTOS DOS RASCUNHOS (INDEXEDDB) ---
// As fotos não cabem no localStorage (cerca de 5 MB por site): com poucas imagens a
// gravação falhava e o rascunho perdia as fotos. O IndexedDB aguenta as 20 de cada frente.
const PHOTO_DB = 'safe_evidencias';
const PHOTO_STORE = 'fotos_rascunho';
const memoryPhotos = new Map(); // Reserva para navegadores que bloqueiam o IndexedDB.
let photoDb = null;

function openPhotoDb() {
  if (!photoDb) {
    photoDb = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error('IndexedDB indisponível.'));
      const request = indexedDB.open(PHOTO_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE, { keyPath: 'id' }).createIndex('front', 'front');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(err => { photoDb = null; throw err; });
  }
  return photoDb;
}

async function photoTransaction(mode, work) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, mode);
    const request = work(tx.objectStore(PHOTO_STORE));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

const memoryList = frontKey => [...memoryPhotos.values()].filter(p => p.front === frontKey);

export async function listDraftPhotos(frontKey) {
  let stored = [];
  try {
    stored = await photoTransaction('readonly', store => store.index('front').getAll(frontKey)) || [];
  } catch (err) {
    console.warn('IndexedDB indisponível, usando fotos em memória:', err);
  }
  return [...stored, ...memoryList(frontKey)].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

export async function putDraftPhoto(photo) {
  try {
    await photoTransaction('readwrite', store => store.put(photo));
    memoryPhotos.delete(photo.id);
  } catch (err) {
    console.warn('IndexedDB indisponível, usando fotos em memória:', err);
    memoryPhotos.set(photo.id, photo);
  }
}

export async function removeDraftPhoto(id) {
  memoryPhotos.delete(id);
  try { await photoTransaction('readwrite', store => store.delete(id)); } catch {}
}

export async function clearDraftPhotos(frontKey) {
  await Promise.all((await listDraftPhotos(frontKey)).map(photo => removeDraftPhoto(photo.id)));
}

// Rascunhos antigos guardavam as fotos no localStorage: move para o IndexedDB e libera o espaço.
export async function migrateDraftPhotos() {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(key => key?.startsWith(DRAFT_PREFIX));
  for (const key of keys) {
    const frontKey = key.slice(DRAFT_PREFIX.length);
    const draft = getFrontDraft(frontKey);
    if (!draft?.photos?.length) continue;
    for (const [index, photo] of draft.photos.entries()) await putDraftPhoto({ ...photo, front: frontKey, addedAt: Date.now() + index });
    const { photos, ...fields } = draft;
    saveFrontDraft(frontKey, fields);
  }
}
