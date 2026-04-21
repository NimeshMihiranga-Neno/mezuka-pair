require('dotenv').config({ path: './config.env' });
const path = require('path');
const config = require('./config');
const { MongoClient } = require('mongodb');
const { updateList, readEnv, defEnv, updateEnv, loadSettings, dpchange, savePassword, getPassword, signupReactUser, getReactUserInfo, deductReactCoins, claimDailyCoins, redeemCode } = require('./database');
const { registerCommentRoutes } = require('./comment');
// main.js removed — stubs defined below

// =============================================
// CONNECT TO WA + SEND WELCOME MESSAGE
// =============================================
const connectToWA = async (ownerNumber, sessionFolder) => {
  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      makeCacheableSignalKeyStore,
      DisconnectReason
    } = require('@whiskeysockets/baileys');
    const P = require('pino');

    if (!global.WA_SESSIONS) global.WA_SESSIONS = new Map();

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    const logger = P({ level: 'silent' });

    const sock = makeWASocket({
      version: [2, 3000, 1033105955],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    global.WA_SESSIONS.set(ownerNumber, sock);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        console.log(`✅ Bot connected: ${ownerNumber}`);

        try {
          // Password eka database eken gannawa
          const password = await getPassword(ownerNumber) || 'N/A';
          const jid = ownerNumber + '@s.whatsapp.net';

          const caption =
`╭━━━〔 🌹⃝⃘ 𝑴𝑬𝒁𝑼𝑲𝑨 𝑴𝑫 𝑽4 🧚 〕━━━╮
┃ ✨ System Status : ONLINE
╰━━━━━━━━━━━━━━━━━━━━━━━━╯

┊ ┊ ✫ ˚♡ ⋆｡ ❀
┊ ☪︎⋆

🟢  *BOT CONNECTED SUCCESSFULLY!*

╔══════════════════════╗
║ 📱 *Number :* ${ownerNumber}
║ 🤖 *Bot :* Mezuka MD V4
║ 👑 *Owner :* Nimeshka Mihiran
║ 🏴 *Team :* Black Cat Ofc
╚══════════════════════╝

🔐 *Settings Password :* \`${password}\`
🌐 *Settings Panel :* https://mezukamd.kozow.com/

> ★彡 𝒩𝒾𝓂𝑒𝓈𝒽𝓀𝒶 𝑀𝒾𝒽𝒾𝓇𝒶𝓃 🧃🌸 彡★`;

          await sock.sendMessage(jid, {
            image: { url: 'https://files.catbox.moe/lt36jy.jpg' },
            caption: caption,
            contextInfo: {
              forwardingScore: 1000,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: '120363424190766692@newsletter',
                newsletterName: 'ᴍᴇᴢᴜᴋᴀ ᴍᴅ ʟɪᴛᴇ',
                serverMessageId: 1
              }
            }
          });

          console.log(`📩 Welcome message sent to ${ownerNumber}`);
        } catch (msgErr) {
          console.error(`❌ Welcome message error:`, msgErr.message);
        }
      }

      if (connection === 'close') {
        const statusCode = new (require('@hapi/boom').Boom)(lastDisconnect?.error)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        console.log(`⚠️ Connection closed for ${ownerNumber}, code: ${statusCode}`);
        global.WA_SESSIONS.delete(ownerNumber);
        if (!loggedOut) {
          console.log(`🔄 Reconnecting ${ownerNumber}...`);
          setTimeout(() => connectToWA(ownerNumber, sessionFolder), 5000);
        }
      }
    });

  } catch (err) {
    console.error(`❌ connectToWA error for ${ownerNumber}:`, err.message);
    setTimeout(() => connectToWA(ownerNumber, sessionFolder), 10000);
  }
};
const getArDB = () => ({ collection: () => ({ find: () => ({ toArray: async () => [] }), findOne: async () => null, updateOne: async () => {}, countDocuments: async () => 0 }) });
const newsletterReactCache = new Map();
const addAutoReply = async () => {};
const deleteAutoReply = async () => {};
const listAutoReplies = async () => [];
const toggleAutoReply = async () => {};
const getAutoReplyStatus = async () => false;
const addScheduledMessage = async () => {};
const deleteScheduledMessage = async () => {};
const listScheduledMessages = async () => [];
const toggleScheduledMessages = async () => {};
const getScheduledMessagesStatus = async () => false;

