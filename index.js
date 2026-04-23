/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║          MEZUKA MD — PAIR + FULL WEB SERVER                      ║
 * ║                                                                  ║
 * ║  ✅ /code          → Pair Code  → MongoDB Save                   ║
 * ║  ✅ /api/qr        → QR Scan    → MongoDB Save                   ║
 * ║  ✅ All HTML Pages                                               ║
 * ║  ✅ Settings / AutoReply / Scheduled / React / Newsletter APIs   ║
 * ║  ❌ Bot connect / Session load / Commands — කිසිම දෙයක් නෑ        ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

require('dotenv').config({ path: './config.env' });

const express = require('express');
const path    = require('path');
const crypto  = require('crypto');
const { MongoClient } = require('mongodb');
const config  = require('./config');

// ─── ENV ──────────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const PORT        = process.env.PORT || 8002;

// ─── MongoDB ──────────────────────────────────────────────────────────────────
const mainClient = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
const arClient   = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });

async function getMainCol() {
  try { await mainClient.connect(); } catch (e) {
    if (!e.message.includes('already been connected')) throw e;
  }
  return mainClient.db('MEZUKADB').collection(config.NENO_DATA);
}

let arDB = null;
async function getArCol(colName) {
  try { await arClient.connect(); } catch (e) {
    if (!e.message.includes('already been connected')) throw e;
  }
  if (!arDB) arDB = arClient.db('MEZUKADB');
  return arDB.collection(colName);
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!global.QR_SESSIONS) global.QR_SESSIONS = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// DB HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function readEnv(ownerNumber) {
  const col = await getMainCol();
  const doc = await col.findOne({ ownerNumber });
  return doc?.settings || {};
}

