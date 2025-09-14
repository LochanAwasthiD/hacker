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
    equipment: eq.length ? eq : ['bodyweight'] // blank -> safe home workouts
  };
}

/* ----- deterministic rules helpers (no randomness) ----- */
function titleCase(s='') {
  return String(s).replace(/[_-]+/g,' ')
    .replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

function parseConstraints(cstr='') {
  const s = String(cstr || '').toLowerCase();
  return {
    none: !s || s === 'none',
    knee: /knee|patell|menisc|chondromalacia|acl|mcl|it\s*band/.test(s),
    back: /back|spine|disc|sciatica|lumbar|herniat/.test(s),
    shoulder: /shoulder|rotator|labrum|imping/.test(s),
    wrist: /wrist|carpal/.test(s),
    ankle: /ankle|achilles|sprain/.test(s),
    hypertension: /hypertension|high\s*blood\s*pressure|bp\b/.test(s),
    osteo: /osteoporosis|low\s*bone/.test(s),
    pregnant: /pregnan/.test(s),
  };
}

function getEquipTier(list) {
  const L = (Array.isArray(list) ? list : [list]).map(x => String(x||'').toLowerCase());
  if (L.some(x => /(barbell|rack|bench|cable|smith|gym)/.test(x))) return 'gym';
  if (L.some(x => /(dumbbell|kettlebell|kb|band|resistance|loop)/.test(x))) return 'min';
  return 'bw'; // default: bodyweight/home-safe
}

function allowed(ex, flags, tier) {
  // equipment gate
  if (tier === 'bw'  && ex.equip !== 'bw')  return false;
  if (tier === 'min' && ex.equip === 'gym') return false;
  // health implication gates
  if (Array.isArray(ex.avoid) && ex.avoid.some(tag => flags[tag])) return false;
  return true;
}

function firstAllowed(arr, flags, tier, n=1) {
  const out = [];
  for (const ex of arr) {
    if (allowed(ex, flags, tier)) out.push(ex);
    if (out.length >= n) break;
  }
  return out;
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

/* ---------- Deterministic, condition-aware offline plan ---------- */
function offlinePlan(spec) {
  const {
    daysPerWeek = 1,
    durationMin = 10,
    goal = 'general fitness',
    level = 'beginner',
    age,
    constraints = 'none',
    equipment = ['bodyweight'],
  } = spec || {};

  const flags = parseConstraints(constraints);
  const tier  = getEquipTier(equipment);

  // Exercise library with equipment & contraindication flags
  const LIB = {
    squat: [
      { name:'Sit-to-Stand (chair)', equip:'bw',  avoid:[] },
      { name:'Box Squat to Chair',   equip:'bw',  avoid:[] },
      { name:'Bodyweight Squat (comfortable depth)', equip:'bw', avoid:['knee'] },
      { name:'Step-ups (low step)',  equip:'bw',  avoid:['knee'] },
      { name:'Reverse Lunge (short stride)', equip:'bw', avoid:['knee'] },
      { name:'Goblet Squat',         equip:'min', avoid:['knee'] },
      { name:'Back Squat',           equip:'gym', avoid:['knee','osteo'] },
    ],
    hinge: [
      { name:'Glute Bridge',                   equip:'bw',  avoid:[] },
      { name:'Hip Hinge w/ Broomstick',       equip:'bw',  avoid:['back'] },
      { name:'Bird Dog',                       equip:'bw',  avoid:[] },
      { name:'Romanian Deadlift (dumbbells)',  equip:'min', avoid:['back','osteo'] },
      { name:'Barbell RDL',                    equip:'gym', avoid:['back','osteo'] },
    ],
    push: [
      { name:'Wall Push-up',                   equip:'bw',  avoid:[] },
      { name:'Incline Push-up (bench/table)',  equip:'bw',  avoid:[] },
      { name:'Push-up',                        equip:'bw',  avoid:['shoulder','wrist'] },
      { name:'Dumbbell Floor Press',           equip:'min', avoid:['shoulder'] },
      { name:'Barbell Bench Press',            equip:'gym', avoid:['shoulder','osteo'] },
    ],
    pull: [
      { name:'Table Inverted Row',         equip:'bw',  avoid:[] },
      { name:'Towel Row (door anchor)',    equip:'bw',  avoid:[] },
      { name:'Band Row',                   equip:'min', avoid:[] },
      { name:'One-Arm Dumbbell Row',       equip:'min', avoid:[] },
      { name:'Lat Pulldown',               equip:'gym', avoid:[] },
      { name:'Barbell Row',                equip:'gym', avoid:['back','osteo'] },
    ],
    core: [
      { name:'Dead Bug',             equip:'bw',  avoid:[] },
      { name:'Bird Dog',             equip:'bw',  avoid:[] },
      { name:'Side Plank (knees)',   equip:'bw',  avoid:['hypertension','shoulder'] },
      { name:'Pallof Press (band)',  equip:'min', avoid:[] },
      { name:'Front Plank',          equip:'bw',  avoid:['shoulder','hypertension'] },
    ],
    endurance: [
      { name:'March in Place (brisk)',                 equip:'bw',  avoid:[] },
      { name:'Step Jacks (low impact)',                equip:'bw',  avoid:['knee'] },
      { name:'Shadow Boxing',                          equip:'bw',  avoid:[] },
      { name:'Low-Impact Mountain Climbers (elevated)',equip:'bw',  avoid:['wrist','knee'] },
      { name:'Fast Walk (indoor/outdoor)',             equip:'bw',  avoid:[] },
    ],
    mobility: [
      { name:'Cat-Cow',                         equip:'bw', avoid:[] },
      { name:'Thoracic Openers (book openers)', equip:'bw', avoid:[] },
      { name:'Hip Flexor Stretch (gentle)',     equip:'bw', avoid:[] },
      { name:'Ankle Circles',                   equip:'bw', avoid:[] },
      { name:'Hamstring Stretch (strap/towel)', equip:'bw', avoid:[] },
    ],
    balance: [
      { name:'Tandem Stance (support nearby)', equip:'bw', avoid:[] },
      { name:'Heel-to-Toe Walk',               equip:'bw', avoid:[] },
      { name:'Single-Leg Balance (support)',   equip:'bw', avoid:['ankle'] },
      { name:'Calf Raises (counter support)',  equip:'bw', avoid:[] },
    ],
  };

  // Volume & progress knobs
  const lvl = String(level).toLowerCase();
  const sets =
    lvl.includes('advanced')     ? 4 :
    lvl.includes('intermediate') ? 3 : 2;

  const isOlder = Number(age) >= 55;
  const repMain = isOlder ? '8–12' : (lvl.includes('advanced') ? '10–15' : '8–12');
  const repAux  = isOlder ? '8–10' : '10–12';
  const holdCore= flags.hypertension ? '10–20s' : (isOlder ? '15–25s' : '20–30s');
  const rir     = flags.hypertension || isOlder ? 2 : (lvl.includes('advanced') ? 1 : 2);

  // Warmup & cooldown
  const warmup = [
    '2 min brisk march',
    flags.back ? 'Cat-Cow x8' : 'Hip Hinge Drill x8',
    'Arm Circles x10/dir',
  ].join(', ');

  const cooldown = [
    'Calf & Quad Stretch 30s/side',
    flags.back ? 'Child’s Pose 30s' : 'Hamstring Stretch 30s/side',
    'Deep breaths (no breath-holding)',
  ].join(', ');

  // Day builders
  function buildStrengthDay(idx) {
    const list = [];
    list.push(...firstAllowed(LIB.squat, flags, tier, 1));
    list.push(...firstAllowed(LIB.push,  flags, tier, 1));
    list.push(...firstAllowed(LIB.hinge, flags, tier, 1));

    const pulls = firstAllowed(LIB.pull, flags, tier, 1);
    if (pulls.length) list.push(...pulls);
    else list.push(...firstAllowed(LIB.core, flags, tier, 1));

    const cores = firstAllowed(LIB.core, flags, tier, 1);
    if (cores.length) list.push(...cores);

    return {
      day: `Day ${idx} - ${titleCase(goal) || 'Strength'}`,
      durationMin,
      warmup,
      workout: list.slice(0, 5).map(ex => ({
        exercise: ex.name,
        sets,
        reps: /Plank|Dead Bug|Bird Dog|Pallof/.test(ex.name) ? holdCore : (/Row|Press|Push|Squat|Lunge|Hinge|Bridge|Step|RDL/i.test(ex.name) ? repMain : repAux),
        rir
      })),
      finisher: tier === 'bw' ? 'Optional: 2 min brisk march + step-ups (low box) x20 total' : 'Optional: 2 min brisk march',
      cooldown
    };
  }

  function buildEnduranceDay(idx) {
    const moves = [
      ...firstAllowed(LIB.endurance, flags, tier, 3),
      ...firstAllowed(LIB.core, flags, tier, 1),
    ].slice(0, 4);

    return {
      day: `Day ${idx} - Low-Impact Cardio`,
      durationMin,
      warmup,
      workout: moves.map(ex => ({
        exercise: ex.name,
        sets,
        reps: '30–45s',
        rir: 2
      })),
      finisher: '2 min shadow boxing or fast walk',
      cooldown
    };
  }

  function buildMobilityDay(idx) {
    const mobs = firstAllowed(LIB.mobility, flags, tier, 4);
    const bal  = firstAllowed(LIB.balance,  flags, tier, 1);
    return {
      day: `Day ${idx} - Mobility & Balance`,
      durationMin,
      warmup: 'Gentle joint circles, easy march',
      workout: [...mobs, ...bal].map(ex => ({
        exercise: ex.name,
        sets: 2,
        reps: '30–45s',
        rir: 3
      })),
      finisher: 'Nasal breathing walk 2–3 min',
      cooldown
    };
  }

  function buildCoreDay(idx) {
    const cores = firstAllowed(LIB.core, flags, tier, 3);
    const glute = firstAllowed(LIB.hinge, flags, tier, 1);
    return {
      day: `Day ${idx} - Core & Glutes`,
      durationMin,
      warmup,
      workout: [...cores, ...glute].map(ex => ({
        exercise: ex.name,
        sets,
        reps: /Dead Bug|Bird Dog/.test(ex.name) ? '8–10/side' : holdCore,
        rir
      })),
      finisher: 'Suitcase hold 20–30s/side if safe (skip if hypertension)',
      cooldown
    };
  }

  // Builder rotation by goal
  const g = String(goal).toLowerCase();
  const builders = g.includes('endurance') || g.includes('cardio')
    ? [buildEnduranceDay, buildStrengthDay, buildEnduranceDay, buildCoreDay]
    : g.includes('mobility') || g.includes('flex')
    ? [buildMobilityDay, buildStrengthDay, buildMobilityDay, buildCoreDay]
    : g.includes('core')
    ? [buildCoreDay, buildStrengthDay, buildCoreDay, buildMobilityDay]
    : g.includes('muscle') || g.includes('strength')
    ? [buildStrengthDay, buildStrengthDay, buildCoreDay, buildMobilityDay]
    : [buildStrengthDay, buildCoreDay, buildEnduranceDay, buildMobilityDay]; // general fitness

  const planDays = [];
  for (let d = 1; d <= daysPerWeek; d++) {
    const builder = builders[(d - 1) % builders.length];
    planDays.push(builder(d));
  }

  return {
    weeks: 1,
    daysPerWeek,
    plan: planDays,
    progression: isOlder
      ? 'Add a rep every other session; prioritize range of motion and stability.'
      : 'Add 1–2 reps or 1 set when all sets feel smooth; progress to harder variations.',
    medicalNote: flags.none
      ? 'Move with control; stop any exercise that causes pain.'
      : 'Program adjusted for your notes (e.g., joints/BP). Keep breaths smooth; stop anything painful.',
    meta: { source: 'rules', model: null, tier, flags },
  };
}

/* =========================
   Gemini caller w/ retries
   ========================= */
async function callGemini(spec) {
  // Force deterministic engine if requested
  if (process.env.PLAN_ENGINE === 'rules') {
    return addMediaLinks(offlinePlan(spec));
  }

  if (!process.env.GEMINI_API_KEY) {
    // No key provided – deterministic plan keeps UX working
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

  // ensure media links are present
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

  // ensure media links
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