// MongoDB URI — ENV variable use karanna
const MAIN_MONGO_URI = process.env.MONGODB_URI || 'mongodb://example';

// MongoDB client (sessions save karanna)
const client = new MongoClient(MAIN_MONGO_URI, { maxPoolSize: 3 });

// =============================================
// MULTI-DB SESSION HELPER
// MEZUKADB → 0-149, MEZUKADB-1 → 150-299, etc.
// =============================================
const SESSION_DB_LIMIT = 150;

// DB name eka get karanna — session count balala decide karanna
async function getSessionDbName() {
  try {
    await client.connect().catch(() => {});
    let index = 0;
    while (true) {
      const dbName = index === 0 ? 'MEZUKADB' : `MEZUKADB-${index}`;
      const col = client.db(dbName).collection(`${config.NENO_DATA}`);
      const count = await col.countDocuments();
      if (count < SESSION_DB_LIMIT) {
        return dbName;
      }
      index++;
    }
  } catch (e) {
    console.error('❌ getSessionDbName error:', e.message);
    return 'MEZUKADB'; // fallback
  }
}

// Owener number eken session thibena DB eka find karanna
async function findSessionDbName(ownerNumber) {
  try {
    await client.connect().catch(() => {});
    let index = 0;
    while (true) {
      const dbName = index === 0 ? 'MEZUKADB' : `MEZUKADB-${index}`;
      const col = client.db(dbName).collection(`${config.NENO_DATA}`);
      const count = await col.countDocuments();
      // DB eka empty nam (0 documents) meka tibena range pass una kiyala
      if (count === 0 && index > 0) return null;
      const doc = await col.findOne({ ownerNumber });
      if (doc) return dbName;
      // DB eka SESSION_DB_LIMIT ta wada nam next check karanna
      if (count < SESSION_DB_LIMIT) return null; // not found in any active db
      index++;
    }
  } catch (e) {
    console.error('❌ findSessionDbName error:', e.message);
    return null;
  }
}

// All DBs walata total session count — BOT_LIMIT check karanna
async function getTotalSessionCount() {
  try {
    await client.connect().catch(() => {});
    let total = 0;
    let index = 0;
    while (true) {
      const dbName = index === 0 ? 'MEZUKADB' : `MEZUKADB-${index}`;
      const col = client.db(dbName).collection(`${config.NENO_DATA}`);
      const count = await col.countDocuments();
      if (count === 0 && index > 0) break;
      total += count;
      if (count < SESSION_DB_LIMIT) break;
      index++;
    }
    return total;
  } catch (e) {
    console.error('❌ getTotalSessionCount error:', e.message);
    return 0;
  }
}

// =============================================
// EXPRESS SERVER
// =============================================
const express = require("express");
const app = express();
const port = process.env.PORT || 8001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Register comment routes
registerCommentRoutes(app);

// Root "/" - domain open una gaman main.html (home page) show karanna
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'main.html'));
});

// image.js for dynamic frontend loading
app.get("/image.js", (req, res) => {
  res.sendFile(path.join(__dirname, 'image.js'));
});

// /home - direct home page access
app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'main.html'));
});

// /pair - pair page
app.get("/pair", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'pair.html'));
});

// pair.html
app.get("/pair.html", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'pair.html'));
});

// team.html
app.get("/team.html", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'team.html'));
});

// contact.html
app.get("/contact.html", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'contact.html'));
});

// tharidu.html
app.get("/tharidu.html", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'tharidu.html'));
});

// settings.html
app.get("/settings.html", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'settings.html'));
});

// /settings - direct access
app.get("/settings", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'settings.html'));
});

// main.html direct access
app.get("/main.html", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'main.html'));
});

// react.html
app.get("/react.html", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'react.html'));
});

app.get("/react", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'react.html'));
});

// shop.html
app.get("/shop.html", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'shop.html'));
});

app.get("/shop", (req, res) => {
  res.sendFile(path.join(__dirname, 'mezuka', 'shop.html'));
});

// =============================================
// UPTIMEROBOT PING ENDPOINT - 24/7 Online
// =============================================
app.get("/ping", (req, res) => {
  res.json({ status: "alive", uptime: process.uptime() });
});

