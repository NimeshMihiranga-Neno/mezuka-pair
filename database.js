const fs = require('fs-extra');
const path = require('path');
const { MongoClient } = require('mongodb'); 
const uri = process.env.MONGODB_URI || 'mongodb://example';

// ── PERSISTENT CONNECTION ──────────────────────────────────────
// connect/close loop නෑ — single persistent client
const client = new MongoClient(uri, {
  maxPoolSize: 10,
});

let _connected = false;

async function getDb() {
  if (!_connected) {
    await client.connect();
    _connected = true;
    console.log('✅ [DB] MongoDB connected (persistent)');

    client.on('close', () => {
      _connected = false;
      console.log('⚠️ [DB] MongoDB connection closed');
    });
    client.on('error', (err) => {
      _connected = false;
      console.error('❌ [DB] MongoDB error:', err.message);
    });
  }
  return client.db('MEZUKADB');
}
// ──────────────────────────────────────────────────────────────

const defaults = {
      OWNER_NAME: "𝐍ɪᴍᴇꜱʜᴋᴀ 𝐌ɪʜɪʀᴀɴɢᴀ",
      BOT_NAME: "𝐌ᴇᴢᴜᴋᴀ 𝐌ᴅ 𝐌ɪɴɪ 𝐁ᴏᴛ",
      OWNER_FROM: "Sri Lanka",
      BUTTON: "true",
      OWNER_AGE: "+20",
      PRIFIX: ".",
      MODE: "Public",
      NENO_LAN: "EN",

      ANTI_DELETE: "from",
      ANTI_DELETE_WORK_TYPE: "both",
      ANTI_DELETE_SEND_TYPE: "inbox",
      ANTI_CALL: "false",
      CALL_REJECT_LIST: "",
      CALL_OPEN_LIST: "",
      AUTO_REACT_STATUS: "true",
      AUTO_TYPING: "false",
      AUTO_RECODING: "false",
      ALWAYS_ONLINE: "false",
      AUTO_READ_STATUS: "true",
      AUTO_READ_MSG: "false",
      AUTO_SAVE: "false",
      CMD_READ: "false",
      AUTO_VOICE: "false",
      AUTO_BLOCK: "false",
      OWNER_IMG: require('./image').N8AN5Z,
      MENU_LOGO: require('./image').DEFAULT_LOGO,
      ALIVE_LOGO: require('./image').DEFAULT_LOGO,
      ALIVE_MSG: "©ᴘᴏᴡᴇʀᴇᴅ ʙʏ ʙʟᴀᴄᴋ ᴄᴀᴛ ᴏꜰᴄ",
      BAN: "",
      SUDO: "",
      XNX_VIDEO: "false",
      REACT_COINS: 0,
      REACT_USERNAME: "",

      // ── GROUP FEATURES ──────────────────────────────────────────
      ANTI_LINK: "false",
      ANTI_LINK_ACTION: "warn",       // warn | kick | delete
      ANTI_LINK_MSG: "⚠️ Links are not allowed in this group!",

      ANTI_BAD: "false",
      ANTI_BAD_ACTION: "warn",        // warn | kick | delete
      ANTI_BAD_MSG: "⚠️ Bad words are not allowed in this group!",
      BAD_WORDS: "",                  // comma-separated list

      WELCOME: "false",
      WELCOME_MSG: "🌸 Welcome to the group, @user! 🎉\nWe're happy to have you here.",

      GOODBYE: "false",
      GOODBYE_MSG: "👋 Goodbye @user! We'll miss you.",
    };


async function defEnv(ownerNumber) {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');

    const doc = await collection.findOne({ ownerNumber });

    if (!doc) {
      await collection.updateOne(
        { ownerNumber },
        { $set: { ownerNumber, ...defaults } },
        { upsert: true }
      );
      console.log(`✅ Created defaults for ${ownerNumber}`);
    } else {
      const update = {};
      for (const [key, value] of Object.entries(defaults)) {
        if (!Object.prototype.hasOwnProperty.call(doc, key)) {
          update[key] = value;
        }
      }
      if (Object.keys(update).length > 0) {
        await collection.updateOne({ ownerNumber }, { $set: update });
        console.log(`✅ Added missing defaults for ${ownerNumber}`);
      } else {
        console.log(`ℹ️ All defaults already exist for ${ownerNumber}`);
      }
    }
  } catch (err) {
    console.error(`❌ Error adding defaults for ${ownerNumber}:`, err.message);
  }
}


let liveSettings = {};

async function loadSettings(ownerNumber) {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');

    const doc = await collection.findOne({ ownerNumber });

    if (doc) {
      liveSettings[ownerNumber] = doc;
    } else {
      liveSettings[ownerNumber] = { ownerNumber, ...defaults };
      console.log(`⚠️ No document found, using defaults for ${ownerNumber}`);
    }

    const settingsDir = path.resolve(__dirname, 'SETTINGS');
    await fs.ensureDir(settingsDir);
    const filePath = path.join(settingsDir, `${ownerNumber}.js`);
    const fileContent = `module.exports = ${JSON.stringify(liveSettings[ownerNumber], null, 2)};\n`;
    await fs.writeFile(filePath, fileContent, 'utf8');
    delete require.cache[require.resolve(filePath)];

    return liveSettings[ownerNumber];
  } catch (err) {
    console.error(`❌ Error loading settings:`, err.message);
    return { ...defaults };
  }
}

