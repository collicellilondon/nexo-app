const {
  setCors,
  handleOptions,
  sendJson,
  requirePost,
  validateOrigin,
  normalizePhone,
  twilioClient
} = require('./_shared');

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requirePost(req, res) || !validateOrigin(req, res)) return;

  const phone = normalizePhone(req.body && req.body.phone);
  if (!phone) {
    return sendJson(res, 400, { ok: false, code: 'invalid-phone', error: 'Telefone inválido.' });
  }

  try {
    const client = twilioClient();
    await client.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications
      .create({ to: phone, channel: 'sms' });

    return sendJson(res, 200, { ok: true, channel: 'sms', brand: 'NexoApp' });
  } catch (error) {
    const code = error.code || 'verification-failed';
    const status = code === 'missing-env' ? 500 : 400;
    return sendJson(res, status, { ok: false, code, error: error.message || 'Falha ao enviar SMS.' });
  }
};
