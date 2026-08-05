// Simple JSON-file backed data store. No native dependencies, so it runs
// identically on a plain Windows dev machine and inside the Linux Docker image.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { defaultChecklist, CHECKLIST_FIELDS } = require('./fields');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

let db = { projects: {} };

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Backfills projects saved before a field/section existed (e.g. new
// checklist items, the hours log) so old data keeps working without a
// separate migration step.
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

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function projectUploadsDir(projectId) {
  return path.join(UPLOADS_DIR, projectId);
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

function addNote(projectId, content) {
  const project = assertProject(projectId);
  const note = { id: newId(), content: content || '', createdAt: nowIso(), updatedAt: nowIso() };
  project.notes.unshift(note);
  project.updatedAt = nowIso();
  persist();
  return note;
}

function updateNote(projectId, noteId, content) {
  const project = assertProject(projectId);
  const note = project.notes.find((n) => n.id === noteId);
  if (!note) {
    const err = new Error('Note not found');
    err.status = 404;
    throw err;
  }
  note.content = content || '';
  note.updatedAt = nowIso();
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

function addHoursEntry(projectId, { date, hours }) {
  const project = assertProject(projectId);
  const entry = {
    id: newId(),
    date: date || null,
    hours: Number(hours) || 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  project.hoursLog.push(entry);
  project.hoursLog.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  project.updatedAt = nowIso();
  persist();
  return entry;
}

function updateHoursEntry(projectId, entryId, { date, hours }) {
  const project = assertProject(projectId);
  const entry = project.hoursLog.find((h) => h.id === entryId);
  if (!entry) {
    const err = new Error('Hours entry not found');
    err.status = 404;
    throw err;
  }
  if (date !== undefined) entry.date = date || null;
  if (hours !== undefined) entry.hours = Number(hours) || 0;
  entry.updatedAt = nowIso();
  project.hoursLog.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
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
};
