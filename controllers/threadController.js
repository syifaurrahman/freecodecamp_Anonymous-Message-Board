'use strict';

const mongoose = require('mongoose');

// ── Schema & Model ────────────────────────────────────────────────────────────

const replySchema = new mongoose.Schema({
  text:            { type: String, required: true },
  created_on:      { type: Date,   default: Date.now },
  delete_password: { type: String, required: true },
  reported:        { type: Boolean, default: false }
});

const threadSchema = new mongoose.Schema({
  board:           { type: String, required: true },
  text:            { type: String, required: true },
  created_on:      { type: Date,   default: Date.now },
  bumped_on:       { type: Date,   default: Date.now },
  reported:        { type: Boolean, default: false },
  delete_password: { type: String, required: true },
  replies:         { type: [replySchema], default: [] }
});

const Thread = mongoose.model('Thread', threadSchema);

mongoose.set('bufferCommands', false);

// ── DB Connection / Fallback ──────────────────────────────────────────────────

let isConnected = false;
let dbPromise = null;
let inMemoryThreads = [];

async function initDB() {
  if (dbPromise) return dbPromise;

  const dbUri = process.env.DB;
  // If DB is missing, contains placeholder, or contains incomplete hostname, fallback immediately without delay
  if (!dbUri || dbUri.includes('<username>') || dbUri.includes('<password>') || /@cluster0\.mongodb\.net(\/|\?|$)/.test(dbUri)) {
    isConnected = false;
    dbPromise = Promise.resolve(false);
    return dbPromise;
  }

  dbPromise = mongoose.connect(dbUri, {
    serverSelectionTimeoutMS: 3000
  }).then(() => {
    isConnected = true;
    console.log('MongoDB connected successfully');
    return true;
  }).catch((err) => {
    console.log('MongoDB connection error (using in-memory fallback):', err.message);
    isConnected = false;
    return false;
  });

  return dbPromise;
}

// Immediately initiate DB connection
initDB();

// ── Thread Handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/threads/:board
 * Create a new thread.
 */
