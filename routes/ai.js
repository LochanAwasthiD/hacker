// routes/ai.js
const express = require('express');
const Session = require('../models/Session');
const router = express.Router();

/* =========================
   Model + resilience config
   ========================= */
const DEFAULT_MODEL = process.env.MODEL || 'gemini-2.5-flash';
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || 'gemini-1.5-flash,gemini-1.5-pro')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const MAX_RETRIES   = Number(process.env.GEMINI_MAX_RETRIES || 4);
const BASE_DELAY_MS = Number(process.env.GEMINI_RETRY_BASE_MS || 400);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function isRetryable(err) {
  const msg = String(err?.message || '').toLowerCase();
  const st  = Number(err?.status || 0);
  // capacity, rate-limit, transient/network-ish
  return st === 503 || st === 429 || msg.includes('overloaded') || msg.includes('network') || msg.includes('fetch');
}

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

/* ---------- PLAN prompt: single-week, N days ---------- */
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

/* =========================
   Helpers (authed + guest)
   ========================= */
function coerceSpecFromBodyOrDefaults(body = {}) {
  const clamp = (n, lo, hi, def) => {
    const v = Number(n);
    if (Number.isFinite(v)) return Math.max(lo, Math.min(hi, v));
    return def;
  };

  const days = clamp(body.daysPerWeek, 1, 7, 1);
  const duration = clamp(body.durationMin, 5, 60, 15);

  const eq = Array.isArray(body.equipment)
    ? body.equipment
    : String(body.equipment || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);

  return {
    userName: (body.name || 'friend').toString().trim() || 'friend',
    weeks: 1,
    daysPerWeek: days,
    age: body.age ? Number(body.age) : undefined,
    goal: (body.goal || 'general fitness').toString(),
    level: (body.level || 'beginner').toString(),
    constraints: (body.constraints || 'none').toString(),
    durationMin: duration,
    equipment: eq.length ? eq : ['bodyweight']
  };
}

/* Inject media links so every workout has a YouTube/GIF destination */
function addMediaLinks(plan) {
  if (!plan || !Array.isArray(plan.plan)) return plan;
  for (const day of plan.plan) {
    if (!Array.isArray(day.workout)) continue;
    for (const w of day.workout) {
      const q = String(w?.exercise || '').trim();
      if (!q) continue;
      if (!w.videoUrl) {
        w.videoUrl = 'https://www.youtube.com/results?search_query=' +
          encodeURIComponent(q + ' proper form');
      }
      if (!w.gifSearch) {
        w.gifSearch = 'https://giphy.com/search/' + encodeURIComponent(q);
      }
    }
  }
  return plan;
}

/* Fallback offline plan so UX never blocks */
function offlinePlan(spec) {
  const { daysPerWeek = 1, durationMin = 10, goal = 'general fitness' } = spec || {};
  const pools = {
    general:   ['Bodyweight Squats', 'Push-ups (on knees or full)', 'Plank', 'Glute Bridges', 'Reverse Lunges', 'Superman Hold'],
    core:      ['Crunches', 'Dead Bug', 'Russian Twists', 'Plank', 'Side Plank', 'Leg Raises'],
    mobility:  ['Cat-Cow', 'World’s Greatest Stretch', 'Thoracic Rotations', 'Hip Flexor Stretch', 'Hamstring Stretch', 'Child’s Pose'],
    endurance: ['Jumping Jacks', 'High Knees', 'Mountain Climbers', 'Skater Hops', 'Butt Kicks', 'Burpees (modified)'],
    strength:  ['Bodyweight Squats', 'Split Squats', 'Push-ups', 'Glute Bridges', 'Inverted Rows (table)', 'Hip Hinge'],
  };
  const bucket =
    /core/.test(goal) ? pools.core :
    /mobility|flex/.test(goal) ? pools.mobility :
    /endurance|cardio/.test(goal) ? pools.endurance :
    /muscle|strength/.test(goal) ? pools.strength : pools.general;

  const pick3 = (arr) => arr.slice(0, 3);
  const days = [];
  for (let d = 1; d <= daysPerWeek; d++) {
    const workout = pick3(bucket).map((name, i) => ({
      exercise: name,
      sets: 2,
      reps: (name.toLowerCase().includes('plank') || name.toLowerCase().includes('hold')) ? '20–40s hold' : (i === 0 ? '10–15' : '8–12'),
      rir: 1,
    }));
    days.push({
      day: `Day ${d} - ${String(goal).replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}`,
      durationMin,
      warmup: '1 min: Cat-Cow (30s), Arm Circles (30s)',
      workout,
      cooldown: '1 min: Quad Stretch (30s/side), Hamstring Stretch (30s)'
    });
  }
  return {
    weeks: 1,
    daysPerWeek,
    plan: days,
    progression: 'Add 1 rep each session; when easy, add a 3rd set.',
    medicalNote: 'Stop anything painful; keep movements controlled.',
    meta: { source: 'fallback', model: null }
  };
}

