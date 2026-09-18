// Simple JSON-file backed data store. No native dependencies, so it runs
// identically on a plain Windows dev machine and inside the Linux Docker image.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { defaultChecklist, defaultHomeCommissioningChecklist, CHECKLIST_FIELDS, COMMISSIONING_FIELDS } = require('./fields');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

let db = { projects: {} };

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function defaultHome(name) {
  return {
    id: newId(),
    name: (name || '').trim() || 'Home 1',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    commissioningChecklist: defaultHomeCommissioningChecklist(),
    notes: [],
    outstandingItems: [],
    files: [],
    hoursLog: [],
    aftersalesTickets: [],
  };
}

// Converts a pre-Homes/Units project's flat commissioningChecklist (Yes/No/N/A
// dropdowns) into a single migrated Home, so real data isn't silently dropped
// when the structure changes. Yes/N-A both counted as "done" under the old
// model, so both become checked:true here.
function migrateLegacyCommissioning(project) {
  const legacy = project.commissioningChecklist;
  if (!legacy) return null;
  const hasData = Object.values(legacy).some((item) => item && (item.value || item.note));
  if (!hasData) return null;
  const home = defaultHome('Home 1');
  for (const field of COMMISSIONING_FIELDS) {
    const old = legacy[field.key];
    if (!old) continue;
    home.commissioningChecklist[field.key] = {
      checked: old.value === 'Yes' || old.value === 'N/A',
      note: old.note || '',
      photos: [],
    };
  }
  return home;
}

// Backfills projects saved before a field/section existed (e.g. new
// checklist items, the hours log, Homes/Units) so old data keeps working
// without a separate migration step.
function migrateProject(project) {
  let changed = false;
  if (!project.hoursLog) {
    project.hoursLog = [];
    changed = true;
  }
  if (project.konecLinkId === undefined) {
    project.konecLinkId = null;
    changed = true;
  }
  for (const field of CHECKLIST_FIELDS) {
    if (!project.checklist[field.key]) {
      project.checklist[field.key] = {
        value: field.type === 'boolean' ? false : '',
        checked: false,
        note: '',
      };
      changed = true;
    }
  }
  if (!project.homes) {
    const migratedHome = migrateLegacyCommissioning(project);
    project.homes = migratedHome ? [migratedHome] : [];
    changed = true;
  }
  if ('commissioningChecklist' in project) {
    delete project.commissioningChecklist;
    changed = true;
  }
  for (const home of project.homes) {
    if (!home.outstandingItems) {
      home.outstandingItems = [];
      changed = true;
    }
    if (!home.aftersalesTickets) {
      home.aftersalesTickets = [];
      changed = true;
    }
    if (!home.files) {
      home.files = [];
      changed = true;
    }
    if (!home.hoursLog) {
      home.hoursLog = [];
      changed = true;
    }
    if (!home.notes) {
      home.notes = [];
      changed = true;
    }
    for (const field of COMMISSIONING_FIELDS) {
      if (!home.commissioningChecklist[field.key]) {
        home.commissioningChecklist[field.key] = { checked: false, note: '', photos: [] };
        changed = true;
      } else if (!home.commissioningChecklist[field.key].photos) {
        home.commissioningChecklist[field.key].photos = [];
        changed = true;
      }
    }
  }
  return changed;
}

function load() {
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = raw.trim() ? JSON.parse(raw) : { projects: {} };
    let changed = false;
    for (const project of Object.values(db.projects)) {
      if (migrateProject(project)) changed = true;
    }
    if (changed) persist();
  } else {
    db = { projects: {} };
    persist();
  }
}

