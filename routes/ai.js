// routes/ai.js
const express = require('express');
const Session = require('../models/Session');
const router = express.Router();

const MODEL = process.env.MODEL || 'gemini-2.5-flash';

/* ---------- tiny GIF proxy (optional) ---------- */
const GIF_CACHE = new Map();
const GIPHY_KEY = process.env.GIPHY_API_KEY || '';

router.get('/gif', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ ok: false });

    const key = `g:${q.toLowerCase()}`;
    if (GIF_CACHE.has(key)) return res.json({ ok: true, url: GIF_CACHE.get(key) });

    if (!GIPHY_KEY) return res.json({ ok: false }); // feature off if no key

    const u = new URL('https://api.giphy.com/v1/gifs/search');
    u.searchParams.set('api_key', GIPHY_KEY);
    u.searchParams.set('q', q);
    u.searchParams.set('limit', '1');
    u.searchParams.set('rating', 'g');

    const r = await fetch(u);
    const j = await r.json();
    const url = j?.data?.[0]?.images?.downsized_medium?.url || j?.data?.[0]?.images?.downsized?.url;
    if (url) GIF_CACHE.set(key, url);
    return res.json({ ok: !!url, url });
  } catch (e) {
    console.error('gif proxy error', e);
    return res.json({ ok: false });
  }
});

/* ---------- PLAN prompt ---------- */
const systemPlan = `
You are a workout program generator. Return STRICT JSON only:
{
  "weeks": <number>,
  "daysPerWeek": <number>,
  "plan": [
    {
      "day": "Day 1 - <focus>",
      "durationMin": <number>,
      "workout": [
        {"exercise":"<name>","sets":<number>,"reps":"<range or number>","rir":<number>}
      ],
      "finisher":"<optional>",
      "warmup":"<optional>",
      "cooldown":"<optional>"
    }
  ],
  "progression": "<1-2 lines>",
  "medicalNote": "<optional>"
}
No extra text. Tailor to goal/level/constraints/equipment/duration.
`;

/* ---------- Resiliency helpers (retry + fallbacks) ---------- */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGeminiWithRetry({ apiKey, modelNames, systemInstruction, payload, tries = 5, baseDelay = 700 }) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  let lastErr;
  for (const name of modelNames) {
    const model = genAI.getGenerativeModel({ model: name, systemInstruction });
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const res = await model.generateContent(JSON.stringify(payload));
        const txt = typeof res?.response?.text === 'function' ? res.response.text() : '{}';
        return { text: txt, usedModel: name };
      } catch (e) {
        lastErr = e;
        const status = e?.status || e?.statusCode;
        const transient = [429, 500, 502, 503, 504].includes(status);
        if (!transient || attempt === tries) break;
        const jitter = Math.floor(Math.random() * 250);
        await sleep(baseDelay * Math.pow(2, attempt - 1) + jitter);
      }
    }
    // try next fallback model
  }
  throw lastErr || new Error('Gemini call failed');
}

/* ---------- Shared worker (used by POST and GET) ---------- */
async function generateAndSavePlan(req) {
  // 0) Must be logged in (ensureAuth already guards this route, double-check anyway)
  const uid = req.user && req.user._id ? req.user._id : null;
  if (!uid) {
    const e = new Error('Not authenticated');
    e.status = 401;
    throw e;
  }

  // 1) Find/create latest session
  let s = await Session.findOne({ user: uid }).sort({ createdAt: -1 });
  if (!s) s = await Session.create({ user: uid });

  // 2) Merge incoming body (POST only)
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

  // 3) Mark planning
  s.state = 'PLANNING';
  await s.save();

  // 4) Build safe spec (NO direct req.user.name deref)
  const safeUser = (req.user && typeof req.user === 'object') ? req.user : {};
  const safeName =
    (typeof s.name === 'string' && s.name.trim()) ? s.name.trim() :
    (typeof safeUser.name === 'string' && safeUser.name.trim()) ? safeUser.name.trim() :
    'friend';

  const spec = {
    userName: safeName,
    age: (typeof s.age === 'number') ? s.age : undefined,
    goal: (s.goal && String(s.goal).trim()) || 'general fitness',
    level: (s.level && String(s.level).trim()) || 'beginner',
    constraints: (s.constraints && String(s.constraints).trim()) || 'none',
    daysPerWeek: (typeof s.daysPerWeek === 'number') ? s.daysPerWeek : 3,
    durationMin: (typeof s.durationMin === 'number') ? s.durationMin : 15,
    equipment: (Array.isArray(s.equipment) && s.equipment.length) ? s.equipment : ['bodyweight'],
  };

  // 5) Call Gemini with retry + fallbacks
  if (!process.env.GEMINI_API_KEY) {
    const e = new Error('Missing GEMINI_API_KEY');
    e.status = 500; throw e;
  }

  const fallbacks = [
    MODEL,                // env/default: 'gemini-2.5-flash'
    'gemini-1.5-flash',   // fast fallback
    'gemini-1.5-pro'      // stronger fallback
  ].filter(Boolean);

  let raw = '{}';
  try {
    const { text /*, usedModel*/ } = await callGeminiWithRetry({
      apiKey: process.env.GEMINI_API_KEY,
      modelNames: fallbacks,
      systemInstruction: systemPlan,
      payload: spec,
      tries: 5,
      baseDelay: 700
    });
    raw = text;
    // console.log('[gemini] used model:', usedModel);
  } catch (e) {
    s.state = 'ERROR'; await s.save();
    throw e;
  }

  // 6) Parse JSON strictly
  let plan;
  try { plan = JSON.parse(raw); }
  catch {
    const i = raw.indexOf('{'), j = raw.lastIndexOf('}');
    plan = JSON.parse(raw.slice(i, j + 1));
  }

  // 7) Save + mark ready
  s.plan = plan;
  s.state = 'PLAN_READY';
  await s.save();

  return { plan, uid };
}

/* ---------- Routes ---------- */

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

// GET /ai/plan (convenience)
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
