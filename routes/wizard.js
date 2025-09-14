// routes/wizard.js
const express = require('express');
const User = require('../models/user');
const router = express.Router();
const Session = require('../models/Session');

// 1) Name & Age
router.get('/name-age', (req, res) => {
  res.render('microworkout/nameandage', { title: 'Tell us about you', user: req.user, query: req.query });
});

router.post('/name-age', async (req, res) => {
  try {
    const { name, age } = req.body;
    await User.findByIdAndUpdate(req.user._id, {
      name: (name || '').trim(),
      age: Number(age) || undefined
    });
    return res.redirect('/wizard/fitness-level');
  } catch (e) {
    console.error('Save name/age error:', e);
    return res.redirect('/wizard/name-age?msg=Could+not+save');
  }
});

// 2) Fitness level
router.get('/fitness-level', (req, res) => {
  res.render('microworkout/fitnesslevel', { title: 'Fitness Level', user: req.user });
});

router.post('/fitness-level', async (req, res) => {
  try {
    const level = String(req.body.level || '').toLowerCase();
    if (['beginner','intermediate','advanced'].includes(level)) {
      await User.findByIdAndUpdate(req.user._id, { level });
    }
    return res.redirect('/wizard/fitnessgoal');
  } catch (e) {
    console.error('Save level error:', e);
    return res.redirect('/wizard/fitnessgoal');
  }
});

// 3) Primary fitness goal
router.get('/fitness-goal', (req, res) => {
  // file: views/microworkout/fitnessgoal.ejs
  res.render('microworkout/fitnessgoal', { title: 'Fitness Goal', user: req.user });
});

// ⬇️ THIS was missing: accept the goal from the form and move on
router.post('/fitness-goal', async (req, res) => {
  try {
    const raw = String(req.body.goal || '').trim();
    const allowed = {
      'Weight Loss/Fat Burn': 'weight_loss',
      'Muscle Gain/Strength': 'muscle_gain',
      'Endurance/Cardio': 'endurance',
      'Flexibility/Mobility': 'mobility',
      'Core Strength/Stability': 'core'
    };
    const primaryGoal = allowed[raw] || raw; // normalize or keep raw
    await User.findByIdAndUpdate(req.user._id, { primaryGoal });

    return res.redirect('/wizard/fitnessgoal'); // next step
  } catch (e) {
    console.error('Save goal error:', e);
    return res.redirect('/wizard/fitnessgoal?msg=Could+not+save');
  }
});
// 4) Next page after goal (you already have duration.ejs)
router.get('/fitnessgoal', (req, res) => {
  res.render('microworkout/fitnessgoal', { title: 'Fitness Goal', user: req.user });
});


router.post('/health-goal', async (req, res) => {
  try {
    const raw = String(req.body.goal || '').trim();
    const allowed = {
      'Weight Loss/Fat Burn': 'weight_loss',
      'Muscle Gain/Strength': 'muscle_gain',
      'Endurance/Cardio': 'endurance',
      'Flexibility/Mobility': 'mobility',
      'Core Strength/Stability': 'core'
    };
    const primaryGoal = allowed[raw] || raw; // normalize or keep raw
    await User.findByIdAndUpdate(req.user._id, { primaryGoal });

    return res.redirect('/wizard/healthimplication'); // next step
  } catch (e) {
    console.error('Save goal error:', e);
    return res.redirect('/wizard/healthimplication?msg=Could+not+save');
  }
});
router.get('/healthimplication', (req, res) => {
  res.render('microworkout/healthimplication', { title: 'Health Implication', user: req.user });
});


router.post('/equipment-goal', async (req, res) => {
  try {
    const equipment = req.body.equipment || [];
    await User.findByIdAndUpdate(req.user._id, { equipment });
    return res.redirect('/wizard/equipment');
  } catch (e) {
    console.error('Save equipment error:', e);
    return res.redirect('/wizard/equipment?msg=Could+not+save');
  }
}); 
router.get('/equipment', (req, res) => {
  res.render('microworkout/equipment', { title: 'Equipment', user: req.user });
});

router.post('/duration-goal', async (req, res) => {
  try {
    const duration = Number(req.body.duration) || 20;
    await User.findByIdAndUpdate(req.user._id, { duration });
    return res.redirect('/wizard/duration');
  } catch (e) {
    console.error('Save duration error:', e);
    return res.redirect('/wizard/duration?msg=Could+not+save');
  }
}); 
router.get('/duration', (req, res) => {
  res.render('microworkout/duration', { title: 'Duration', user: req.user });
});

// Final step: summary + start using the app
router.post('/output-goal', (req, res) => {
  // In a real app, you might finalize the setup here
  res.redirect('/wizard/output-goal'); // or wherever the main app is
});
router.get('/output-goal', (req, res) => {
  res.render('microworkout/output', { title: 'Output', user: req.user });
});








router.get('/name-age', (req, res) => {
  res.render('microworkout/nameandage', { title: 'Tell us about you', user: req.user, query: req.query });
});

router.post('/name-age', async (req, res) => {
  try {
    const { name, age } = req.body;
    await User.findByIdAndUpdate(req.user._id, { name: (name || '').trim(), age: Number(age) || undefined });

    // Keep the same info in their latest Session too (handy for AI)
    let s = await Session.findOne({ user: req.user._id }).sort({ createdAt: -1 });
    if (!s) s = await Session.create({ user: req.user._id });
    s.name = (name || '').trim();
    s.age = Number(age) || undefined;
    await s.save();

    return res.redirect('/wizard/fitness-level');
  } catch (e) {
    console.error('Save name/age error:', e);
    return res.redirect('/wizard/name-age?msg=Could+not+save');
  }
});

router.get('/fitness-level', (req, res) => {
  res.render('microworkout/fitnesslevel', { title: 'Fitness Level', user: req.user });
});

router.post('/fitness-level', async (req, res) => {
  try {
    const level = String(req.body.level || '').toLowerCase();
    if (['beginner','intermediate','advanced'].includes(level)) {
      await User.findByIdAndUpdate(req.user._id, { level });
      let s = await Session.findOne({ user: req.user._id }).sort({ createdAt: -1 });
      if (!s) s = await Session.create({ user: req.user._id });
      s.level = level;
      await s.save();
    }
    return res.redirect('/wizard/fitnessgoal');
  } catch (e) {
    console.error('Save level error:', e);
    return res.redirect('/wizard/fitnessgoal');
  }
});

router.get('/fitnessgoal', (req, res) => {
  res.render('microworkout/fitnessgoal', { title: 'Fitness Goal', user: req.user });
});

// final page: read plan from DB (generated by /ai/plan)
router.get('/output', async (req, res) => {
  try {
    const s = await Session.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    if (!s || !s.plan) return res.redirect('/wizard/fitnessgoal?msg=no_plan');
    res.render('microworkout/output', { title: 'Your Plan', plan: s.plan, s, user: req.user });
  } catch (e) {
    console.error('Render output error:', e);
    res.redirect('/wizard/fitnessgoal?msg=render_error');
  }
});

module.exports = router;