function readEnv(ownerNumber) {
  if (!liveSettings[ownerNumber]) {
    console.log(`⚠️ Settings for ${ownerNumber} not loaded, returning defaults`);
    return { ...defaults };
  }
  return liveSettings[ownerNumber];
}

function readEnvSync(ownerNumber) {
  if (!liveSettings[ownerNumber]) {
    return { ...defaults };
  }
  return liveSettings[ownerNumber];
}

async function updateEnv(ownerNumber, key, newValue) {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');

    const updateObj = { [key]: newValue };
    const result = await collection.updateOne(
      { ownerNumber },
      { $set: updateObj }
    );

    if (result.matchedCount === 0) {
      console.log(`⚠️ No document found with ownerNumber ${ownerNumber}`);
      return false;
    }

    console.log(`✅ Updated key "${key}" for ownerNumber ${ownerNumber} with value:`, updateObj[key]);
    await loadSettings(ownerNumber);
    return true;

  } catch (err) {
    console.error(`❌ Error updating key "${key}" for ownerNumber ${ownerNumber}:`, err);
    return false;
  }
}

async function updateList(ownerNumber, key, values, action = "add") {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');

    const doc = await collection.findOne({ ownerNumber });
    if (!doc) {
      console.log(`⚠️ No document found with ownerNumber ${ownerNumber}`);
      return false;
    }

    let currentValue = doc[key] || "";

    let valuesArray = [];
    if (Array.isArray(values)) {
      valuesArray = values;
    } else if (typeof values === 'string') {
      valuesArray = values.split(',').map(v => v.trim()).filter(v => v !== '');
    } else {
      console.log('❌ values must be string or array');
      return false;
    }

    let currentArray = currentValue.split(',').map(v => v.trim()).filter(v => v !== '');

    if (action === "add") {
      const combinedSet = new Set([...currentArray, ...valuesArray]);
      currentArray = Array.from(combinedSet);
    } else if (action === "remove") {
      currentArray = currentArray.filter(v => !valuesArray.includes(v));
    } else {
      console.log('❌ action must be "add" or "remove"');
      return false;
    }

    const newValue = currentArray.join(',') + (currentArray.length > 0 ? ',' : '');

    const updateObj = { [key]: newValue };
    const result = await collection.updateOne(
      { ownerNumber },
      { $set: updateObj }
    );

    if (result.matchedCount === 0) {
      console.log(`⚠️ No document found with ownerNumber ${ownerNumber}`);
      return false;
    }

    console.log(`✅ Updated key "${key}" for ownerNumber ${ownerNumber} [${action}]: ${newValue}`);
    await loadSettings(ownerNumber);
    return true;

  } catch (err) {
    console.error(`❌ Error updating key "${key}" for ownerNumber ${ownerNumber}:`, err);
    return false;
  }
}

async function savePassword(ownerNumber, password) {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');
    await collection.updateOne(
      { ownerNumber },
      { $set: { ownerNumber, BOT_PASSWORD: password } },
      { upsert: true }
    );
  } catch (err) {
    console.error('savePassword error:', err.message);
  }
}

async function getPassword(ownerNumber) {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');
    const doc = await collection.findOne({ ownerNumber });
    return doc?.BOT_PASSWORD || null;
  } catch (err) {
    console.error('getPassword error:', err.message);
    return null;
  }
}

async function signupReactUser(ownerNumber, username, password) {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');
    const doc = await collection.findOne({ ownerNumber });

    if (!doc) return { ok: false, error: 'Number not connected to bot' };
    if (doc.BOT_PASSWORD !== password.toUpperCase()) return { ok: false, error: 'Invalid password' };

    const update = {};
    let firstTime = false;

    // Only update username if provided (signup mode), not on login
    if (username && username.trim() !== '') {
      update.REACT_USERNAME = username.trim();
    }

    if (doc.REACT_COINS === undefined || doc.REACT_COINS === null) {
      update.REACT_COINS = 10; // Award initial 10 coins
      firstTime = true;
    }

    if (Object.keys(update).length > 0) {
      await collection.updateOne({ ownerNumber }, { $set: update });
    }
    const updatedDoc = await loadSettings(ownerNumber);
    const finalUsername = updatedDoc.REACT_USERNAME || doc.REACT_USERNAME || username || "User";
    return { ok: true, firstTime, coins: updatedDoc.REACT_COINS ?? doc.REACT_COINS ?? 0, username: finalUsername };
  } catch (err) {
    console.error('signupReactUser error:', err.message);
    return { ok: false, error: err.message };
  }
}

