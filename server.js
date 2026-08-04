const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');

const { loadEnv } = require('./src/loadEnv');
loadEnv();

const store = require('./src/store');
const { requireAuth, buildAuthRouter } = require('./src/auth');
const { buildApiRouter } = require('./src/routes');

store.load();

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// The Konec Showroom platform reverse-proxies this container at a sub-path
// and does NOT strip that prefix — every route, asset and redirect has to be
// served under it. Locally (no BASE_PATH set) this is '' and the app behaves
// exactly as if mounted at the root, same as before.
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[konec-pm] SESSION_SECRET not set — using a random secret for this run. ' +
      'Sessions will not survive a restart. Set SESSION_SECRET in your environment for production.'
  );
}

app.set('trust proxy', 1);
app.use(
  cookieSession({
    name: 'konec_session',
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: BASE_PATH || '/',
  })
);

// HTML pages get a <base href> injected at startup so every relative
// asset/API/link in them resolves under BASE_PATH, regardless of how deep
// the current page's URL is (e.g. /project/:id) or whether a trailing slash
// was present on the request.
function loadHtmlWithBase(filename) {
  const raw = fs.readFileSync(path.join(PUBLIC_DIR, filename), 'utf8');
  const baseTag = `<base href="${BASE_PATH}/" />`;
  return raw.replace('<head>', `<head>\n  ${baseTag}`);
}
const loginHtml = loadHtmlWithBase('login.html');
const indexHtml = loadHtmlWithBase('index.html');
const projectHtml = loadHtmlWithBase('project.html');

const router = express.Router();

// Static assets (CSS/JS/images) are not sensitive and are needed by the
// unauthenticated login page too, so they're served before the auth gate.
router.use('/css', express.static(path.join(PUBLIC_DIR, 'css')));
router.use('/js', express.static(path.join(PUBLIC_DIR, 'js')));
router.use('/img', express.static(path.join(PUBLIC_DIR, 'img')));

router.get('/login', (req, res) => {
  res.type('html').send(loginHtml);
});
router.use(buildAuthRouter());

router.get('/health', (req, res) => res.json({ ok: true }));

// Everything below this line requires a logged-in session.
router.use(requireAuth);

router.use('/api', buildApiRouter());

router.get('/', (req, res) => {
  res.type('html').send(indexHtml);
});
router.get('/project/:id', (req, res) => {
  res.type('html').send(projectHtml);
});

if (BASE_PATH) {
  app.use(BASE_PATH, router);
} else {
  app.use(router);
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Konec Project Management running on port ${PORT}${BASE_PATH ? ` (base path ${BASE_PATH})` : ''}`);
});