async function updateEnv(ownerNumber, key, value) {
  const col = await getMainCol();
  await col.updateOne(
    { ownerNumber },
    { $set: { [`settings.${key}`]: value, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function getPassword(ownerNumber) {
  const col = await getMainCol();
  const doc = await col.findOne({ ownerNumber });
  return doc?.password || null;
}

async function signupReactUser(ownerNumber, username, password) {
  const col = await getArCol('react_users');
  let user = await col.findOne({ ownerNumber });
  if (user) {
    if (user.password !== password.toUpperCase()) return { ok: false, error: 'Wrong password' };
    return { ok: true, username: user.username, coins: user.coins, isNew: false };
  }
  await col.insertOne({ ownerNumber, username, password: password.toUpperCase(), coins: 100, createdAt: new Date() });
  return { ok: true, username, coins: 100, isNew: true };
}

async function getReactUserInfo(ownerNumber) {
  const col = await getArCol('react_users');
  const user = await col.findOne({ ownerNumber });
  if (!user) return { coins: 0, username: 'Unknown' };
  return { coins: user.coins || 0, username: user.username || 'User' };
}

async function deductReactCoins(ownerNumber, amount) {
  const col = await getArCol('react_users');
  const user = await col.findOne({ ownerNumber });
  if (!user || (user.coins || 0) < amount) return false;
  await col.updateOne({ ownerNumber }, { $inc: { coins: -amount } });
  return true;
}

async function claimDailyCoins(ownerNumber) {
  const col = await getArCol('react_users');
  const user = await col.findOne({ ownerNumber });
  if (!user) return { ok: false, error: 'User not found' };
  const now = new Date();
  const last = user.lastClaim ? new Date(user.lastClaim) : null;
  if (last && (now - last) / (1000 * 60 * 60) < 24) {
    const remaining = Math.ceil(24 - (now - last) / (1000 * 60 * 60));
    return { ok: false, error: `Next claim in ${remaining} hours` };
  }
  await col.updateOne({ ownerNumber }, { $inc: { coins: 50 }, $set: { lastClaim: now } });
  return { ok: true, coinsAdded: 50, totalCoins: (user.coins || 0) + 50 };
}

async function redeemCode(ownerNumber, code) {
  const codesCol = await getArCol('redeem_codes');
  const codeDoc = await codesCol.findOne({ code });
  if (!codeDoc) return { ok: false, error: 'Invalid code' };
  if (codeDoc.usedBy?.includes(ownerNumber)) return { ok: false, error: 'Already redeemed' };
  if (codeDoc.maxUses && (codeDoc.usedBy || []).length >= codeDoc.maxUses) return { ok: false, error: 'Code expired' };
  const usersCol = await getArCol('react_users');
  await usersCol.updateOne({ ownerNumber }, { $inc: { coins: codeDoc.coins || 0 } });
  await codesCol.updateOne({ code }, { $push: { usedBy: ownerNumber } });
  return { ok: true, coinsAdded: codeDoc.coins || 0 };
}

async function checkAuth(number, password) {
  if (!number || !password) return null;
  const sanitized = number.replace(/[^0-9]/g, '');
  const saved = await getPassword(sanitized);
  if (!saved || saved !== password.toUpperCase()) return null;
  return sanitized;
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION SAVE — MongoDB only, bot connect නෑ
// ─────────────────────────────────────────────────────────────────────────────

async function saveSessionToMongo(ownerNumber, sessionFolder) {
  const fse = require('fs-extra');
  const sessionData = {};
  const files = await fse.readdir(sessionFolder);
  for (const file of files) {
    try {
      const raw = await fse.readFile(path.join(sessionFolder, file), 'utf8');
      sessionData[file] = JSON.parse(raw);
    } catch (_) {}
  }
  const credsData = sessionData['creds.json'] || {};
  const col = await getMainCol();
  await col.updateOne(
    { ownerNumber },
    { $set: { ownerNumber, sid: credsData, sessionFiles: sessionData, updatedAt: new Date() } },
    { upsert: true }
  );
  console.log(`💾 [PAIR] Saved to MongoDB ✅ | ${ownerNumber} | ${Object.keys(sessionData).length} files`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML PAGES
// ─────────────────────────────────────────────────────────────────────────────

const HTML = (name) => (req, res) =>
  res.sendFile(path.join(__dirname, 'mezuka', name));

app.get('/',              HTML('main.html'));
app.get('/home',          HTML('main.html'));
app.get('/main.html',     HTML('main.html'));
app.get('/pair',          HTML('pair.html'));
app.get('/pair.html',     HTML('pair.html'));
app.get('/settings',      HTML('settings.html'));
app.get('/settings.html', HTML('settings.html'));
app.get('/shop',          HTML('shop.html'));
app.get('/shop.html',     HTML('shop.html'));
app.get('/react',         HTML('react.html'));
app.get('/react.html',    HTML('react.html'));
app.get('/team.html',     HTML('team.html'));
app.get('/contact.html',  HTML('contact.html'));
app.get('/tharidu.html',  HTML('tharidu.html'));
app.get('/image.js',      (req, res) => res.sendFile(path.join(__dirname, 'image.js')));

app.get('/ping', (req, res) =>
  res.json({ status: 'alive', uptime: process.uptime() }));

// ─────────────────────────────────────────────────────────────────────────────
// /code  — Pair Code  (ඔයාගේ original working code — bot connect parts only remove)
// ─────────────────────────────────────────────────────────────────────────────

app.get('/code', async (req, res) => {
  const { number } = req.query;

  if (!number) {
    return res.status(400).json({ error: 'Number parameter is required. Usage: /code?number=94712345678' });
  }

  const sanitizedNumber = number.replace(/[^0-9]/g, '');

  if (!sanitizedNumber || sanitizedNumber.length < 7) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  console.log(`📞 Pairing code requested for ${sanitizedNumber}`);

  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      makeCacheableSignalKeyStore,
      delay: waDelay
    } = require('@whiskeysockets/baileys');
    const P = require('pino');
    const fse = require('fs-extra');

    const sessionFolder = path.join(__dirname, 'auth_info_baileys', sanitizedNumber);
    await fse.ensureDir(sessionFolder);

    // Delete old creds if exist (fresh pairing)
    const credsFile = path.join(sessionFolder, 'creds.json');
    if (fse.existsSync(credsFile)) {
      await fse.remove(credsFile);
      console.log(`🗑️ Cleared old creds for ${sanitizedNumber}`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const logger = P({ level: 'silent' });

    const pairSocket = makeWASocket({
      version: [2, 3000, 1033105955],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    pairSocket.ev.on('creds.update', saveCreds);

    pairSocket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`✅ Pairing successful for ${sanitizedNumber}`);

        try {
          // Save full session (creds + all signal keys) to MongoDB
          const sessionData = {};
          const sessionFiles = await fse.readdir(sessionFolder);
          for (const file of sessionFiles) {
            try {
              const content = await fse.readFile(path.join(sessionFolder, file), 'utf8');
              sessionData[file] = JSON.parse(content);
            } catch(e) {}
          }
          const credsData = sessionData['creds.json'] || {};

          const col = await getMainCol();
          await col.updateOne(
            { ownerNumber: sanitizedNumber },
            { $set: { ownerNumber: sanitizedNumber, sid: credsData, sessionFiles: sessionData, updatedAt: new Date() } },
            { upsert: true }
          );

          console.log(`💾 Session saved to MongoDB for ${sanitizedNumber} (${Object.keys(sessionData).length} files)`);

        } catch (saveErr) {
          console.error(`❌ Failed to save session to MongoDB:`, saveErr.message);
        }

        // ❌ connectToWA නෑ — socket close කරනවා විතරයි
        try { pairSocket.ws.close(); } catch(e) {}
      }

      if (connection === 'close') {
        const statusCode = new (require('@hapi/boom').Boom)(lastDisconnect?.error)?.output?.statusCode;
        console.log(`⚠️ PairSocket closed for ${sanitizedNumber}, code: ${statusCode}`);
        // ❌ reconnect නෑ, bot start නෑ
      }
    });

    // Request pairing code — original exact logic
    if (!pairSocket.authState.creds.registered) {
      let code;
      let retries = 5;
      while (retries > 0) {
        try {
          await waDelay(1500);
          code = await pairSocket.requestPairingCode(sanitizedNumber);
          break;
        } catch (err) {
          retries--;
          if (retries === 0) throw err;
          await waDelay(2000);
        }
      }

      const formattedCode = code ? code.match(/.{1,4}/g)?.join('-') : code;
      console.log(`📋 Pairing code for ${sanitizedNumber}: ${formattedCode}`);

      if (!res.headersSent) {
        return res.json({
          status: 'success',
          number: sanitizedNumber,
          code: formattedCode,
          message: `WhatsApp > Linked Devices > Link a Device > Enter Code`
        });
      }
    } else {
      // Already registered — ❌ connectToWA නෑ
      if (!res.headersSent) {
        return res.json({
          status: 'already_registered',
          message: 'Number already has a session.',
          number: sanitizedNumber
        });
      }
    }

  } catch (err) {
    console.error(`❌ Pairing error for ${sanitizedNumber}:`, err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Failed to generate pairing code',
        message: err.message || 'Unknown error',
        number: sanitizedNumber
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/qr  — QR Route
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/qr', async (req, res) => {
  const sessionId = 'qr_' + Date.now();
  console.log(`📱 [PAIR] QR session: ${sessionId}`);

  global.QR_SESSIONS.set(sessionId, { qr: null, status: 'pending', number: null, updatedAt: Date.now() });
  res.json({ status: 'pending', sessionId, message: 'Poll /api/qr/poll?sessionId=' + sessionId });

  const SESSION_TIMEOUT = setTimeout(() => {
    const sess = global.QR_SESSIONS.get(sessionId);
    if (sess && sess.status === 'pending') {
      global.QR_SESSIONS.set(sessionId, { ...sess, status: 'expired', updatedAt: Date.now() });
      setTimeout(() => global.QR_SESSIONS.delete(sessionId), 30000);
    }
  }, 3 * 60 * 1000);

  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      makeCacheableSignalKeyStore
    } = require('@whiskeysockets/baileys');
    const P   = require('pino');
    const fse = require('fs-extra');

    const sessionFolder = path.join(__dirname, 'auth_info_baileys', sessionId);
    await fse.ensureDir(sessionFolder);

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const logger = P({ level: 'silent' });

    const pairSocket = makeWASocket({
      version: [2, 3000, 1033105955],
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ['Ubuntu', 'Chrome', '20.0.04'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
    });

    pairSocket.ev.on('creds.update', saveCreds);

    pairSocket.ev.on('connection.update', async (update) => {
      const { connection, qr } = update;

      if (qr) {
        global.QR_SESSIONS.set(sessionId, { qr, status: 'pending', number: null, updatedAt: Date.now() });
        console.log(`🔄 [PAIR] QR updated: ${sessionId}`);
      }

      if (connection === 'open') {
        const actualNumber = pairSocket.user.id.split(':')[0];
        console.log(`✅ [PAIR] QR success: ${actualNumber}`);

        clearTimeout(SESSION_TIMEOUT);
        global.QR_SESSIONS.set(sessionId, { qr: null, status: 'success', number: actualNumber, updatedAt: Date.now() });
        setTimeout(() => global.QR_SESSIONS.delete(sessionId), 60000);

        try {
          const newFolder = path.join(__dirname, 'auth_info_baileys', actualNumber);
          if (fse.existsSync(newFolder)) await fse.remove(newFolder);
          await fse.copy(sessionFolder, newFolder);
          await fse.remove(sessionFolder);
          await saveSessionToMongo(actualNumber, newFolder);
        } catch (e) {
          console.error(`❌ [PAIR] QR MongoDB save failed: ${e.message}`);
        }

        try { pairSocket.ws.close(); } catch (_) {}
      }

      if (connection === 'close') {
        const sess = global.QR_SESSIONS.get(sessionId);
        if (sess && sess.status === 'pending') {
          global.QR_SESSIONS.set(sessionId, { ...sess, status: 'failed', updatedAt: Date.now() });
          clearTimeout(SESSION_TIMEOUT);
          setTimeout(() => {
            global.QR_SESSIONS.delete(sessionId);
            try { fse.remove(sessionFolder); } catch (_) {}
          }, 30000);
        }
        try { pairSocket.ws.close(); } catch (_) {}
      }
    });

  } catch (err) {
    console.error(`❌ [PAIR] QR error:`, err.message);
    global.QR_SESSIONS.set(sessionId, { qr: null, status: 'failed', number: null, updatedAt: Date.now() });
  }
});

app.get('/api/qr/poll', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.json({ status: 'failed', error: 'No sessionId' });
  const sess = global.QR_SESSIONS.get(sessionId);
  if (!sess) return res.json({ status: 'failed', error: 'Session not found or expired' });
  return res.json({ status: sess.status, qr: sess.qr || null, number: sess.number || null, updatedAt: sess.updatedAt });
});

app.get('/api/qr/status', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.json({ status: 'pending' });
  const sess = global.QR_SESSIONS.get(sessionId);
  if (!sess) return res.json({ status: 'success' });
  if (sess.status === 'success') return res.json({ status: 'success', number: sess.number });
  return res.json({ status: 'pending' });
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS API
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/settings/login', async (req, res) => {
  try {
    const { number, password } = req.body;
    if (!number || !password) return res.status(400).json({ ok: false, error: 'Missing fields' });
    const sanitized = number.replace(/[^0-9]/g, '');
    const saved = await getPassword(sanitized);
    if (!saved || saved !== password.toUpperCase())
      return res.status(401).json({ ok: false, error: 'Invalid number or password' });
    res.json({ ok: true, number: sanitized });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/settings/get', async (req, res) => {
  try {
    const san = await checkAuth(req.body.number, req.body.password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const settings = await readEnv(san);
    res.json({ ok: true, settings });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/settings/update', async (req, res) => {
  try {
    const { number, password, key, value } = req.body;
    if (!key) return res.status(400).json({ ok: false, error: 'Missing key' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await updateEnv(san, key, value);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO REPLY API
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/autoreply/list', async (req, res) => {
  try {
    const san = await checkAuth(req.body.number, req.body.password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const col = await getArCol('auto_replies');
    const replies = await col.find({ sessionNumber: san }).toArray();
    res.json({ ok: true, replies: replies.map(d => ({ trigger: d.trigger, response: d.response, enabled: d.enabled })), enabled: replies[0]?.enabled ?? true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/autoreply/add', async (req, res) => {
  try {
    const { number, password, trigger, response } = req.body;
    if (!trigger || !response) return res.status(400).json({ ok: false, error: 'trigger and response required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const col = await getArCol('auto_replies');
    if (await col.countDocuments({ sessionNumber: san }) >= 20)
      return res.status(400).json({ ok: false, error: 'Maximum 20 auto-replies allowed' });
    try {
      await col.insertOne({ sessionNumber: san, trigger: trigger.toLowerCase().trim(), response, enabled: true, createdAt: new Date() });
      res.json({ ok: true });
    } catch (e) {
      if (e.code === 11000) return res.status(400).json({ ok: false, error: 'Trigger already exists' });
      throw e;
    }
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/autoreply/delete', async (req, res) => {
  try {
    const { number, password, trigger } = req.body;
    if (!trigger) return res.status(400).json({ ok: false, error: 'trigger required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const col = await getArCol('auto_replies');
    await col.deleteOne({ sessionNumber: san, trigger: trigger.toLowerCase().trim() });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/autoreply/toggle', async (req, res) => {
  try {
    const { number, password, enabled } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await (await getArCol('auto_replies')).updateMany({ sessionNumber: san }, { $set: { enabled } });
    res.json({ ok: true, message: `Auto reply ${enabled ? 'ON' : 'OFF'}` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULED MESSAGES API
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/scheduled/list', async (req, res) => {
  try {
    const san = await checkAuth(req.body.number, req.body.password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const col = await getArCol('scheduled_messages');
    const msgs = await col.find({ sessionNumber: san }).toArray();
    res.json({ ok: true, messages: msgs.map(d => ({ id: d.id, recipientName: d.recipientName, recipientNumber: d.recipientNumber, message: d.message, day: d.day, time: d.time, enabled: d.enabled, lastSent: d.lastSent })), enabled: msgs[0]?.enabled ?? true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/scheduled/add', async (req, res) => {
  try {
    const { number, password, recipientNumber, recipientName, day, time, message } = req.body;
    if (!recipientNumber || !day || !time || !message)
      return res.status(400).json({ ok: false, error: 'recipientNumber, day, time, message required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const col = await getArCol('scheduled_messages');
    if (await col.countDocuments({ sessionNumber: san }) >= 20)
      return res.status(400).json({ ok: false, error: 'Maximum 20 allowed' });
    const id = crypto.randomBytes(8).toString('hex');
    await col.insertOne({ sessionNumber: san, id, recipientName: recipientName || null, recipientNumber: recipientNumber.replace(/[^0-9]/g, ''), message, day: day.toLowerCase(), time, enabled: true, createdAt: new Date(), lastSent: null });
    res.json({ ok: true, id });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/scheduled/delete', async (req, res) => {
  try {
    const { number, password, id } = req.body;
    if (!id) return res.status(400).json({ ok: false, error: 'id required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await (await getArCol('scheduled_messages')).deleteOne({ sessionNumber: san, id });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/scheduled/toggle', async (req, res) => {
  try {
    const { number, password, enabled } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await (await getArCol('scheduled_messages')).updateMany({ sessionNumber: san }, { $set: { enabled } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// REACT PANEL API
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/react/auth', async (req, res) => {
  try {
    const { number, username, password } = req.body;
    if (!number || !password) return res.status(400).json({ ok: false, error: 'Missing fields' });
    const result = await signupReactUser(number.replace(/[^0-9]/g, ''), username || 'User', password);
    if (!result.ok) return res.status(401).json(result);
    res.json(result);
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/react/user', async (req, res) => {
  try {
    const san = await checkAuth(req.body.number, req.body.password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    res.json({ ok: true, ...(await getReactUserInfo(san)) });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/react/add-task', async (req, res) => {
  try {
    const { number, password, jid, emojis, days } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    if (!jid || !days) return res.status(400).json({ ok: false, error: 'jid and days required' });
    if (!await deductReactCoins(san, parseInt(days) * 10))
      return res.status(400).json({ ok: false, error: 'Insufficient coins' });
    let targetJid = jid.trim();
    if (targetJid.includes('whatsapp.com/channel/'))
      targetJid = targetJid.split('channel/')[1].split('/')[0].split('?')[0] + '@newsletter';
    else if (!targetJid.includes('@'))
      targetJid = targetJid + '@newsletter';
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + parseInt(days));
    const emojiArray = emojis ? emojis.split(',').map(e => e.trim()).filter(Boolean) : [];
    const col = await getArCol('newsletter_reacts');
    await col.updateOne({ jid: targetJid, ownerNumber: san }, { $set: { jid: targetJid, ownerNumber: san, emojis: emojiArray, expiryDate: expiry, createdAt: new Date() } }, { upsert: true });
    res.json({ ok: true, expiry });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/react/list-tasks', async (req, res) => {
  try {
    const san = await checkAuth(req.body.number, req.body.password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const tasks = await (await getArCol('newsletter_reacts')).find({ ownerNumber: san }).toArray();
    res.json({ ok: true, tasks });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/react/daily-claim', async (req, res) => {
  try {
    const san = await checkAuth(req.body.number, req.body.password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    res.json(await claimDailyCoins(san));
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/react/redeem', async (req, res) => {
  try {
    const { number, password, code } = req.body;
    if (!code) return res.status(400).json({ ok: false, error: 'Code required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    res.json(await redeemCode(san, code.trim().toUpperCase()));
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP SETTINGS API
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_KEYS = ['ANTI_LINK','ANTI_LINK_ACTION','ANTI_LINK_MSG','ANTI_BAD','ANTI_BAD_ACTION','ANTI_BAD_MSG','BAD_WORDS','WELCOME','WELCOME_MSG','GOODBYE','GOODBYE_MSG'];

app.post('/api/group/get', async (req, res) => {
  try {
    const san = await checkAuth(req.body.number, req.body.password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const settings = await readEnv(san);
    const groupSettings = {};
    GROUP_KEYS.forEach(k => { groupSettings[k] = settings[k] ?? ''; });
    res.json({ ok: true, settings: groupSettings });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/group/update', async (req, res) => {
  try {
    const { number, password, key, value } = req.body;
    if (!GROUP_KEYS.includes(key)) return res.status(400).json({ ok: false, error: 'Invalid key' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await updateEnv(san, key, value);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// NEWSLETTER CHANNEL API
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/newsletter/add', async (req, res) => {
  try {
    const { number, password, jid } = req.body;
    if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    let targetJid = jid.trim();
    if (targetJid.includes('whatsapp.com/channel/'))
      targetJid = targetJid.split('channel/')[1].split('/')[0].split('?')[0] + '@newsletter';
    else if (!targetJid.includes('@'))
      targetJid = targetJid + '@newsletter';
    const col = await getArCol('newsletter_channels');
    await col.updateOne({ ownerNumber: san, jid: targetJid }, { $set: { ownerNumber: san, jid: targetJid, addedAt: new Date() } }, { upsert: true });
    res.json({ ok: true, jid: targetJid });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/newsletter/list', async (req, res) => {
  try {
    const san = await checkAuth(req.body.number, req.body.password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const channels = await (await getArCol('newsletter_channels')).find({ ownerNumber: san }).toArray();
    res.json({ ok: true, channels: channels.map(c => ({ jid: c.jid, addedAt: c.addedAt })) });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/newsletter/delete', async (req, res) => {
  try {
    const { number, password, jid } = req.body;
    if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await (await getArCol('newsletter_channels')).deleteOne({ ownerNumber: san, jid: jid.trim() });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAT PROXY (NVIDIA)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  try {
    const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + NVIDIA_API_KEY },
      body: JSON.stringify(req.body)
    });
    if (!response.ok) return res.status(response.status).json({ error: await response.text() });
    res.json(await response.json());
  } catch (err) { res.status(500).json({ error: 'Chat proxy failed: ' + err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SESSIONS STATUS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/sessions', async (req, res) => {
  try {
    const col = await getMainCol();
    const docs = await col.find({}, { projection: { ownerNumber: 1, updatedAt: 1 } }).toArray();
    res.json({ ok: true, sessions: docs.map(d => ({ number: d.ownerNumber, status: 'saved', updatedAt: d.updatedAt })), count: docs.length });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   MEZUKA MD PAIR SERVER — PORT ${PORT}      ║`);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║  /code?number=       → Pair Code         ║`);
  console.log(`║  /api/qr             → QR Scan           ║`);
  console.log(`║  All web pages & APIs → Active           ║`);
  console.log(`║  ❌ Bot connect       → Disabled          ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
});

