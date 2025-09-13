const express = require('express');
const User = require('../models/user');
const router = express.Router();

router.get('/name-age', (req, res) =>
  res.render('microworkout/nameandage', { title: 'Tell us about you', user: req.user, query: req.query })
);

router.post('/name-age', async (req, res) => {
  try {
    const { name, age } = req.body;
    await User.findByIdAndUpdate(req.user._id, { name: (name||'').trim(), age: Number(age) || undefined });
    res.redirect('/wizard/fitness-level');
  } catch (e) {
    console.error('Save name/age error:', e);
    res.redirect('/wizard/name-age?msg=Could+not+save');
  }
});

router.get('/fitness-level', (req, res) =>
  res.render('microworkout/fitnesslevel', { title: 'Fitness Level' })
);

module.exports = router;
