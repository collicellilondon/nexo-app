const {
  setCors,
  handleOptions,
  sendJson,
  requirePost,
  validateOrigin,
  normalizePhone,
  initFirebaseAdmin
} = require('./_shared');

module.exports = async function contactsLookup(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requirePost(req, res) || !validateOrigin(req, res)) return;

  try {
    const phones = Array.isArray(req.body?.phones) ? req.body.phones : [];
    const uniquePhones = [...new Set(phones.map(normalizePhone).filter(Boolean))].slice(0, 50);
    if (!uniquePhones.length) {
      sendJson(res, 400, { ok: false, code: 'invalid-phones', error: 'Envie telefones em formato E.164.' });
      return;
    }

    const admin = initFirebaseAdmin();
    const checks = await Promise.all(uniquePhones.map(async phone => {
      try {
        await admin.auth().getUserByPhoneNumber(phone);
        return phone;
      } catch (err) {
        if (err?.code === 'auth/user-not-found') return null;
        throw err;
      }
    }));

    sendJson(res, 200, {
      ok: true,
      registeredPhones: checks.filter(Boolean)
    });
  } catch (err) {
    const status = err.code === 'missing-env' ? 500 : 400;
    sendJson(res, status, {
      ok: false,
      code: err.code || 'contacts-lookup-failed',
      error: err.message || 'Não foi possível verificar contatos.'
    });
  }
};