// Write to a temp file then rename, so a crash mid-write can't corrupt db.json.
function persist() {
  const tmpFile = DB_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

function projectUploadsDir(projectId) {
  return path.join(UPLOADS_DIR, projectId);
}

function homeDir(projectId, homeId) {
  return path.join(projectUploadsDir(projectId), 'homes', homeId);
}

function homeFilesDir(projectId, homeId) {
  return path.join(homeDir(projectId, homeId), 'files');
}

function homeChecklistPhotoDir(projectId, homeId, key) {
  return path.join(homeDir(projectId, homeId), 'checklist', key);
}

function assertProject(id) {
  const project = db.projects[id];
  if (!project) {
    const err = new Error('Project not found');
    err.status = 404;
    throw err;
  }
  return project;
}

function findHome(project, homeId) {
  const home = project.homes.find((h) => h.id === homeId);
  if (!home) {
    const err = new Error('Home/Unit not found');
    err.status = 404;
    throw err;
  }
  return home;
}

function getHomeOrThrow(projectId, homeId) {
  const project = assertProject(projectId);
  return { project, home: findHome(project, homeId) };
}

function listProjects() {
  return Object.values(db.projects).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function getProject(id) {
  return assertProject(id);
}

function createProject({ name, commissionDate, konecLinkId }) {
  const id = newId();
  const project = {
    id,
    name: (name || '').trim() || 'Untitled Project',
    commissionDate: commissionDate || null,
    konecLinkId: (konecLinkId || '').trim() || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    checklist: defaultChecklist(),
    notes: [],
    files: [],
    hoursLog: [],
    homes: [],
  };
  db.projects[id] = project;
  fs.mkdirSync(projectUploadsDir(id), { recursive: true });
  persist();
  return project;
}

function updateProject(id, patch) {
  const project = assertProject(id);
  if (typeof patch.name === 'string') {
    project.name = patch.name.trim() || project.name;
  }
  if ('commissionDate' in patch) {
    project.commissionDate = patch.commissionDate || null;
  }
  if ('konecLinkId' in patch) {
    project.konecLinkId = (patch.konecLinkId || '').trim() || null;
  }
  project.updatedAt = nowIso();
  persist();
  return project;
}

function deleteProject(id) {
  assertProject(id);
  delete db.projects[id];
  persist();
  const dir = projectUploadsDir(id);
  fs.rmSync(dir, { recursive: true, force: true });
}

function updateChecklistItem(projectId, key, patch) {
  const project = assertProject(projectId);
  const item = project.checklist[key];
  if (!item) {
    const err = new Error('Unknown checklist field');
    err.status = 400;
    throw err;
  }
  if ('value' in patch) item.value = patch.value;
  if ('checked' in patch) item.checked = !!patch.checked;
  if ('note' in patch) item.note = patch.note;
  project.updatedAt = nowIso();
  persist();
  return project;
}

// ---- Generic list helpers shared between project-level and home-level
// notes/hours, so the two scopes don't duplicate the same logic. ----

function pushNote(list, content) {
  const note = { id: newId(), content: content || '', createdAt: nowIso(), updatedAt: nowIso() };
  list.unshift(note);
  return note;
}

function editNote(list, noteId, content) {
  const note = list.find((n) => n.id === noteId);
  if (!note) {
    const err = new Error('Note not found');
    err.status = 404;
    throw err;
  }
  note.content = content || '';
  note.updatedAt = nowIso();
  return note;
}

function pushHours(list, { date, hours }) {
  const entry = { id: newId(), date: date || null, hours: Number(hours) || 0, createdAt: nowIso(), updatedAt: nowIso() };
  list.push(entry);
  list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return entry;
}

function editHours(list, entryId, { date, hours }) {
  const entry = list.find((h) => h.id === entryId);
  if (!entry) {
    const err = new Error('Hours entry not found');
    err.status = 404;
    throw err;
  }
  if (date !== undefined) entry.date = date || null;
  if (hours !== undefined) entry.hours = Number(hours) || 0;
  entry.updatedAt = nowIso();
  list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return entry;
}

// ---- Project-level notes ----

function addNote(projectId, content) {
  const project = assertProject(projectId);
  const note = pushNote(project.notes, content);
  project.updatedAt = nowIso();
  persist();
  return note;
}

function updateNote(projectId, noteId, content) {
  const project = assertProject(projectId);
  const note = editNote(project.notes, noteId, content);
  project.updatedAt = nowIso();
  persist();
  return note;
}

function deleteNote(projectId, noteId) {
  const project = assertProject(projectId);
  project.notes = project.notes.filter((n) => n.id !== noteId);
  project.updatedAt = nowIso();
  persist();
}

// ---- Project-level hours ----

function addHoursEntry(projectId, patch) {
  const project = assertProject(projectId);
  const entry = pushHours(project.hoursLog, patch);
  project.updatedAt = nowIso();
  persist();
  return entry;
}

function updateHoursEntry(projectId, entryId, patch) {
  const project = assertProject(projectId);
  const entry = editHours(project.hoursLog, entryId, patch);
  project.updatedAt = nowIso();
  persist();
  return entry;
}

function deleteHoursEntry(projectId, entryId) {
  const project = assertProject(projectId);
  project.hoursLog = project.hoursLog.filter((h) => h.id !== entryId);
  project.updatedAt = nowIso();
  persist();
}

// ---- Project-level files ----

function addFile(projectId, fileMeta) {
  const project = assertProject(projectId);
  const file = {
    id: newId(),
    originalName: fileMeta.originalName,
    storedName: fileMeta.storedName,
    size: fileMeta.size,
    mimeType: fileMeta.mimeType,
    category: fileMeta.category === 'konecMarkupQuote' ? 'konecMarkupQuote' : 'general',
    uploadedAt: nowIso(),
  };
  project.files.push(file);
  project.updatedAt = nowIso();
  persist();
  return file;
}

function getFile(projectId, fileId) {
  const project = assertProject(projectId);
  const file = project.files.find((f) => f.id === fileId);
  if (!file) {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }
  return file;
}

function deleteFile(projectId, fileId) {
  const project = assertProject(projectId);
  const file = project.files.find((f) => f.id === fileId);
  if (!file) {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }
  project.files = project.files.filter((f) => f.id !== fileId);
  project.updatedAt = nowIso();
  persist();
  return file;
}

// ==================== Homes / Units ====================

function createHome(projectId, { name }) {
  const project = assertProject(projectId);
  const home = defaultHome(name || `Home ${project.homes.length + 1}`);
  project.homes.push(home);
  project.updatedAt = nowIso();
  fs.mkdirSync(homeFilesDir(projectId, home.id), { recursive: true });
  persist();
  return home;
}

function updateHome(projectId, homeId, { name }) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  if (typeof name === 'string') {
    home.name = name.trim() || home.name;
  }
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return home;
}

function deleteHome(projectId, homeId) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  project.homes = project.homes.filter((h) => h.id !== home.id);
  project.updatedAt = nowIso();
  persist();
  fs.rmSync(homeDir(projectId, home.id), { recursive: true, force: true });
}

