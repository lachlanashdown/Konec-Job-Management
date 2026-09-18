const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const store = require('./store');
const { CHECKLIST_FIELDS, COMMISSIONING_FIELDS } = require('./fields');

const CHECKLIST_KEYS = new Set(CHECKLIST_FIELDS.map((f) => f.key));
const COMMISSIONING_KEYS = new Set(COMMISSIONING_FIELDS.map((f) => f.key));

function wrap(fn) {
  return (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}

function assertHomeExists(projectId, homeId) {
  const project = store.getProject(projectId);
  const home = project.homes.find((h) => h.id === homeId);
  if (!home) {
    const err = new Error('Home/Unit not found');
    err.status = 404;
    throw err;
  }
  return home;
}

// Total job cost powers the "price" shown on the overview screen; the
// commissioning progress bar there is now a rollup across every Home/Unit.
function projectSummary(project) {
  const commissioningTotal = project.homes.reduce(
    (sum, h) => sum + Object.keys(h.commissioningChecklist).length,
    0
  );
  const commissioningDone = project.homes.reduce(
    (sum, h) => sum + Object.values(h.commissioningChecklist).filter((i) => i.checked).length,
    0
  );
  return {
    id: project.id,
    name: project.name,
    commissionDate: project.commissionDate,
    konecLinkId: project.konecLinkId,
    price: project.checklist.totalJobCost ? project.checklist.totalJobCost.value : '',
    checklistDone: Object.values(project.checklist).filter((i) => i.checked).length,
    checklistTotal: Object.keys(project.checklist).length,
    homesCount: project.homes.length,
    homes: project.homes.map((h) => ({ id: h.id, name: h.name })),
    commissioningDone,
    commissioningTotal,
    fileCount: project.files.length,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
  };
}

function randomFilename(originalname) {
  const ext = path.extname(originalname).slice(0, 20);
  return `${crypto.randomUUID()}${ext}`;
}

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      try {
        store.getProject(req.params.id); // throws 404 if missing
        cb(null, store.projectUploadsDir(req.params.id));
      } catch (err) {
        cb(err);
      }
    },
    filename(req, file, cb) {
      cb(null, randomFilename(file.originalname));
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 20 }, // 200MB per file, 20 files per request
});

const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB backup zip
});

const homeFileUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      try {
        assertHomeExists(req.params.id, req.params.homeId);
        const dir = store.homeFilesDir(req.params.id, req.params.homeId);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename(req, file, cb) {
      cb(null, randomFilename(file.originalname));
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 20 },
});

const checklistPhotoUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      try {
        assertHomeExists(req.params.id, req.params.homeId);
        if (!COMMISSIONING_KEYS.has(req.params.key)) {
          throw Object.assign(new Error('Unknown commissioning field'), { status: 400 });
        }
        const dir = store.homeChecklistPhotoDir(req.params.id, req.params.homeId, req.params.key);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename(req, file, cb) {
      cb(null, randomFilename(file.originalname));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

function buildApiRouter() {
  const router = express.Router();
  router.use(express.json());

  // ---- Backup / restore ----
  router.get('/backup', wrap((req, res) => {
    const buffer = store.exportBackupBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="konec-pm-backup-${stamp}.zip"`);
    res.send(buffer);
  }));

  router.post('/backup/restore', restoreUpload.single('backup'), wrap((req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No backup file provided' });
    }
    store.restoreFromBackupBuffer(req.file.buffer);
    res.json({ ok: true });
  }));

  // ---- Recent activity (home page feed) ----
  router.get('/activity', wrap((req, res) => {
    const limit = Number(req.query.limit) || 10;
    res.json(store.listRecentActivity(limit));
  }));

  // ---- Aftersales (global, across every project/home) ----
  router.get('/aftersales', wrap((req, res) => {
    res.json(store.listAllAftersalesTickets());
  }));

  // ---- Projects ----
  router.get('/projects', wrap((req, res) => {
    res.json(store.listProjects().map(projectSummary));
  }));

  router.post('/projects', wrap((req, res) => {
    const { name, commissionDate, konecLinkId } = req.body || {};
    const project = store.createProject({ name, commissionDate, konecLinkId });
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

  // ---- Pre-Site Visit checklist ----
  router.patch('/projects/:id/checklist/:key', wrap((req, res) => {
    const { key } = req.params;
    if (!CHECKLIST_KEYS.has(key)) {
      return res.status(400).json({ error: 'Unknown checklist field' });
    }
    const project = store.updateChecklistItem(req.params.id, key, req.body || {});
    res.json(project);
  }));

  // ---- General notes (project-level) ----
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

  // ---- Hours attended (project-level) ----
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

  // ---- Files (project-level) ----
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

  // ==================== Homes / Units ====================

  router.post('/projects/:id/homes', wrap((req, res) => {
    const home = store.createHome(req.params.id, req.body || {});
    res.status(201).json(home);
  }));

  router.patch('/projects/:id/homes/:homeId', wrap((req, res) => {
    const home = store.updateHome(req.params.id, req.params.homeId, req.body || {});
    res.json(home);
  }));

  router.delete('/projects/:id/homes/:homeId', wrap((req, res) => {
    store.deleteHome(req.params.id, req.params.homeId);
    res.status(204).end();
  }));

  // ---- Per-home commissioning checklist ----
  router.patch('/projects/:id/homes/:homeId/commissioning/:key', wrap((req, res) => {
    if (!COMMISSIONING_KEYS.has(req.params.key)) {
      return res.status(400).json({ error: 'Unknown commissioning field' });
    }
    const home = store.updateHomeCommissioningItem(req.params.id, req.params.homeId, req.params.key, req.body || {});
    res.json(home);
  }));

  router.post('/projects/:id/homes/:homeId/commissioning/:key/photos', wrap((req, res, next) => {
    checklistPhotoUpload.array('photos', 10)(req, res, (err) => {
      if (err) return next(err);
      if (!COMMISSIONING_KEYS.has(req.params.key)) {
        return res.status(400).json({ error: 'Unknown commissioning field' });
      }
      const photos = (req.files || []).map((f) =>
        store.addChecklistPhoto(req.params.id, req.params.homeId, req.params.key, {
          originalName: f.originalname,
          storedName: f.filename,
          size: f.size,
          mimeType: f.mimetype,
        })
      );
      res.status(201).json(photos);
    });
  }));

  router.get('/projects/:id/homes/:homeId/commissioning/:key/photos/:photoId', wrap((req, res) => {
    const photo = store.getChecklistPhoto(req.params.id, req.params.homeId, req.params.key, req.params.photoId);
    const filePath = path.join(
      store.homeChecklistPhotoDir(req.params.id, req.params.homeId, req.params.key),
      photo.storedName
    );
    res.sendFile(filePath);
  }));

  router.delete('/projects/:id/homes/:homeId/commissioning/:key/photos/:photoId', wrap((req, res) => {
    const photo = store.deleteChecklistPhoto(req.params.id, req.params.homeId, req.params.key, req.params.photoId);
    const filePath = path.join(
      store.homeChecklistPhotoDir(req.params.id, req.params.homeId, req.params.key),
      photo.storedName
    );
    fs.rm(filePath, { force: true }, () => {});
    res.status(204).end();
  }));

  // ---- Per-home general notes ----
  router.post('/projects/:id/homes/:homeId/notes', wrap((req, res) => {
    const note = store.addHomeNote(req.params.id, req.params.homeId, (req.body || {}).content);
    res.status(201).json(note);
  }));

  router.patch('/projects/:id/homes/:homeId/notes/:noteId', wrap((req, res) => {
    const note = store.updateHomeNote(req.params.id, req.params.homeId, req.params.noteId, (req.body || {}).content);
    res.json(note);
  }));

  router.delete('/projects/:id/homes/:homeId/notes/:noteId', wrap((req, res) => {
    store.deleteHomeNote(req.params.id, req.params.homeId, req.params.noteId);
    res.status(204).end();
  }));

  // ---- Per-home outstanding items + dated action log ----
  router.post('/projects/:id/homes/:homeId/outstanding', wrap((req, res) => {
    const item = store.addOutstandingItem(req.params.id, req.params.homeId, (req.body || {}).description);
    res.status(201).json(item);
  }));

  router.patch('/projects/:id/homes/:homeId/outstanding/:itemId', wrap((req, res) => {
    const item = store.updateOutstandingItem(
      req.params.id,
      req.params.homeId,
      req.params.itemId,
      (req.body || {}).description
    );
    res.json(item);
  }));

  router.delete('/projects/:id/homes/:homeId/outstanding/:itemId', wrap((req, res) => {
    store.deleteOutstandingItem(req.params.id, req.params.homeId, req.params.itemId);
    res.status(204).end();
  }));

  router.post('/projects/:id/homes/:homeId/outstanding/:itemId/actions', wrap((req, res) => {
    const action = store.addOutstandingAction(req.params.id, req.params.homeId, req.params.itemId, req.body || {});
    res.status(201).json(action);
  }));

  router.delete('/projects/:id/homes/:homeId/outstanding/:itemId/actions/:actionId', wrap((req, res) => {
    store.deleteOutstandingAction(req.params.id, req.params.homeId, req.params.itemId, req.params.actionId);
    res.status(204).end();
  }));

  // ---- Per-home files (photos / plans) ----
  router.post('/projects/:id/homes/:homeId/files', wrap((req, res, next) => {
    homeFileUpload.array('files', 20)(req, res, (err) => {
      if (err) return next(err);
      const files = (req.files || []).map((f) =>
        store.addHomeFile(req.params.id, req.params.homeId, {
          originalName: f.originalname,
          storedName: f.filename,
          size: f.size,
          mimeType: f.mimetype,
        })
      );
      res.status(201).json(files);
    });
  }));

  router.get('/projects/:id/homes/:homeId/files/:fileId/download', wrap((req, res) => {
    const file = store.getHomeFile(req.params.id, req.params.homeId, req.params.fileId);
    const filePath = path.join(store.homeFilesDir(req.params.id, req.params.homeId), file.storedName);
    res.download(filePath, file.originalName);
  }));

  router.delete('/projects/:id/homes/:homeId/files/:fileId', wrap((req, res) => {
    const file = store.deleteHomeFile(req.params.id, req.params.homeId, req.params.fileId);
    const filePath = path.join(store.homeFilesDir(req.params.id, req.params.homeId), file.storedName);
    fs.rm(filePath, { force: true }, () => {});
    res.status(204).end();
  }));

  // ---- Per-home hours ----
  router.post('/projects/:id/homes/:homeId/hours', wrap((req, res) => {
    const entry = store.addHomeHoursEntry(req.params.id, req.params.homeId, req.body || {});
    res.status(201).json(entry);
  }));

  router.patch('/projects/:id/homes/:homeId/hours/:entryId', wrap((req, res) => {
    const entry = store.updateHomeHoursEntry(req.params.id, req.params.homeId, req.params.entryId, req.body || {});
    res.json(entry);
  }));

  router.delete('/projects/:id/homes/:homeId/hours/:entryId', wrap((req, res) => {
    store.deleteHomeHoursEntry(req.params.id, req.params.homeId, req.params.entryId);
    res.status(204).end();
  }));

  // ---- Aftersales tickets (project-level; homeId in the body is optional) ----
  router.post('/projects/:id/aftersales', wrap((req, res) => {
    const ticket = store.addAftersalesTicket(req.params.id, req.body || {});
    res.status(201).json(ticket);
  }));

  router.patch('/projects/:id/aftersales/:ticketId', wrap((req, res) => {
    const ticket = store.updateAftersalesTicket(req.params.id, req.params.ticketId, req.body || {});
    res.json(ticket);
  }));

  router.delete('/projects/:id/aftersales/:ticketId', wrap((req, res) => {
    store.deleteAftersalesTicket(req.params.id, req.params.ticketId);
    res.status(204).end();
  }));

  router.post('/projects/:id/aftersales/:ticketId/actions', wrap((req, res) => {
    const action = store.addAftersalesAction(req.params.id, req.params.ticketId, req.body || {});
    res.status(201).json(action);
  }));

  router.delete('/projects/:id/aftersales/:ticketId/actions/:actionId', wrap((req, res) => {
    store.deleteAftersalesAction(req.params.id, req.params.ticketId, req.params.actionId);
    res.status(204).end();
  }));

  return router;
}

module.exports = { buildApiRouter };
