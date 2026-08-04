// Simple JSON-file backed data store. No native dependencies, so it runs
// identically on a plain Windows dev machine and inside the Linux Docker image.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { defaultChecklist } = require('./fields');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

let db = { projects: {} };

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function load() {
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    db = raw.trim() ? JSON.parse(raw) : { projects: {} };
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

function createProject({ name, commissionDate }) {
  const id = newId();
  const project = {
    id,
    name: (name || '').trim() || 'Untitled Project',
    commissionDate: commissionDate || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    checklist: defaultChecklist(),
    notes: [],
    files: [],
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

module.exports = {
  DATA_DIR,
  UPLOADS_DIR,
  load,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  updateChecklistItem,
  addNote,
  updateNote,
  deleteNote,
  addFile,
  getFile,
  deleteFile,
  projectUploadsDir,
};