// ---- Per-home commissioning checklist ----

function updateHomeCommissioningItem(projectId, homeId, key, patch) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const item = home.commissioningChecklist[key];
  if (!item) {
    const err = new Error('Unknown commissioning field');
    err.status = 400;
    throw err;
  }
  if ('checked' in patch) item.checked = !!patch.checked;
  if ('note' in patch) item.note = patch.note;
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return home;
}

function addChecklistPhoto(projectId, homeId, key, fileMeta) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const item = home.commissioningChecklist[key];
  if (!item) {
    const err = new Error('Unknown commissioning field');
    err.status = 400;
    throw err;
  }
  const photo = {
    id: newId(),
    originalName: fileMeta.originalName,
    storedName: fileMeta.storedName,
    size: fileMeta.size,
    mimeType: fileMeta.mimeType,
    uploadedAt: nowIso(),
  };
  item.photos.push(photo);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return photo;
}

function getChecklistPhoto(projectId, homeId, key, photoId) {
  const { home } = getHomeOrThrow(projectId, homeId);
  const item = home.commissioningChecklist[key];
  const photo = item && item.photos.find((p) => p.id === photoId);
  if (!photo) {
    const err = new Error('Photo not found');
    err.status = 404;
    throw err;
  }
  return photo;
}

function deleteChecklistPhoto(projectId, homeId, key, photoId) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const item = home.commissioningChecklist[key];
  const photo = item && item.photos.find((p) => p.id === photoId);
  if (!photo) {
    const err = new Error('Photo not found');
    err.status = 404;
    throw err;
  }
  item.photos = item.photos.filter((p) => p.id !== photoId);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return photo;
}