// =============================================
// /code ROUTE - Pairing Code Generator
// =============================================
app.get("/code", async (req, res) => {
  const { number } = req.query;

  if (!number) {
    return res.status(400).json({ error: 'Number parameter is required. Usage: /code?number=94712345678' });
  }

  const sanitizedNumber = number.replace(/[^0-9]/g, '');

  if (!sanitizedNumber || sanitizedNumber.length < 7) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  // Already connected check
  if (global.WA_SESSIONS && global.WA_SESSIONS.has(sanitizedNumber)) {
    return res.status(200).json({
      status: 'already_connected',
      message: 'This number is already connected.',
      number: sanitizedNumber
    });
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
          const sessionData = {};
          const sessionFiles = await fse.readdir(sessionFolder);
          for (const file of sessionFiles) {
            try {
              const content = await fse.readFile(path.join(sessionFolder, file), 'utf8');
              sessionData[file] = JSON.parse(content);
            } catch(e) {}
          }
          const credsData = sessionData['creds.json'] || {};

          await client.connect().catch(() => {});
          // Already saved db check, nattam new db eka find karanna
          const existingDb = await findSessionDbName(sanitizedNumber);
          const targetDb = existingDb || await getSessionDbName();
          const colSave = client.db(targetDb).collection(`${config.NENO_DATA}`);

          await colSave.updateOne(
            { ownerNumber: sanitizedNumber },
            { $set: { ownerNumber: sanitizedNumber, sid: credsData, sessionFiles: sessionData, updatedAt: new Date() } },
            { upsert: true }
          );

          console.log(`💾 Session saved to ${targetDb} for ${sanitizedNumber} (${Object.keys(sessionData).length} files)`);

          try { await defEnv(sanitizedNumber); } catch(e) { console.error('defEnv error:', e.message); }
          try { await loadSettings(sanitizedNumber); } catch(e) { console.error('loadSettings error:', e.message); }

        } catch (saveErr) {
          console.error(`❌ Failed to save session to MongoDB:`, saveErr.message);
        }

        try { pairSocket.ws.close(); } catch(e) {}
        global.WA_SESSIONS.delete(sanitizedNumber);
        connectToWA(sanitizedNumber, sessionFolder);
      }

      if (connection === 'close') {
        const statusCode = new (require('@hapi/boom').Boom)(lastDisconnect?.error)?.output?.statusCode;
        const loggedOut = statusCode === 401;
        console.log(`⚠️ PairSocket closed for ${sanitizedNumber}, code: ${statusCode}`);
        if (!loggedOut && !global.WA_SESSIONS.has(sanitizedNumber)) {
          setTimeout(() => connectToWA(sanitizedNumber, sessionFolder), 3000);
        }
      }
    });

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
      if (!global.WA_SESSIONS.has(sanitizedNumber)) {
        connectToWA(sanitizedNumber, sessionFolder);
      }
      if (!res.headersSent) {
        return res.json({
          status: 'already_registered',
          message: 'Number already has a session. Reconnecting...',
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

// =============================================
// QR SESSION STORE
// =============================================
if (!global.QR_SESSIONS) global.QR_SESSIONS = new Map();

// =============================================
// /api/qr ROUTE - Start QR Session
// =============================================
app.get("/api/qr", async (req, res) => {
  // Multi-DB system use karanakoat server_full check optional —
  // Hard cap onnam HARD_LIMIT set karanna:
  // const total = await getTotalSessionCount();
  // if (total >= HARD_LIMIT) return res.status(503).json({ status: 'server_full' });

  const sessionId = "qr_" + Date.now();
  console.log(`📱 QR Pairing requested: ${sessionId}`);

  global.QR_SESSIONS.set(sessionId, {
    qr: null,
    status: 'pending',
    number: null,
    updatedAt: Date.now()
  });

  res.json({ status: 'pending', sessionId, message: 'QR session started. Poll /api/qr/poll for QR.' });

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
      makeCacheableSignalKeyStore,
    } = require('@whiskeysockets/baileys');
    const P = require('pino');
    const fse = require('fs-extra');

    const sessionFolder = path.join(__dirname, 'auth_info_baileys', sessionId);
    await fse.ensureDir(sessionFolder);

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
      const { connection, qr, lastDisconnect } = update;

      if (qr) {
        console.log(`🔄 QR updated for session: ${sessionId}`);
        global.QR_SESSIONS.set(sessionId, {
          qr,
          status: 'pending',
          number: null,
          updatedAt: Date.now()
        });
      }

      if (connection === 'open') {
        const actualNumber = pairSocket.user.id.split(':')[0];
        console.log(`✅ QR Pairing successful for ${actualNumber}`);

        clearTimeout(SESSION_TIMEOUT);
        global.QR_SESSIONS.set(sessionId, {
          qr: null,
          status: 'success',
          number: actualNumber,
          updatedAt: Date.now()
        });
        setTimeout(() => global.QR_SESSIONS.delete(sessionId), 60000);

        try {
          const credsData = await fse.readJson(path.join(sessionFolder, 'creds.json'));

          await client.connect().catch(() => {});
          // Already saved db check, nattam new db eka find karanna
          const existingDb = await findSessionDbName(actualNumber);
          const targetDb = existingDb || await getSessionDbName();
          const colSave = client.db(targetDb).collection(`${config.NENO_DATA}`);

          const newFolder = path.join(__dirname, 'auth_info_baileys', actualNumber);
          if (fse.existsSync(newFolder)) await fse.remove(newFolder);
          await fse.copy(sessionFolder, newFolder);
          await fse.remove(sessionFolder);

          await colSave.updateOne(
            { ownerNumber: actualNumber },
            { $set: { ownerNumber: actualNumber, sid: credsData, updatedAt: new Date() } },
            { upsert: true }
          );

          console.log(`💾 QR Session saved to ${targetDb} for ${actualNumber}`);

          try { await defEnv(actualNumber); } catch(e) {}
          try { await loadSettings(actualNumber); } catch(e) {}

          try { pairSocket.ws.close(); } catch(e) {}

          if (global.WA_SESSIONS && global.WA_SESSIONS.has(actualNumber)) {
            try { global.WA_SESSIONS.get(actualNumber).ws.close(); } catch(e) {}
            global.WA_SESSIONS.delete(actualNumber);
          }

          connectToWA(actualNumber, newFolder);
        } catch (saveErr) {
          console.error(`❌ QR Session save failed:`, saveErr);
        }
      }

      if (connection === 'close') {
        const sess = global.QR_SESSIONS.get(sessionId);
        if (sess && sess.status === 'pending') {
          console.log(`⚠️ QR session closed without scan: ${sessionId}`);
          global.QR_SESSIONS.set(sessionId, { ...sess, status: 'failed', updatedAt: Date.now() });
          clearTimeout(SESSION_TIMEOUT);
          setTimeout(() => {
            global.QR_SESSIONS.delete(sessionId);
            try { fse.remove(sessionFolder); } catch(e) {}
          }, 30000);
        }
        setTimeout(() => {
          try { pairSocket.ws.close(); } catch(e) {}
          if (!fse.existsSync(path.join(__dirname, 'auth_info_baileys', sessionId.replace('qr_', '')))) {
            try { fse.remove(sessionFolder); } catch(e) {}
          }
        }, 3000);
      }
    });

  } catch (err) {
    console.error(`❌ QR Generation error:`, err);
    global.QR_SESSIONS.set(sessionId, { qr: null, status: 'failed', number: null, updatedAt: Date.now() });
  }
});