/* Resilient Gemini caller with retries + model fallback */
async function callGemini(spec) {
  if (!process.env.GEMINI_API_KEY) {
    // No key provided – return offline plan (keeps UX working)
    return addMediaLinks(offlinePlan(spec));
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const modelsToTry = [DEFAULT_MODEL, ...FALLBACK_MODELS];

  let lastErr = null;

  for (const modelName of modelsToTry) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPlan
      });

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await model.generateContent(JSON.stringify(spec));
          const raw =
            (result && result.response && typeof result.response.text === 'function')
              ? result.response.text()
              : '{}';

          let plan;
          try { plan = JSON.parse(raw); }
          catch {
            const i = raw.indexOf('{');
            const j = raw.lastIndexOf('}');
            plan = JSON.parse(raw.slice(i, j + 1));
          }

          // normalize
          plan = plan || {};
          plan.weeks = 1;
          plan.daysPerWeek = spec.daysPerWeek;
          if (!Array.isArray(plan.plan)) plan.plan = [];
          if (plan.plan.length > spec.daysPerWeek) plan.plan = plan.plan.slice(0, spec.daysPerWeek);
          plan.meta = { source: 'gemini', model: modelName, retries: attempt - 1 };

          return addMediaLinks(plan);
        } catch (err) {
          lastErr = err;
          if (isRetryable(err) && attempt < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
            await sleep(delay);
            continue; // retry same model
          }
          break; // non-retryable for this model → try next model
        }
      }
    } catch (errOuter) {
      lastErr = errOuter;
      // try next model
      continue;
    }
  }

  console.error('Gemini failed across models; using offline plan:', lastErr);
  return addMediaLinks(offlinePlan(spec));
}

/* =========================
   AUTHEd path (DB Session)
   ========================= */
async function generateAndSavePlan(req) {
  const uid = req.user && req.user._id ? req.user._id : null;
  if (!uid) {
    const e = new Error('Not authenticated');
    e.status = 401;
    throw e;
  }

  let s = await Session.findOne({ user: uid }).sort({ createdAt: -1 });
  if (!s) s = await Session.create({ user: uid });

  // consider any posted overrides
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

  const safeName =
    (typeof s.name === 'string' && s.name.trim()) ? s.name.trim() :
    (req.user?.name && String(req.user.name).trim()) || 'friend';

  const spec = coerceSpecFromBodyOrDefaults({
    ...s.toObject(),
    name: safeName
  });

  let plan = await callGemini(spec);

  // belt & suspenders: ensure media links are present
  plan = addMediaLinks(plan);

  s.plan = plan;
  s.state = 'PLAN_READY';
  await s.save();

  return { plan, uid };
}

/* =========================
   Guest path (1 attempt)
   ========================= */
async function generateGuestPlan(req) {
  req.session.guestAttempts = Number(req.session.guestAttempts || 0);
  if (req.session.guestAttempts >= 1) {
    const e = new Error('login_required');
    e.status = 429;
    throw e;
  }

  // merge prior guest inputs collected across wizard
  const body = { ...(req.session.guestSpec || {}), ...(req.body || {}) };
  const spec = coerceSpecFromBodyOrDefaults(body);

  req.session.guestState = 'PLANNING';

  let plan = await callGemini(spec);

  // normalize/truncate already done in callGemini; just ensure media links
  plan = addMediaLinks(plan);

  req.session.guestPlan = plan;
  req.session.guestState = 'PLAN_READY';
  req.session.guestAttempts += 1;

  return plan;
}

/* =========================
   Routes
   ========================= */

// POST /ai/plan  (authed OR guest)
router.post('/plan', async (req, res) => {
  let uid = null;
  try {
    let out;
    if (req.isAuthenticated && req.isAuthenticated()) {
      out = await generateAndSavePlan(req);
      uid = out.uid;
    } else {
      const plan = await generateGuestPlan(req);
      out = { plan };
    }

    const wantsJSON = req.headers.accept?.includes('application/json') || req.xhr;
    if (wantsJSON) return res.json({ ok: true, plan: out.plan });
    return res.redirect('/wizard/output');
  } catch (err) {
    console.error('AI plan error (POST):', err);

    // mark DB session errored if authed
    try {
      uid = uid || (req.user && req.user._id);
      if (uid) {
        const s = await Session.findOne({ user: uid }).sort({ createdAt: -1 });
        if (s) { s.state = 'ERROR'; await s.save(); }
      }
    } catch {}

    if (req.headers.accept?.includes('application/json') || req.xhr) {
      const status = err.status || 500;
      return res.status(status).json({
        ok: false,
        error: err.message === 'login_required' ? 'login_required' : 'Could not generate plan. Try again.'
      });
    }
    return res.redirect('/wizard/fitnessgoal?msg=plan_error');
  }
});

// GET /ai/plan  (convenience; authed OR guest)
router.get('/plan', async (req, res) => {
  try {
    if (req.isAuthenticated && req.isAuthenticated()) {
      await generateAndSavePlan(req);
    } else {
      await generateGuestPlan(req);
    }
    return res.redirect('/wizard/output');
  } catch (err) {
    console.error('AI plan error (GET):', err);

    // If guest exceeded the free attempt, send them back to the plan they already have with a clear message.
    if (err && err.message === 'login_required') {
      return res.redirect('/wizard/output?msg=login_required');
    }

    return res.redirect('/wizard/fitnessgoal?msg=' + encodeURIComponent(err.message || 'plan_error'));
  }
});

module.exports = router;