async function createThread(req, res) {
  try {
    await initDB();
    const { text, delete_password } = req.body;
    const board = req.params.board || req.body.board;
    const now = new Date();

    if (isConnected) {
      await Thread.create({
        board,
        text,
        delete_password,
        created_on: now,
        bumped_on: now,
        reported: false,
        replies: []
      });
    } else {
      const newThread = {
        _id: new mongoose.Types.ObjectId().toString(),
        board,
        text,
        delete_password,
        created_on: now,
        bumped_on: now,
        reported: false,
        replies: []
      };
      inMemoryThreads.push(newThread);
    }

    return res.redirect(`/b/${board}/`);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
}

/**
 * GET /api/threads/:board
 * Return 10 most recently bumped threads, each with at most 3 most-recent replies.
 * Omit reported & delete_password from response.
 */
async function getThreads(req, res) {
  try {
    await initDB();
    const board = req.params.board || req.body.board;

    if (isConnected) {
      const threads = await Thread.find({ board })
        .sort({ bumped_on: -1 })
        .limit(10)
        .lean();

      const result = threads.map(t => ({
        _id:        t._id,
        text:       t.text,
        created_on: t.created_on,
        bumped_on:  t.bumped_on,
        replies:    (t.replies || [])
          .sort((a, b) => new Date(b.created_on) - new Date(a.created_on))
          .slice(0, 3)
          .map(r => ({
            _id:        r._id,
            text:       r.text,
            created_on: r.created_on
          })),
        replycount: (t.replies || []).length
      }));

      return res.json(result);
    } else {
      const threads = inMemoryThreads
        .filter(t => t.board === board)
        .sort((a, b) => new Date(b.bumped_on) - new Date(a.bumped_on))
        .slice(0, 10);

      const result = threads.map(t => ({
        _id:        t._id,
        text:       t.text,
        created_on: t.created_on,
        bumped_on:  t.bumped_on,
        replies:    [...t.replies]
          .sort((a, b) => new Date(b.created_on) - new Date(a.created_on))
          .slice(0, 3)
          .map(r => ({
            _id:        r._id,
            text:       r.text,
            created_on: r.created_on
          })),
        replycount: t.replies.length
      }));

      return res.json(result);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
}

/**
 * DELETE /api/threads/:board
 * Delete thread if delete_password matches.
 */
async function deleteThread(req, res) {
  try {
    await initDB();
    const { thread_id, delete_password } = req.body;

    if (isConnected) {
      const thread = await Thread.findById(thread_id);
      if (!thread || thread.delete_password !== delete_password) {
        return res.send('incorrect password');
      }
      await Thread.findByIdAndDelete(thread_id);
      return res.send('success');
    } else {
      const idx = inMemoryThreads.findIndex(t => t._id.toString() === (thread_id || '').toString());
      if (idx === -1 || inMemoryThreads[idx].delete_password !== delete_password) {
        return res.send('incorrect password');
      }
      inMemoryThreads.splice(idx, 1);
      return res.send('success');
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
}

/**
 * PUT /api/threads/:board
 * Report a thread (set reported = true).
 */
async function reportThread(req, res) {
  try {
    await initDB();
    const thread_id = req.body.thread_id || req.body.report_id;

    if (isConnected) {
      const thread = await Thread.findById(thread_id);
      if (!thread) return res.send('incorrect password');
      thread.reported = true;
      await thread.save();
      return res.send('reported');
    } else {
      const thread = inMemoryThreads.find(t => t._id.toString() === (thread_id || '').toString());
      if (!thread) return res.send('incorrect password');
      thread.reported = true;
      return res.send('reported');
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
}

// ── Reply Handlers ────────────────────────────────────────────────────────────

/**
 * POST /api/replies/:board
 * Add a reply to a thread; update bumped_on.
 */
async function createReply(req, res) {
  try {
    await initDB();
    const { thread_id, text, delete_password } = req.body;
    const board = req.params.board || req.body.board;
    const now = new Date();

    const newReply = {
      _id:             new mongoose.Types.ObjectId().toString(),
      text,
      delete_password,
      created_on:      now,
      reported:        false
    };

    if (isConnected) {
      await Thread.findByIdAndUpdate(thread_id, {
        bumped_on: now,
        $push:     { replies: newReply }
      });
    } else {
      const thread = inMemoryThreads.find(t => t._id.toString() === (thread_id || '').toString());
      if (thread) {
        thread.bumped_on = now;
        thread.replies.push(newReply);
      }
    }

    return res.redirect(`/b/${board}/${thread_id}`);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
}

/**
 * GET /api/replies/:board?thread_id=xxx
 * Return the full thread with all replies (omit reported & delete_password).
 */
async function getReplies(req, res) {
  try {
    await initDB();
    const thread_id = req.query.thread_id || req.body.thread_id;

    if (isConnected) {
      const thread = await Thread.findById(thread_id).lean();
      if (!thread) return res.status(404).json({ error: 'Thread not found' });

      const result = {
        _id:        thread._id,
        text:       thread.text,
        created_on: thread.created_on,
        bumped_on:  thread.bumped_on,
        replies:    (thread.replies || []).map(r => ({
          _id:        r._id,
          text:       r.text,
          created_on: r.created_on
        }))
      };

      return res.json(result);
    } else {
      const thread = inMemoryThreads.find(t => t._id.toString() === (thread_id || '').toString());
      if (!thread) return res.status(404).json({ error: 'Thread not found' });

      const result = {
        _id:        thread._id,
        text:       thread.text,
        created_on: thread.created_on,
        bumped_on:  thread.bumped_on,
        replies:    thread.replies.map(r => ({
          _id:        r._id,
          text:       r.text,
          created_on: r.created_on
        }))
      };

      return res.json(result);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
}

/**
 * DELETE /api/replies/:board
 * Change reply text to '[deleted]' if delete_password matches.
 */
async function deleteReply(req, res) {
  try {
    await initDB();
    const { thread_id, reply_id, delete_password } = req.body;

    if (isConnected) {
      const thread = await Thread.findById(thread_id);
      if (!thread) return res.send('incorrect password');

      const reply = thread.replies.id(reply_id);
      if (!reply || reply.delete_password !== delete_password) {
        return res.send('incorrect password');
      }

      reply.text = '[deleted]';
      await thread.save();
      return res.send('success');
    } else {
      const thread = inMemoryThreads.find(t => t._id.toString() === (thread_id || '').toString());
      if (!thread) return res.send('incorrect password');

      const reply = thread.replies.find(r => r._id.toString() === (reply_id || '').toString());
      if (!reply || reply.delete_password !== delete_password) {
        return res.send('incorrect password');
      }

      reply.text = '[deleted]';
      return res.send('success');
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
}

/**
 * PUT /api/replies/:board
 * Report a reply (set reported = true).
 */
async function reportReply(req, res) {
  try {
    await initDB();
    const { thread_id, reply_id } = req.body;

    if (isConnected) {
      const thread = await Thread.findById(thread_id);
      if (!thread) return res.send('incorrect password');

      const reply = thread.replies.id(reply_id);
      if (!reply) return res.send('incorrect password');

      reply.reported = true;
      await thread.save();
      return res.send('reported');
    } else {
      const thread = inMemoryThreads.find(t => t._id.toString() === (thread_id || '').toString());
      if (!thread) return res.send('incorrect password');

      const reply = thread.replies.find(r => r._id.toString() === (reply_id || '').toString());
      if (!reply) return res.send('incorrect password');

      reply.reported = true;
      return res.send('reported');
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Server error');
  }
}

module.exports = {
  createThread,
  getThreads,
  deleteThread,
  reportThread,
  createReply,
  getReplies,
  deleteReply,
  reportReply
};