// ---- Per-home notes ----

function addHomeNote(projectId, homeId, content) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const note = pushNote(home.notes, content);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return note;
}

function updateHomeNote(projectId, homeId, noteId, content) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const note = editNote(home.notes, noteId, content);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return note;
}

function deleteHomeNote(projectId, homeId, noteId) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  home.notes = home.notes.filter((n) => n.id !== noteId);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
}

// ---- Per-home outstanding items (each with its own dated action log) ----

function addOutstandingItem(projectId, homeId, description) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const item = {
    id: newId(),
    description: description || '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    actions: [],
  };
  home.outstandingItems.push(item);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return item;
}

function findOutstandingItem(home, itemId) {
  const item = home.outstandingItems.find((i) => i.id === itemId);
  if (!item) {
    const err = new Error('Outstanding item not found');
    err.status = 404;
    throw err;
  }
  return item;
}

function updateOutstandingItem(projectId, homeId, itemId, description) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const item = findOutstandingItem(home, itemId);
  item.description = description || '';
  item.updatedAt = nowIso();
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return item;
}

function deleteOutstandingItem(projectId, homeId, itemId) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  home.outstandingItems = home.outstandingItems.filter((i) => i.id !== itemId);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
}

function addOutstandingAction(projectId, homeId, itemId, { date, action }) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const item = findOutstandingItem(home, itemId);
  const entry = { id: newId(), date: date || null, action: action || '', createdAt: nowIso() };
  item.actions.push(entry);
  item.actions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  item.updatedAt = nowIso();
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return entry;
}

function deleteOutstandingAction(projectId, homeId, itemId, actionId) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const item = findOutstandingItem(home, itemId);
  item.actions = item.actions.filter((a) => a.id !== actionId);
  item.updatedAt = nowIso();
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
}

// ---- Per-home files (photos / plans) ----

function addHomeFile(projectId, homeId, fileMeta) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const file = {
    id: newId(),
    originalName: fileMeta.originalName,
    storedName: fileMeta.storedName,
    size: fileMeta.size,
    mimeType: fileMeta.mimeType,
    uploadedAt: nowIso(),
  };
  home.files.push(file);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return file;
}

function getHomeFile(projectId, homeId, fileId) {
  const { home } = getHomeOrThrow(projectId, homeId);
  const file = home.files.find((f) => f.id === fileId);
  if (!file) {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }
  return file;
}

function deleteHomeFile(projectId, homeId, fileId) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const file = home.files.find((f) => f.id === fileId);
  if (!file) {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }
  home.files = home.files.filter((f) => f.id !== fileId);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return file;
}

// ---- Per-home hours ----

function addHomeHoursEntry(projectId, homeId, patch) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const entry = pushHours(home.hoursLog, patch);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return entry;
}

function updateHomeHoursEntry(projectId, homeId, entryId, patch) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const entry = editHours(home.hoursLog, entryId, patch);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return entry;
}

function deleteHomeHoursEntry(projectId, homeId, entryId) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  home.hoursLog = home.hoursLog.filter((h) => h.id !== entryId);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
}

// ---- Per-home aftersales tickets ----

