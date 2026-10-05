const {
  setCors,
  handleOptions,
  sendJson,
  requirePost,
  validateOrigin,
  normalizePhone,
  twilioClient,
  initFirebaseAdmin,
  firebaseUidForPhone
} = require('./_shared');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requirePost(req, res) || !validateOrigin(req, res)) return;

  const phone = normalizePhone(req.body && req.body.phone);
  const code = String((req.body && req.body.code) || '').replace(/\D/g, '');
  if (!phone) {
    return sendJson(res, 400, { ok: false, code: 'invalid-phone', error: 'Telefone inválido.' });
  }
  if (!/^\d{4,10}$/.test(code)) {
    return sendJson(res, 400, { ok: false, code: 'invalid-code', error: 'Código inválido.' });
  }

  try {
    const client = twilioClient();
    const check = await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks
      .create({ to: phone, code });

    if (check.status !== 'approved') {
      return sendJson(res, 401, { ok: false, code: 'invalid-code', error: 'Código incorreto ou expirado.' });
    }

    const firebase = initFirebaseAdmin();
    const customToken = await firebase.auth().createCustomToken(firebaseUidForPhone(phone), {
      phone_number: phone,
      provider: 'twilio-verify',
      brand: 'NexoApp'
    });

    return sendJson(res, 200, { ok: true, customToken });
  } catch (error) {
    const code = error.code || 'verification-failed';
    const status = code === 'missing-env' ? 500 : 400;
    return sendJson(res, status, { ok: false, code, error: error.message || 'Falha ao verificar SMS.' });
  }
};
