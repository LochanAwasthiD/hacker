// routes/wizard.js
const express = require('express');
const User = require('../models/user');
const Session = require('../models/Session');
const router = express.Router();

// Find or create a session row for this user
async function getSessionFor(userId) {
  let s = await Session.findOne({ user: userId }).sort({ createdAt: -1 });
  if (!s) s = await Session.create({ user: userId });
  return s;
}

/* ========== NAME + AGE ========== */
router.get('/name-age', (req, res) => {
  res.render('microworkout/nameandage', { title: 'Tell us about you', user: req.user });
});

router.post('/name-age', async (req, res) => {
  try {
    const { name, age } = req.body;

    // Save on User
    await User.findByIdAndUpdate(req.user._id, {
      name: (name || '').trim(),
      age: Number(age) || undefined
    });

    // Save on Session
    const s = await getSessionFor(req.user._id);
    s.name = (name || '').trim();
    s.age = Number(age) || undefined;
    await s.save();

    res.redirect('/wizard/fitness-level');
  } catch (e) {
    console.error('name/age error:', e);
    res.redirect('/wizard/name-age?msg=Could+not+save');
  }
});

/* ========== LEVEL ========== */
// Page
router.get('/fitness-level', (req, res) => {
  res.render('microworkout/fitnesslevel', { title: 'Fitness Level', user: req.user });
});

// Save (supports both /fitness-level and your UI alias /fitness-goal)
async function saveLevelAndNext(req, res) {
  try {
    const level = String(req.body.level || '').toLowerCase();
    if (!['beginner','intermediate','advanced'].includes(level)) {
      return res.redirect('/wizard/fitness-level?msg=invalid_level');
    }

    await User.findByIdAndUpdate(req.user._id, { level });

    const s = await getSessionFor(req.user._id);
    s.level = level;
    await s.save();

    res.redirect('/wizard/fitnessgoal');
  } catch (e) {
    console.error('level error:', e);
    res.redirect('/wizard/fitness-level?msg=Could+not+save');
  }
}

router.post('/fitness-level', saveLevelAndNext); // canonical
router.post('/fitness-goal',  saveLevelAndNext); // your UI posts here

/* ========== GOAL ========== */
// Page
router.get('/fitnessgoal', (req, res) => {
  res.render('microworkout/fitnessgoal', { title: 'Fitness Goal', user: req.user });
});

// Save (supports both /fitnessgoal and your UI alias /health-goal)
async function saveGoalAndNext(req, res) {
  try {
    const raw = String(req.body.goal || '').trim();
    if (!raw) return res.redirect('/wizard/fitnessgoal?msg=missing_goal');

    const map = {
      'Weight Loss/Fat Burn': 'weight_loss',
      'Muscle Gain/Strength': 'muscle_gain',
      'Endurance/Cardio': 'endurance',
      'Flexibility/Mobility': 'mobility',
      'Core Strength/Stability': 'core'
    };
    const goal = map[raw] || raw;

    await User.findByIdAndUpdate(req.user._id, { primaryGoal: goal });

    const s = await getSessionFor(req.user._id);
    s.goal = goal;
    await s.save();

    res.redirect('/wizard/healthimplication');
  } catch (e) {
    console.error('goal error:', e);
    res.redirect('/wizard/fitnessgoal?msg=Could+not+save');
  }
}

router.post('/fitnessgoal', saveGoalAndNext); // canonical
router.post('/health-goal', saveGoalAndNext); // your UI posts here

/* ========== HEALTH (constraints) ========== */
// Page
router.get('/healthimplication', (req, res) => {
  res.render('microworkout/healthimplication', { title: 'Health Considerations', user: req.user });
});

// Save (supports /healthimplication and your UI alias /equipment-goal)
async function saveConstraintsAndNext(req, res) {
  try {
    const constraints = String(req.body.constraints || '').trim();

    const s = await getSessionFor(req.user._id);
    s.constraints = constraints || undefined;
    await s.save();

    res.redirect('/wizard/equipment');
  } catch (e) {
    console.error('constraints error:', e);
    res.redirect('/wizard/healthimplication?msg=Could+not+save');
  }
}

router.post('/healthimplication', saveConstraintsAndNext); // canonical
router.post('/equipment-goal',   saveConstraintsAndNext); // your UI posts here

/* ========== EQUIPMENT ========== */
// Page
router.get('/equipment', (req, res) => {
  res.render('microworkout/equipment', { title: 'Equipment', user: req.user });
});

// Save (supports /equipment and your UI alias /duration-goal)
async function saveEquipmentAndNext(req, res) {
  try {
    const eq = Array.isArray(req.body.equipment)
      ? req.body.equipment
      : String(req.body.equipment || '').split(',').map(x => x.trim()).filter(Boolean);

    const s = await getSessionFor(req.user._id);
    s.equipment = eq;
    await s.save();

    // Your next page is called "output-goal" (this is the duration page)
    res.redirect('/wizard/output-goal');
  } catch (e) {
    console.error('equipment error:', e);
    res.redirect('/wizard/equipment?msg=Could+not+save');
  }
}

router.post('/equipment',     saveEquipmentAndNext); // canonical
router.post('/duration-goal', saveEquipmentAndNext); // your UI posts here

/* ========== DURATION ========== */
// Pages (both show the same duration UI)
router.get('/duration', (req, res) => {
  res.render('microworkout/duration', { title: 'Duration', user: req.user });
});
router.get('/output-goal', (req, res) => {
  res.render('microworkout/duration', { title: 'Duration', user: req.user });
});

// Save duration, then generate plan with Gemini (handled by /ai/plan)
async function saveDurationAndGenerate(req, res) {
  try {
    const durationMin = Math.max(5, Number(req.body.durationMin) || 15);

    const s = await getSessionFor(req.user._id);
    s.durationMin = durationMin;
    if (!s.daysPerWeek) s.daysPerWeek = 3; // default
    await s.save();

    // /ai/plan will call Gemini and then redirect to /wizard/output
    res.redirect('/ai/plan');
  } catch (e) {
    console.error('duration error:', e);
    res.redirect('/wizard/duration?msg=Could+not+save');
  }
}

router.post('/duration',    saveDurationAndGenerate); // canonical
router.post('/output-goal', saveDurationAndGenerate); // your UI posts here

/* ========== OUTPUT ========== */
// Show the plan saved on Session by /ai/plan
router.get('/output', async (req, res) => {
  try {
    const s = await Session.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    if (!s || !s.plan) return res.redirect('/wizard/fitnessgoal?msg=no_plan');
    res.render('microworkout/output', { title: 'Your Plan', plan: s.plan, s, user: req.user });
  } catch (e) {
    console.error('output render error:', e);
    res.redirect('/wizard/fitnessgoal?msg=render_error');
  }
});

// GET /wizard/status  (polled by generating.ejs)
router.get('/status', async (req, res) => {
  try {
    const s = await Session.findOne({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ ok: true, state: s?.state || 'INTAKE' });
  } catch (e) {
    console.error('wizard/status error:', e);
    return res.status(500).json({ ok: false, error: 'status_failed' });
  }
});

module.exports = router;