async function getReactUserInfo(ownerNumber) {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');
    const doc = await collection.findOne({ ownerNumber });
    if (!doc) return null;
    return {
      number: doc.ownerNumber,
      username: doc.REACT_USERNAME || "User",
      coins: doc.REACT_COINS || 0
    };
  } catch (err) {
    console.error('getReactUserInfo error:', err.message);
    return null;
  }
}

async function deductReactCoins(ownerNumber, amount) {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');
    const doc = await collection.findOne({ ownerNumber });
    if (!doc || (doc.REACT_COINS || 0) < amount) return false;

    await collection.updateOne({ ownerNumber }, { $inc: { REACT_COINS: -amount } });
    await loadSettings(ownerNumber);
    return true;
  } catch (err) {
    console.error('deductReactCoins error:', err.message);
    return false;
  }
}

async function claimDailyCoins(ownerNumber) {
  try {
    const db = await getDb();
    const collection = db.collection('SETTINGS');
    const doc = await collection.findOne({ ownerNumber });

    if (!doc) return { ok: false, error: 'User not found' };

    const now = new Date();
    const lastClaim = doc.LAST_DAILY_CLAIM ? new Date(doc.LAST_DAILY_CLAIM) : null;

    // Check if already claimed today (Sri Lanka timezone offset: +5:30)
    if (lastClaim) {
      const nowSL = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      const lastSL = new Date(lastClaim.getTime() + 5.5 * 60 * 60 * 1000);

      const sameDay =
        nowSL.getUTCFullYear() === lastSL.getUTCFullYear() &&
        nowSL.getUTCMonth()    === lastSL.getUTCMonth()    &&
        nowSL.getUTCDate()     === lastSL.getUTCDate();

      if (sameDay) {
        // Calculate next midnight in SL time
        const nextMidnightSL = new Date(Date.UTC(
          nowSL.getUTCFullYear(), nowSL.getUTCMonth(), nowSL.getUTCDate() + 1
        ));
        const nextMidnightUTC = new Date(nextMidnightSL.getTime() - 5.5 * 60 * 60 * 1000);
        const msLeft = nextMidnightUTC - now;
        const hLeft  = Math.floor(msLeft / (1000 * 60 * 60));
        const mLeft  = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
        return { ok: false, error: `Already claimed today! Next claim in ${hLeft}h ${mLeft}m` };
      }
    }

    // Award 5 coins
    await collection.updateOne(
      { ownerNumber },
      {
        $inc: { REACT_COINS: 5 },
        $set: { LAST_DAILY_CLAIM: now }
      }
    );

    await loadSettings(ownerNumber);
    const updatedDoc = await collection.findOne({ ownerNumber });
    return { ok: true, coins: updatedDoc.REACT_COINS, awarded: 5 };

  } catch (err) {
    console.error('claimDailyCoins error:', err.message);
    return { ok: false, error: err.message };
  }
}

async function redeemCode(ownerNumber, code) {
  try {
    // Fetch latest codes from GitHub
    const https = require('https');
    const JSON_URL = 'https://raw.githubusercontent.com/NimeshMihiranga/mezukasite/refs/heads/main/code.json';

    const jsonData = await new Promise((resolve, reject) => {
      https.get(JSON_URL, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(new Error('Invalid JSON from GitHub')); }
        });
      }).on('error', reject);
    });

    const codeEntry = (jsonData.codes || []).find(
      c => c.code && c.code.toUpperCase() === code.toUpperCase()
    );
    if (!codeEntry) return { ok: false, error: 'Invalid redeem code' };

    const db = await getDb();
    const collection = db.collection('SETTINGS');
    const redeemCol  = db.collection('REDEEM_CODES');

    // Check how many times this code has been used globally
    const usageDoc = await redeemCol.findOne({ code: codeEntry.code });
    const globalUses = usageDoc ? (usageDoc.totalUses || 0) : 0;

    if (codeEntry.maxUses && globalUses >= codeEntry.maxUses) {
      return { ok: false, error: 'This code has reached its maximum uses' };
    }

    // Check if this user already used this code
    const alreadyUsed = usageDoc && Array.isArray(usageDoc.usedBy) && usageDoc.usedBy.includes(ownerNumber);
    if (alreadyUsed) return { ok: false, error: 'You have already used this code' };

    // Award coins to user
    await collection.updateOne(
      { ownerNumber },
      { $inc: { REACT_COINS: codeEntry.coins } }
    );

    // Record usage
    await redeemCol.updateOne(
      { code: codeEntry.code },
      {
        $inc: { totalUses: 1 },
        $push: { usedBy: ownerNumber },
        $setOnInsert: { code: codeEntry.code }
      },
      { upsert: true }
    );

    await loadSettings(ownerNumber);
    const updatedDoc = await collection.findOne({ ownerNumber });
    return { ok: true, coins: updatedDoc.REACT_COINS, awarded: codeEntry.coins, code: codeEntry.code };

  } catch (err) {
    console.error('redeemCode error:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { updateList, readEnv, readEnvSync, defEnv, updateEnv, loadSettings, savePassword, getPassword, signupReactUser, getReactUserInfo, deductReactCoins, claimDailyCoins, redeemCode };

