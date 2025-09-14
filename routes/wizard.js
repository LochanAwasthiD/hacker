// routes/wizard.js
const express = require('express');
const User = require('../models/user');
const Session = require('../models/Session');

const router = express.Router();

/* ---------- helpers ---------- */
async function getSessionFor(userId) {
  let s = await Session.findOne({ user: userId }).sort({ createdAt: -1 });
  if (!s) s = await Session.create({ user: userId });
  return s;
}

function saveGuestSpec(req, patch = {}) {
  req.session.guestSpec = { ...(req.session.guestSpec || {}), ...patch };
}

/* ========== NAME + AGE ========== */
router.get('/name-age', (req, res) => {
  res.render('microworkout/nameandage', {
    title: 'Tell us about you',
    user: req.user,
  });
});

router.post('/name-age', async (req, res) => {
  try {
    const { name, age } = req.body;

    if (req.isAuthenticated && req.isAuthenticated()) {
      await User.findByIdAndUpdate(req.user._id, {
        name: (name || '').trim(),
        age: Number(age) || undefined,
      });
      const s = await getSessionFor(req.user._id);
      s.name = (name || '').trim();
      s.age = Number(age) || undefined;
      await s.save();
    } else {
      saveGuestSpec(req, { name: (name || '').trim(), age: Number(age) || undefined });
    }

    res.redirect('/wizard/fitness-level');
  } catch (e) {
    console.error('name/age error:', e);
    res.redirect('/wizard/name-age?msg=Could+not+save');
  }
});

/* ========== LEVEL ========== */
router.get('/fitness-level', (req, res) => {
  res.render('microworkout/fitnesslevel', { title: 'Fitness Level', user: req.user });
});

async function saveLevelAndNext(req, res) {
  try {
    const level = String(req.body.level || '').toLowerCase();
    if (!['beginner', 'intermediate', 'advanced'].includes(level)) {
      return res.redirect('/wizard/fitness-level?msg=invalid_level');
    }

    if (req.isAuthenticated && req.isAuthenticated()) {
      await User.findByIdAndUpdate(req.user._id, { level });
      const s = await getSessionFor(req.user._id);
      s.level = level;
      await s.save();
    } else {
      saveGuestSpec(req, { level });
    }

    res.redirect('/wizard/fitnessgoal');
  } catch (e) {
    console.error('level error:', e);
    res.redirect('/wizard/fitness-level?msg=Could+not+save');
  }
}
router.post('/fitness-level', saveLevelAndNext);
router.post('/fitness-goal', saveLevelAndNext);

/* ========== GOAL ========== */
router.get('/fitnessgoal', (req, res) => {
  res.render('microworkout/fitnessgoal', { title: 'Fitness Goal', user: req.user });
});

async function saveGoalAndNext(req, res) {
  try {
    const raw = String(req.body.goal || '').trim();
    if (!raw) return res.redirect('/wizard/fitnessgoal?msg=missing_goal');

    const map = {
      'Weight Loss/Fat Burn': 'weight_loss',
      'Muscle Gain/Strength': 'muscle_gain',
      'Endurance/Cardio': 'endurance',
      'Flexibility/Mobility': 'mobility',
      'Core Strength/Stability': 'core',
    };
    const goal = map[raw] || raw;

    if (req.isAuthenticated && req.isAuthenticated()) {
      await User.findByIdAndUpdate(req.user._id, { primaryGoal: goal });
      const s = await getSessionFor(req.user._id);
      s.goal = goal;
      await s.save();
    } else {
      saveGuestSpec(req, { goal });
    }

    res.redirect('/wizard/healthimplication');
  } catch (e) {
    console.error('goal error:', e);
    res.redirect('/wizard/fitnessgoal?msg=Could+not+save');
  }
}
router.post('/fitnessgoal', saveGoalAndNext);
router.post('/health-goal', saveGoalAndNext);

/* ========== HEALTH (constraints) ========== */
router.get('/healthimplication', (req, res) => {
  res.render('microworkout/healthimplication', { title: 'Health Considerations', user: req.user });
});

