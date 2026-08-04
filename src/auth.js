const crypto = require('crypto');
const express = require('express');

function checkPassword(candidate) {
  const expected = process.env.APP_PASSWORD || 'konec';
  const a = crypto.createHash('sha256').update(String(candidate ?? '')).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

// req.baseUrl is whatever prefix Express matched to reach this router (e.g.
// BASE_PATH in production, '' for local dev) — using it instead of a
// hardcoded leading slash keeps redirects correct under either mount.
function requireAuth(req, res, next) {
  if (req.session && req.session.authed) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.redirect(`${req.baseUrl}/login`);
}

function buildAuthRouter() {
  const router = express.Router();

  router.post('/login', express.urlencoded({ extended: false }), (req, res) => {
    const { password } = req.body || {};
    if (checkPassword(password)) {
      req.session.authed = true;
      return res.redirect(`${req.baseUrl}/`);
    }
    return res.redirect(`${req.baseUrl}/login?error=1`);
  });

  router.post('/logout', (req, res) => {
    req.session = null;
    res.redirect(`${req.baseUrl}/login`);
  });

  return router;
}

module.exports = { requireAuth, buildAuthRouter, checkPassword };
