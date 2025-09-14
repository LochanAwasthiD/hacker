// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/user');

const router = express.Router();

// SIGNUP → save user → auto-login → go to name-age
router.post('/signup', async (req, res) => {
  try {
    let { name, email, password, confirmPassword } = req.body;
    name = (name || '').trim();
    email = (email || '').toLowerCase().trim();

    if (!email || !password) return res.redirect('/?msg=Missing+fields#auth-section');
    if (password !== (confirmPassword || '')) return res.redirect('/?msg=Passwords+do+not+match#auth-section');

    const exists = await User.findOne({ email });
    if (exists) return res.redirect('/?msg=Email+already+in+use#auth-section');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    req.login(user, (err) => {
      if (err) return res.redirect('/?msg=Auto-login+failed#auth-section');
      req.session.save(() => res.redirect('/wizard/name-age'));
    });
  } catch (e) {
    console.error('Signup error:', e);
    res.redirect('/?msg=Signup+failed#auth-section');
  }
});

// LOGIN → go to name-age
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect('/?msg=Invalid+credentials#auth-section');
    req.logIn(user, (e2) => {
      if (e2) return next(e2);
      req.session.save(() => res.redirect('/wizard/name-age'));
    });
  })(req, res, next);
});

// LOGOUT
router.get('/logout', (req, res, next) => {
  req.logout(err => err ? next(err) : req.session.destroy(() => res.redirect('/')));
});

module.exports = router;
