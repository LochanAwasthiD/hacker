// routes/ai.js
const express = require('express');
const Session = require('../models/Session');
const router = express.Router();

const MODEL = process.env.MODEL || 'gemini-2.5-flash';

/* ---------- GIF / IMAGE proxy (Giphy) ---------- */
const GIF_CACHE = new Map();
const GIPHY_KEY = process.env.GIPHY_API_KEY || '';

router.get('/gif', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ ok: false });

    const key = `g:${q.toLowerCase()}`;
    if (GIF_CACHE.has(key)) {
      const cached = GIF_CACHE.get(key);
      return res.json({
        ok: !!(cached.gif || cached.still),
        ...cached,
        url: cached.gif || cached.still
      });
    }

    if (!GIPHY_KEY) return res.json({ ok: false }); // feature off if no key

    const u = new URL('https://api.giphy.com/v1/gifs/search');
    u.searchParams.set('api_key', GIPHY_KEY);
    u.searchParams.set('q', q);
    u.searchParams.set('limit', '1');
    u.searchParams.set('rating', 'g');

    const r = await fetch(u);
    const j = await r.json();
    const images = j?.data?.[0]?.images || {};

    // Prefer larger, clearer GIF
    const gif =
      images.downsized_medium?.url ||
      images.downsized?.url ||
      images.original?.url ||
      images.preview_gif?.url ||
      images.fixed_height?.url ||
      null;

    // Sharp still fallback
    const still =
      images.downsized_still?.url ||
      images.original_still?.url ||
      images.fixed_height_still?.url ||
      null;

    const payload = {
      gif,
      still,
      gif_w: Number(images.downsized_medium?.width || images.downsized?.width || images.original?.width || 0),
      gif_h: Number(images.downsized_medium?.height || images.downsized?.height || images.original?.height || 0),
      still_w: Number(images.downsized_still?.width || images.original_still?.width || images.fixed_height_still?.width || 0),
      still_h: Number(images.downsized_still?.height || images.original_still?.height || images.fixed_height_still?.height || 0),
    };

    GIF_CACHE.set(key, payload);
    return res.json({ ok: !!(gif || still), ...payload, url: gif || still });
  } catch (e) {
    console.error('gif proxy error', e);
    return res.json({ ok: false });
  }
});

/* ---------- PLAN: single-week, N days ---------- */
const systemPlan = `
You are a workout program generator. Return STRICT JSON only for a SINGLE WEEK:

{
  "weeks": 1,
  "daysPerWeek": <number>,
  "plan": [
    {
      "day": "Day 1 - <focus>",
      "durationMin": <number>,
      "workout": [
        {"exercise":"<name>","sets":<number>,"reps":"<range or number>","rir":<number>,"videoUrl":"<optional>"}
      ],
      "finisher":"<optional>",
      "warmup":"<optional>",
      "cooldown":"<optional>"
    }
  ],
  "progression": "<1-2 lines>",
  "medicalNote": "<optional>"
}

Rules:
- Always output ONLY one week (weeks=1).
- Create EXACTLY 'daysPerWeek' days: Day 1 ... Day N.
- Tailor to goal/level/constraints/equipment/duration.
- No extra text; STRICT JSON only.
`;