function addAftersalesTicket(projectId, homeId, { projectRef, issueNotes, actionDate, caseId }) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const ticket = {
    id: newId(),
    projectRef: projectRef || '',
    issueNotes: issueNotes || '',
    actionDate: actionDate || null,
    caseId: caseId || '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  home.aftersalesTickets.push(ticket);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return ticket;
}

function findAftersalesTicket(home, ticketId) {
  const ticket = home.aftersalesTickets.find((t) => t.id === ticketId);
  if (!ticket) {
    const err = new Error('Aftersales ticket not found');
    err.status = 404;
    throw err;
  }
  return ticket;
}

function updateAftersalesTicket(projectId, homeId, ticketId, patch) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  const ticket = findAftersalesTicket(home, ticketId);
  if ('projectRef' in patch) ticket.projectRef = patch.projectRef || '';
  if ('issueNotes' in patch) ticket.issueNotes = patch.issueNotes || '';
  if ('actionDate' in patch) ticket.actionDate = patch.actionDate || null;
  if ('caseId' in patch) ticket.caseId = patch.caseId || '';
  ticket.updatedAt = nowIso();
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
  return ticket;
}

function deleteAftersalesTicket(projectId, homeId, ticketId) {
  const { project, home } = getHomeOrThrow(projectId, homeId);
  home.aftersalesTickets = home.aftersalesTickets.filter((t) => t.id !== ticketId);
  home.updatedAt = nowIso();
  project.updatedAt = nowIso();
  persist();
}

// ---- Backup / restore ----
// Manual safety net: everything under DATA_DIR (db.json + all uploaded
// files) as a single zip, so data can be snapshotted/restored independently
// of whatever persistence the hosting platform does or doesn't provide.

function exportBackupBuffer() {
  const zip = new AdmZip();
  zip.addLocalFile(DB_FILE);
  if (fs.existsSync(UPLOADS_DIR)) {
    zip.addLocalFolder(UPLOADS_DIR, 'uploads');
  }
  return zip.toBuffer();
}

function restoreFromBackupBuffer(buffer) {
  const zip = new AdmZip(buffer);
  const dbEntry = zip.getEntry('db.json');
  if (!dbEntry) {
    const err = new Error('That file doesn\'t look like a Konec PM backup (missing db.json).');
    err.status = 400;
    throw err;
  }
  // Validate before touching anything on disk.
  let parsed;
  try {
    parsed = JSON.parse(zip.readAsText(dbEntry));
  } catch (e) {
    const err = new Error('Backup db.json is not valid JSON — refusing to restore.');
    err.status = 400;
    throw err;
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.projects !== 'object') {
    const err = new Error('Backup db.json has an unexpected shape — refusing to restore.');
    err.status = 400;
    throw err;
  }

  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  zip.extractAllTo(DATA_DIR, true);
  load();
}

module.exports = {
  DATA_DIR,
  UPLOADS_DIR,
  load,
  exportBackupBuffer,
  restoreFromBackupBuffer,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  updateChecklistItem,
  addNote,
  updateNote,
  deleteNote,
  addHoursEntry,
  updateHoursEntry,
  deleteHoursEntry,
  addFile,
  getFile,
  deleteFile,
  projectUploadsDir,
  // Homes/Units
  createHome,
  updateHome,
  deleteHome,
  updateHomeCommissioningItem,
  addChecklistPhoto,
  getChecklistPhoto,
  deleteChecklistPhoto,
  addHomeNote,
  updateHomeNote,
  deleteHomeNote,
  addOutstandingItem,
  updateOutstandingItem,
  deleteOutstandingItem,
  addOutstandingAction,
  deleteOutstandingAction,
  addHomeFile,
  getHomeFile,
  deleteHomeFile,
  addHomeHoursEntry,
  updateHomeHoursEntry,
  deleteHomeHoursEntry,
  addAftersalesTicket,
  updateAftersalesTicket,
  deleteAftersalesTicket,
  homeFilesDir,
  homeChecklistPhotoDir,
};