async function saveConstraintsAndNext(req, res) {
  try {
    const constraints = String(req.body.constraints || '').trim();
    if (req.isAuthenticated && req.isAuthenticated()) {
      const s = await getSessionFor(req.user._id);
      s.constraints = constraints || undefined;
      await s.save();
    } else {
      saveGuestSpec(req, { constraints: constraints || undefined });
    }
    res.redirect('/wizard/equipment');
  } catch (e) {
    console.error('constraints error:', e);
    res.redirect('/wizard/healthimplication?msg=Could+not+save');
  }
}
router.post('/healthimplication', saveConstraintsAndNext);
router.post('/equipment-goal', saveConstraintsAndNext);

/* ========== EQUIPMENT ========== */
router.get('/equipment', (req, res) => {
  res.render('microworkout/equipment', { title: 'Equipment', user: req.user });
});

async function saveEquipmentAndNext(req, res) {
  try {
    const eq = Array.isArray(req.body.equipment)
      ? req.body.equipment
      : String(req.body.equipment || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

    if (req.isAuthenticated && req.isAuthenticated()) {
      const s = await getSessionFor(req.user._id);
      s.equipment = eq;
      await s.save();
    } else {
      saveGuestSpec(req, { equipment: eq });
    }

    res.redirect('/wizard/output-goal'); // duration page
  } catch (e) {
    console.error('equipment error:', e);
    res.redirect('/wizard/equipment?msg=Could+not+save');
  }
}
router.post('/equipment', saveEquipmentAndNext);
router.post('/duration-goal', saveEquipmentAndNext);

/* ========== DURATION (and days per week) ========== */
router.get('/duration', (req, res) => {
  res.render('microworkout/duration', { title: 'Duration', user: req.user });
});
router.get('/output-goal', (req, res) => {
  res.render('microworkout/duration', { title: 'Duration', user: req.user });
});

// Save duration + days, then /ai/plan will generate and redirect to /wizard/output
router.post(['/output-goal', '/duration'], async (req, res) => {
  try {
    const durationMin = Math.max(6, Math.min(60, Number(req.body.durationMin) || 15)); // >5
    const days = Math.max(2, Math.min(7, Number(req.body.daysPerWeek) || 1)); // >1, ≤7

    if (req.isAuthenticated && req.isAuthenticated()) {
      const s = await getSessionFor(req.user._id);
      s.durationMin = durationMin;
      s.daysPerWeek = days;
      await s.save();
    } else {
      saveGuestSpec(req, { durationMin, daysPerWeek: days });
    }

    res.redirect('/ai/plan'); // route decides authed vs guest
  } catch (e) {
    console.error('duration error:', e);
    res.redirect('/wizard/duration?msg=Could+not+save');
  }
});

/* ========== OUTPUT ========== */
router.get('/output', async (req, res) => {
  try {
    let plan = null;
    let s = null;

    if (req.isAuthenticated && req.isAuthenticated()) {
      s = await Session.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean();
      plan = s?.plan || null;
    } else {
      plan = req.session.guestPlan || null;
    }

    if (!plan) return res.redirect('/wizard/fitnessgoal?msg=no_plan');

    // guestRemaining: 1 free total; show in UI
    const attempts = Number(req.session.guestAttempts || 0);
    const guestRemaining = (req.isAuthenticated && req.isAuthenticated()) ? 0 : Math.max(0, 1 - attempts);

    res.render('microworkout/output', {
      title: 'Your Plan',
      plan,
      s,
      user: req.user,
      guestRemaining,
    });
  } catch (e) {
    console.error('output render error:', e);
    res.redirect('/wizard/fitnessgoal?msg=render_error');
  }
});

/* ========== STATUS (optional) ========== */
router.get('/status', async (req, res) => {
  try {
    if (req.isAuthenticated && req.isAuthenticated()) {
      const s = await Session.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean();
      return res.json({ ok: true, state: s?.state || 'INTAKE' });
    }
    return res.json({ ok: true, state: req.session.guestState || 'INTAKE' });
  } catch (e) {
    console.error('wizard/status error:', e);
    return res.status(500).json({ ok: false, error: 'status_failed' });
  }
});

module.exports = router;
