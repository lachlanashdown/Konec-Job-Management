const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const store = require('./store');
const { CHECKLIST_FIELDS } = require('./fields');

const CHECKLIST_KEYS = new Set(CHECKLIST_FIELDS.map((f) => f.key));

function wrap(fn) {
  return (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

// Total job cost powers the "price" shown on the overview screen.
function projectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    commissionDate: project.commissionDate,
    price: project.checklist.totalJobCost ? project.checklist.totalJobCost.value : '',
    checklistDone: Object.values(project.checklist).filter((i) => i.checked).length,
    checklistTotal: Object.keys(project.checklist).length,
    fileCount: project.files.length,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
  };
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    try {
      store.getProject(req.params.id); // throws 404 if missing
      cb(null, store.projectUploadsDir(req.params.id));
    } catch (err) {
      cb(err);
    }
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).slice(0, 20);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024, files: 20 }, // 200MB per file, 20 files per request
});

function buildApiRouter() {
  const router = express.Router();
  router.use(express.json());

  // ---- Projects ----
  router.get('/projects', wrap((req, res) => {
    res.json(store.listProjects().map(projectSummary));
  }));

  router.post('/projects', wrap((req, res) => {
    const { name, commissionDate } = req.body || {};
    const project = store.createProject({ name, commissionDate });
    res.status(201).json(project);
  }));

  router.get('/projects/:id', wrap((req, res) => {
    res.json(store.getProject(req.params.id));
  }));

  router.patch('/projects/:id', wrap((req, res) => {
    const project = store.updateProject(req.params.id, req.body || {});
    res.json(project);
  }));

  router.delete('/projects/:id', wrap((req, res) => {
    store.deleteProject(req.params.id);
    res.status(204).end();
  }));

  // ---- Checklist ----
  router.patch('/projects/:id/checklist/:key', wrap((req, res) => {
    const { key } = req.params;
    if (!CHECKLIST_KEYS.has(key)) {
      return res.status(400).json({ error: 'Unknown checklist field' });
    }
    const project = store.updateChecklistItem(req.params.id, key, req.body || {});
    res.json(project);
  }));

  // ---- General notes ----
  router.post('/projects/:id/notes', wrap((req, res) => {
    const note = store.addNote(req.params.id, (req.body || {}).content);
    res.status(201).json(note);
  }));

  router.patch('/projects/:id/notes/:noteId', wrap((req, res) => {
    const note = store.updateNote(req.params.id, req.params.noteId, (req.body || {}).content);
    res.json(note);
  }));

  router.delete('/projects/:id/notes/:noteId', wrap((req, res) => {
    store.deleteNote(req.params.id, req.params.noteId);
    res.status(204).end();
  }));

  // ---- Hours attended ----
  router.post('/projects/:id/hours', wrap((req, res) => {
    const entry = store.addHoursEntry(req.params.id, req.body || {});
    res.status(201).json(entry);
  }));

  router.patch('/projects/:id/hours/:entryId', wrap((req, res) => {
    const entry = store.updateHoursEntry(req.params.id, req.params.entryId, req.body || {});
    res.json(entry);
  }));

  router.delete('/projects/:id/hours/:entryId', wrap((req, res) => {
    store.deleteHoursEntry(req.params.id, req.params.entryId);
    res.status(204).end();
  }));

  // ---- Files ----
  router.post('/projects/:id/files', wrap((req, res, next) => {
    upload.array('files', 20)(req, res, (err) => {
      if (err) return next(err);
      const category = req.body.category === 'konecMarkupQuote' ? 'konecMarkupQuote' : 'general';
      const files = (req.files || []).map((f) =>
        store.addFile(req.params.id, {
          originalName: f.originalname,
          storedName: f.filename,
          size: f.size,
          mimeType: f.mimetype,
          category,
        })
      );
      res.status(201).json(files);
    });
  }));

  router.get('/projects/:id/files/:fileId/download', wrap((req, res) => {
    const file = store.getFile(req.params.id, req.params.fileId);
    const filePath = path.join(store.projectUploadsDir(req.params.id), file.storedName);
    res.download(filePath, file.originalName);
  }));

  router.delete('/projects/:id/files/:fileId', wrap((req, res) => {
    const file = store.deleteFile(req.params.id, req.params.fileId);
    const filePath = path.join(store.projectUploadsDir(req.params.id), file.storedName);
    fs.rm(filePath, { force: true }, () => {});
    res.status(204).end();
  }));

  return router;
}

module.exports = { buildApiRouter };
