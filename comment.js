// =============================================
// COMMENT SYSTEM - comment.js
// MongoDB MEZUKADB > 'comments' collection
// =============================================

const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://example';
const ADMIN_PASSWORD = 'Nimesh@123';

let cmClient = null;
let cmCol = null;

async function initCommentDB() {
  try {
    if (cmClient) {
      try {
        if (cmClient.topology && cmClient.topology.isConnected()) return;
      } catch (e) {}
    }
    cmClient = new MongoClient(MONGODB_URI, { maxPoolSize: 5 });
    await cmClient.connect();
    const db = cmClient.db('MEZUKADB');
    cmCol = db.collection('comments');
    // Index: newest first, fast lookup by id
    await cmCol.createIndex({ createdAt: -1 }).catch(() => {});
    await cmCol.createIndex({ id: 1 }, { unique: true }).catch(() => {});
    console.log('✅ Comment DB initialized');
  } catch (e) {
    console.error('initCommentDB error:', e.message);
  }
}

// ── Add a top-level comment ─────────────────────────────────
async function addComment({ name, message }) {
  await initCommentDB();
  if (!name || !name.trim()) throw new Error('NAME_REQUIRED');
  if (!message || !message.trim()) throw new Error('MESSAGE_REQUIRED');
  if (name.trim().length > 60) throw new Error('NAME_TOO_LONG');
  if (message.trim().length > 1000) throw new Error('MESSAGE_TOO_LONG');

  const id = crypto.randomBytes(10).toString('hex');
  const doc = {
    id,
    name: name.trim(),
    message: message.trim(),
    replies: [],
    createdAt: new Date(),
    likes: 0
  };
  await cmCol.insertOne(doc);
  return doc;
}

// ── Add an admin reply to a comment ────────────────────────
async function addReply({ commentId, password, replyMessage }) {
  await initCommentDB();

  if (!password || password !== ADMIN_PASSWORD) throw new Error('UNAUTHORIZED');
  if (!replyMessage || !replyMessage.trim()) throw new Error('MESSAGE_REQUIRED');
  if (replyMessage.trim().length > 1000) throw new Error('MESSAGE_TOO_LONG');

  const comment = await cmCol.findOne({ id: commentId });
  if (!comment) throw new Error('COMMENT_NOT_FOUND');

  const replyId = crypto.randomBytes(8).toString('hex');
  const reply = {
    id: replyId,
    message: replyMessage.trim(),
    createdAt: new Date(),
    isAdmin: true
  };

  await cmCol.updateOne(
    { id: commentId },
    { $push: { replies: reply } }
  );

  return reply;
}

// ── Get all comments (newest first) ────────────────────────
async function getComments() {
  await initCommentDB();
  const docs = await cmCol.find({}).sort({ createdAt: -1 }).limit(200).toArray();
  return docs.map(d => ({
    id: d.id,
    name: d.name,
    message: d.message,
    replies: d.replies || [],
    createdAt: d.createdAt,
    likes: d.likes || 0
  }));
}

// ── Delete a comment (admin only) ──────────────────────────
async function deleteComment({ commentId, password }) {
  await initCommentDB();
  if (!password || password !== ADMIN_PASSWORD) throw new Error('UNAUTHORIZED');
  const r = await cmCol.deleteOne({ id: commentId });
  return r.deletedCount > 0;
}

// ── Like a comment (simple, no duplicate check) ────────────
async function likeComment({ commentId }) {
  await initCommentDB();
  const r = await cmCol.updateOne({ id: commentId }, { $inc: { likes: 1 } });
  return r.matchedCount > 0;
}

// ── Register Express routes ─────────────────────────────────
function registerCommentRoutes(app) {

  // GET all comments
  app.get('/api/comments', async (req, res) => {
    try {
      const comments = await getComments();
      res.json({ ok: true, comments });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // POST new comment
  app.post('/api/comments/add', async (req, res) => {
    try {
      const { name, message } = req.body;
      const comment = await addComment({ name, message });
      res.json({ ok: true, comment });
    } catch (e) {
      const status = e.message === 'NAME_REQUIRED' || e.message === 'MESSAGE_REQUIRED' ? 400 : 500;
      res.status(status).json({ ok: false, error: e.message });
    }
  });

  // POST admin reply to a comment
  app.post('/api/comments/reply', async (req, res) => {
    try {
      const { commentId, password, replyMessage } = req.body;
      const reply = await addReply({ commentId, password, replyMessage });
      res.json({ ok: true, reply });
    } catch (e) {
      const status = e.message === 'UNAUTHORIZED' ? 401 : e.message === 'COMMENT_NOT_FOUND' ? 404 : 500;
      res.status(status).json({ ok: false, error: e.message });
    }
  });

  // POST delete comment (admin)
  app.post('/api/comments/delete', async (req, res) => {
    try {
      const { commentId, password } = req.body;
      const deleted = await deleteComment({ commentId, password });
      res.json({ ok: true, deleted });
    } catch (e) {
      const status = e.message === 'UNAUTHORIZED' ? 401 : 500;
      res.status(status).json({ ok: false, error: e.message });
    }
  });

  // POST like a comment
  app.post('/api/comments/like', async (req, res) => {
    try {
      const { commentId } = req.body;
      await likeComment({ commentId });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  console.log('✅ Comment routes registered');
}

// Init DB at startup
initCommentDB().catch(e => console.error('Comment DB init failed:', e.message));

module.exports = { registerCommentRoutes, addComment, addReply, getComments, deleteComment, likeComment };