// =============================================
// /api/qr/poll ROUTE
// =============================================
app.get("/api/qr/poll", (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.json({ status: 'failed', error: 'No sessionId' });

  const sess = global.QR_SESSIONS.get(sessionId);
  if (!sess) {
    return res.json({ status: 'failed', error: 'Session not found or expired' });
  }

  return res.json({
    status: sess.status,
    qr: sess.qr || null,
    number: sess.number || null,
    updatedAt: sess.updatedAt
  });
});

// =============================================
// /api/qr/status ROUTE - Legacy compat
// =============================================
app.get("/api/qr/status", (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.json({ status: 'pending' });
  const sess = global.QR_SESSIONS.get(sessionId);
  if (!sess) return res.json({ status: 'success' });
  if (sess.status === 'success') return res.json({ status: 'success', number: sess.number });
  return res.json({ status: 'pending' });
});

// ─── SETTINGS API ───────────────────────────────

// Login
app.post("/api/settings/login", async (req, res) => {
  try {
    const { number, password } = req.body;
    if (!number || !password) return res.status(400).json({ ok: false, error: 'Missing fields' });
    const sanitized = number.replace(/[^0-9]/g, '');
    const saved = await getPassword(sanitized);
    if (!saved || saved !== password.toUpperCase()) {
      return res.status(401).json({ ok: false, error: 'Invalid number or password' });
    }
    res.json({ ok: true, number: sanitized });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get settings
app.post("/api/settings/get", async (req, res) => {
  try {
    const { number, password } = req.body;
    if (!number || !password) return res.status(400).json({ ok: false, error: 'Missing fields' });
    const sanitized = number.replace(/[^0-9]/g, '');
    const saved = await getPassword(sanitized);
    if (!saved || saved !== password.toUpperCase()) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const settings = await readEnv(sanitized);
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update single setting
app.post("/api/settings/update", async (req, res) => {
  try {
    const { number, password, key, value } = req.body;
    if (!number || !password || !key) return res.status(400).json({ ok: false, error: 'Missing fields' });
    const sanitized = number.replace(/[^0-9]/g, '');
    const saved = await getPassword(sanitized);
    if (!saved || saved !== password.toUpperCase()) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await updateEnv(sanitized, key, value);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── AUTO REPLY API ──────────────────────────────────────────

async function checkAuth(number, password) {
  const sanitized = number.replace(/[^0-9]/g, '');
  const saved = await getPassword(sanitized);
  if (!saved || saved !== password.toUpperCase()) return null;
  return sanitized;
}

app.post("/api/autoreply/list", async (req, res) => {
  try {
    const { number, password } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const replies = await listAutoReplies(san);
    const enabled = await getAutoReplyStatus(san);
    res.json({ ok: true, replies, enabled });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/autoreply/add", async (req, res) => {
  try {
    const { number, password, trigger, response } = req.body;
    if (!trigger || !response) return res.status(400).json({ ok: false, error: 'trigger and response are required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await addAutoReply(san, trigger, response);
    res.json({ ok: true, message: 'Auto reply added successfully' });
  } catch (err) {
    if (err.message === 'MAX_LIMIT_REACHED') return res.status(400).json({ ok: false, error: 'Maximum 20 auto-replies allowed' });
    if (err.message === 'TRIGGER_EXISTS') return res.status(400).json({ ok: false, error: 'Trigger already exists' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/autoreply/delete", async (req, res) => {
  try {
    const { number, password, trigger } = req.body;
    if (!trigger) return res.status(400).json({ ok: false, error: 'trigger is required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await deleteAutoReply(san, trigger);
    res.json({ ok: true, message: 'Auto reply deleted successfully' });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/autoreply/toggle", async (req, res) => {
  try {
    const { number, password, enabled } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await toggleAutoReply(san, enabled);
    res.json({ ok: true, message: `Auto reply ${enabled ? 'ON' : 'OFF'}` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─── SCHEDULED MESSAGES API ─────────────────────────────────

app.post("/api/scheduled/list", async (req, res) => {
  try {
    const { number, password } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const messages = await listScheduledMessages(san);
    const enabled = await getScheduledMessagesStatus(san);
    res.json({ ok: true, messages, enabled });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/scheduled/add", async (req, res) => {
  try {
    const { number, password, recipientNumber, recipientName, day, time, message } = req.body;
    if (!recipientNumber || !day || !time || !message) return res.status(400).json({ ok: false, error: 'recipientNumber, day, time, message are required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const id = await addScheduledMessage(san, { recipientNumber, recipientName, day, time, message });
    res.json({ ok: true, message: 'Scheduled message added successfully', id });
  } catch (err) {
    if (err.message === 'MAX_LIMIT_REACHED') return res.status(400).json({ ok: false, error: 'Maximum 20 scheduled messages allowed' });
    if (err.message === 'MESSAGE_REQUIRED') return res.status(400).json({ ok: false, error: 'Message required' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/scheduled/delete", async (req, res) => {
  try {
    const { number, password, id } = req.body;
    if (!id) return res.status(400).json({ ok: false, error: 'id is required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await deleteScheduledMessage(san, id);
    res.json({ ok: true, message: 'Scheduled message deleted successfully' });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/scheduled/toggle", async (req, res) => {
  try {
    const { number, password, enabled } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await toggleScheduledMessages(san, enabled);
    res.json({ ok: true, message: `Scheduled messages ${enabled ? 'ON' : 'OFF'}` });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ── REACT PANEL API ───────────────────────────────────────

app.post("/api/react/auth", async (req, res) => {
  try {
    const { number, username, password } = req.body;
    if (!number || !password) return res.status(400).json({ ok: false, error: 'Missing fields' });
    const san = number.replace(/[^0-9]/g, '');
    const result = await signupReactUser(san, username || "User", password);
    if (!result.ok) return res.status(401).json(result);
    res.json(result);
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/react/user", async (req, res) => {
  try {
    const { number, password } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const info = await getReactUserInfo(san);
    res.json({ ok: true, ...info });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/react/add-task", async (req, res) => {
  try {
    const { number, password, jid, emojis, days } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    if (!jid || !days) return res.status(400).json({ ok: false, error: 'Missing jid or days' });

    const cost = parseInt(days) * 10;
    const deducted = await deductReactCoins(san, cost);
    if (!deducted) return res.status(400).json({ ok: false, error: 'Insufficient coins' });

    const arDB = getArDB();
    const col = arDB.collection('newsletter_reacts');

    let targetJid = jid.trim();

    if (targetJid.includes('whatsapp.com/channel/')) {
      targetJid = targetJid.split('channel/')[1].split('/')[0].split('?')[0] + '@newsletter';
    } else if (targetJid.includes('chat.whatsapp.com/')) {
      targetJid = targetJid.split('chat.whatsapp.com/')[1].split('/')[0].split('?')[0] + '@newsletter';
    } else if (!targetJid.includes('@')) {
      targetJid = targetJid + '@newsletter';
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + parseInt(days));

    const emojiArray = emojis ? emojis.split(',').map(e => e.trim()).filter(Boolean) : [];

    await col.updateOne(
      { jid: targetJid, ownerNumber: san },
      { $set: { jid: targetJid, ownerNumber: san, emojis: emojiArray, expiryDate: expiry, createdAt: new Date() } },
      { upsert: true }
    );

    newsletterReactCache.set(targetJid, { jid: targetJid, ownerNumber: san, emojis: emojiArray, expiryDate: expiry });

    res.json({ ok: true, expiry });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/react/list-tasks", async (req, res) => {
  try {
    const { number, password } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const arDB = getArDB();
    const col = arDB.collection('newsletter_reacts');
    const tasks = await col.find({ ownerNumber: san }).toArray();

    res.json({ ok: true, tasks });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/react/daily-claim", async (req, res) => {
  try {
    const { number, password } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const result = await claimDailyCoins(san);
    res.json(result);
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post("/api/react/redeem", async (req, res) => {
  try {
    const { number, password, code } = req.body;
    if (!code) return res.status(400).json({ ok: false, error: 'Code is required' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const result = await redeemCode(san, code.trim().toUpperCase());
    res.json(result);
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ─── GROUP SETTINGS API ──────────────────────────

const GROUP_SETTING_KEYS = [
  'ANTI_LINK', 'ANTI_LINK_ACTION', 'ANTI_LINK_MSG',
  'ANTI_BAD', 'ANTI_BAD_ACTION', 'ANTI_BAD_MSG', 'BAD_WORDS',
  'WELCOME', 'WELCOME_MSG',
  'GOODBYE', 'GOODBYE_MSG'
];

app.post('/api/group/get', async (req, res) => {
  try {
    const { number, password } = req.body;
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const settings = await loadSettings(san);
    const groupSettings = {};
    GROUP_SETTING_KEYS.forEach(k => { groupSettings[k] = settings[k] ?? ''; });
    res.json({ ok: true, settings: groupSettings });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

app.post('/api/group/update', async (req, res) => {
  try {
    const { number, password, key, value } = req.body;
    if (!GROUP_SETTING_KEYS.includes(key)) return res.status(400).json({ ok: false, error: 'Invalid key' });
    const san = await checkAuth(number, password);
    if (!san) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    await updateEnv(san, key, value);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});


app.post("/api/chat", async (req, res) => {
  try {
    const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
    if (!NVIDIA_API_KEY) return res.status(500).json({ error: 'NVIDIA_API_KEY not set in environment' });

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + NVIDIA_API_KEY
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('❌ Chat proxy error:', err.message);
    res.status(500).json({ error: 'Chat proxy failed: ' + err.message });
  }
});


app.get("/api/sessions", async (req, res) => {
  try {
    if (!global.WA_SESSIONS) {
      return res.json({ ok: true, sessions: [] });
    }

    const sessions = [];
    for (const [ownerNumber, connection] of global.WA_SESSIONS.entries()) {
      const isConnected = connection && connection.user !== undefined;
      sessions.push({
        number: ownerNumber,
        status: isConnected ? 'connected' : 'disconnected',
        lastUpdate: new Date().toISOString(),
        jid: isConnected ? connection.user.id : null
      });
    }

    res.json({ ok: true, sessions, count: sessions.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`🌐 Express server listening at http://localhost:${port}`);
});

