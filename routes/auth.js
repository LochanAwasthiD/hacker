const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/user');

const router = express.Router();



// SIGNUP: save user, auto-login, go to name-age
router.post('/signup', async (req, res) => {
  try {
    let { name, email, password, confirmPassword } = req.body;
    name = (name || '').trim();
    email = (email || '').toLowerCase().trim();

    if (!email || !password) return res.redirect('/?msg=Missing+fields#auth-section');
    if (password !== (confirmPassword || '')) return res.redirect('/?msg=Passwords+do+not+match#auth-section');
    if (await User.findOne({ email })) return res.redirect('/?msg=Email+already+in+use#auth-section');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    req.login(user, (err) => {
      if (err) return res.redirect('/?msg=Auto-login+failed#auth-section');
      return res.redirect('/wizard/name-age');
    });
  } catch (e) {
    console.error('Signup error:', e);
    return res.redirect('/?msg=Signup+failed#auth-section');
  }
});

// LOGIN: if age missing → name-age, else → fitness-level
router.post('/login', (req, res, next) => {
  passport.authenticate('local', async (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect('/?msg=Invalid+credentials#auth-section');
    req.logIn(user, async (e2) => {
      if (e2) return next(e2);
      const fresh = await User.findById(user._id).lean();
      return res.redirect(fresh?.age ? '/wizard/fitness-level' : '/wizard/name-age');
    });
  })(req, res, next);
});

// LOGOUT
router.get('/logout', (req, res, next) => {
  req.logout(err => err ? next(err) : res.redirect('/'));
});


module.exports = router;
