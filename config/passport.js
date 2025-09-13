const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/user');

module.exports = (passport) => {
  passport.use(new LocalStrategy(
    { usernameField: 'email', passwordField: 'password' },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email: (email||'').toLowerCase().trim() });
        if (!user) return done(null, false);
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return done(null, false);
        return done(null, user);
      } catch (e) { return done(e); }
    }
  ));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try { done(null, await User.findById(id).lean()); }
    catch (e) { done(e); }
  });
};
