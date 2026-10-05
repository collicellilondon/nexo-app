const admin = require('firebase-admin');

const defaultOrigins = [
  'https://collicellilondon.github.io',
  'http://localhost:4187',
  'http://127.0.0.1:4187'
];

function allowedOrigins() {
  return (process.env.NEXO_ALLOWED_ORIGINS || defaultOrigins.join(','))
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(req, res);
    res.status(204).end();
    return true;
  }
  return false;
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function requirePost(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, code: 'method-not-allowed', error: 'Use POST.' });
    return false;
  }
  return true;
}

function validateOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins().includes(origin)) return true;
  sendJson(res, 403, { ok: false, code: 'origin-not-allowed', error: 'Origem não autorizada.' });
  return false;
}

function normalizePhone(phone) {
  const value = String(phone || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(value)) {
    return null;
  }
  return value;
}

function requiredEnv(keys) {
  return keys.filter(key => !process.env[key]);
}

function twilioClient() {
  const missing = requiredEnv(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID']);
  if (missing.length) {
    const error = new Error(`Missing env vars: ${missing.join(', ')}`);
    error.code = 'missing-env';
    throw error;
  }
  const twilio = require('twilio');
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function initFirebaseAdmin() {
  if (admin.apps.length) return admin;
  const missing = requiredEnv(['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']);
  if (missing.length) {
    const error = new Error(`Missing env vars: ${missing.join(', ')}`);
    error.code = 'missing-env';
    throw error;
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
  return admin;
}

function firebaseUidForPhone(phone) {
  return `phone_${phone.replace(/\D/g, '')}`;
}

module.exports = {
  setCors,
  handleOptions,
  sendJson,
  requirePost,
  validateOrigin,
  normalizePhone,
  twilioClient,
  initFirebaseAdmin,
  firebaseUidForPhone
};