// shared worker (used by POST and GET)
async function generateAndSavePlan(req) {
  const uid = req.user && req.user._id ? req.user._id : null;
  if (!uid) {
    const e = new Error('Not authenticated');
    e.status = 401;
    throw e;
  }

  // find/create latest session
  let s = await Session.findOne({ user: uid }).sort({ createdAt: -1 });
  if (!s) s = await Session.create({ user: uid });

  // merge incoming body (POST only)
  if (req.method === 'POST' && req.body && typeof req.body === 'object') {
    const patch = {};
    for (const k of ['name','age','goal','level','constraints','daysPerWeek','durationMin']) {
      const v = req.body[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        patch[k] = ['age','daysPerWeek','durationMin'].includes(k) ? Number(v) : String(v);
      }
    }
    if (req.body.equipment !== undefined) {
      const eq = Array.isArray(req.body.equipment)
        ? req.body.equipment
        : String(req.body.equipment).split(',').map(x => x.trim()).filter(Boolean);
      patch.equipment = eq;
    }
    if (Object.keys(patch).length) Object.assign(s, patch);
  }

  s.state = 'PLANNING';
  await s.save();

  const safeUser = (req.user && typeof req.user === 'object') ? req.user : {};
  const safeName =
    (typeof s.name === 'string' && s.name.trim()) ? s.name.trim() :
    (typeof safeUser.name === 'string' && safeUser.name.trim()) ? safeUser.name.trim() :
    'friend';

  const targetDays =
    (typeof s.daysPerWeek === 'number' && s.daysPerWeek >= 1 && s.daysPerWeek <= 7)
      ? s.daysPerWeek : 1;

  const spec = {
    userName: safeName,
    weeks: 1,
    daysPerWeek: targetDays,
    age: (typeof s.age === 'number') ? s.age : undefined,
    goal: (s.goal && String(s.goal).trim()) || 'general fitness',
    level: (s.level && String(s.level).trim()) || 'beginner',
    constraints: (s.constraints && String(s.constraints).trim()) || 'none',
    durationMin: (typeof s.durationMin === 'number') ? s.durationMin : 15,
    equipment: (Array.isArray(s.equipment) && s.equipment.length) ? s.equipment : ['bodyweight'],
  };

  if (!process.env.GEMINI_API_KEY) {
    const e = new Error('Missing GEMINI_API_KEY');
    e.status = 500;
    throw e;
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: systemPlan });

  const result = await model.generateContent(JSON.stringify(spec));
  const raw = (result && result.response && typeof result.response.text === 'function')
    ? result.response.text()
    : '{}';

  let plan;
  try {
    plan = JSON.parse(raw);
  } catch {
    const i = raw.indexOf('{');
    const j = raw.lastIndexOf('}');
    plan = JSON.parse(raw.slice(i, j + 1));
  }

  // normalize to 1 week + exactly N days (truncate if too many)
  plan = plan || {};
  plan.weeks = 1;
  plan.daysPerWeek = targetDays;
  if (!Array.isArray(plan.plan)) plan.plan = [];
  if (plan.plan.length > targetDays) plan.plan = plan.plan.slice(0, targetDays);

  s.plan = plan;
  s.state = 'PLAN_READY';
  await s.save();

  return { plan, uid };
}

// POST /ai/plan
router.post('/plan', async (req, res) => {
  let uid;
  try {
    const out = await generateAndSavePlan(req);
    uid = out.uid;
    const wantsJSON = req.headers.accept?.includes('application/json') || req.xhr;
    if (wantsJSON) return res.json({ ok: true, plan: out.plan });
    return res.redirect('/wizard/output');
  } catch (err) {
    console.error('AI plan error (POST):', err);
    try {
      uid = uid || (req.user && req.user._id);
      if (uid) {
        const s = await Session.findOne({ user: uid }).sort({ createdAt: -1 });
        if (s) { s.state = 'ERROR'; await s.save(); }
      }
    } catch {}
    if (req.headers.accept?.includes('application/json') || req.xhr) {
      return res.status(err.status || 500).json({ ok: false, error: 'Could not generate plan. Try again.' });
    }
    return res.redirect('/wizard/fitnessgoal?msg=plan_error');
  }
});

// GET /ai/plan  (convenience)
router.get('/plan', async (req, res) => {
  let uid;
  try {
    const out = await generateAndSavePlan(req);
    uid = out.uid;
    return res.redirect('/wizard/output');
  } catch (err) {
    console.error('AI plan error (GET):', err);
    try {
      uid = uid || (req.user && req.user._id);
      if (uid) {
        const s = await Session.findOne({ user: uid }).sort({ createdAt: -1 });
        if (s) { s.state = 'ERROR'; await s.save(); }
      }
    } catch {}
    return res.redirect('/wizard/fitnessgoal?msg=plan_error');
  }
});

module.exports = router;
