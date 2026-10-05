const {
  setCors,
  handleOptions,
  sendJson,
  requirePost,
  validateOrigin,
  normalizePhone,
  initFirebaseAdmin
} = require('./_shared');

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : '';
}

function safeText(value, fallback, max = 120) {
  const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, max);
}

module.exports = async function sendPush(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (!requirePost(req, res) || !validateOrigin(req, res)) return;

  const idToken = bearerToken(req);
  if (!idToken) {
    return sendJson(res, 401, { ok: false, code: 'missing-auth', error: 'Login obrigatório.' });
  }

  const recipientPhone = normalizePhone(req.body && req.body.recipientPhone);
  if (!recipientPhone) {
    return sendJson(res, 400, { ok: false, code: 'invalid-recipient', error: 'Destinatário inválido.' });
  }

  try {
    const admin = initFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const senderUid = String(req.body?.senderUid || '');
    if (senderUid && senderUid !== decoded.uid) {
      return sendJson(res, 403, { ok: false, code: 'sender-mismatch', error: 'Remetente não confere.' });
    }

    const recipientDigits = recipientPhone.replace(/\D/g, '');
    const userSnap = await admin.firestore().collection('users').doc(recipientDigits).get();
    const data = userSnap.exists ? userSnap.data() : {};
    const tokenMap = data.fcmTokens || {};
    const tokens = Object.keys(tokenMap).filter(Boolean).slice(0, 20);

    if (!tokens.length) {
      return sendJson(res, 200, { ok: true, sent: 0, skipped: 'recipient-has-no-token' });
    }

    const senderName = safeText(req.body?.senderName, 'Nexo', 48);
    const body = safeText(req.body?.body, 'Nova mensagem no Nexo', 140);
    const chatId = safeText(req.body?.chatId, '', 140);
    const messageId = safeText(req.body?.messageId, '', 140);

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: senderName,
        body
      },
      data: {
        url: `/?chat=${encodeURIComponent(chatId)}`,
        chatId,
        messageId,
        type: 'message'
      },
      webpush: {
        fcmOptions: {
          link: `https://collicellilondon.github.io/nexo-app/?chat=${encodeURIComponent(chatId)}`
        },
        notification: {
          icon: '/nexo-app/nexo-icon-192.png',
          badge: '/nexo-app/nexo-icon-192.png',
          tag: chatId || 'nexo-message',
          renotify: true,
          requireInteraction: false
        }
      }
    });

    const staleTokens = [];
    response.responses.forEach((result, index) => {
      const code = result.error && result.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        staleTokens.push(tokens[index]);
      }
    });

    if (staleTokens.length) {
      const updates = {};
      staleTokens.forEach(token => {
        updates[`fcmTokens.${token}`] = admin.firestore.FieldValue.delete();
      });
      await userSnap.ref.update(updates).catch(() => {});
    }

    return sendJson(res, 200, {
      ok: true,
      sent: response.successCount,
      failed: response.failureCount,
      removed: staleTokens.length
    });
  } catch (error) {
    const status = error.code === 'missing-env' ? 500 : 400;
    return sendJson(res, status, {
      ok: false,
      code: error.code || 'push-failed',
      error: error.message || 'Falha ao enviar notificação.'
    });
  }
};
