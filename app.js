require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const ejsMate = require('ejs-mate');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');

const app = express();

// ---- DB
(async function main() {
  try {
    const MONGO = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/microworkout';
    await mongoose.connect(MONGO);
    console.log('connected to db');
  } catch (e) {
    console.error('Error connecting to db', e);
    process.exit(1);
  }
})();

// ---- Views
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals._layoutFile = 'layouts/boilerplate.ejs';

// ---- Static / parsers / rate-limit
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 40 }));



// ---- Sessions
const mongoUrl = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/microworkout';
app.use(session({
  secret: process.env.SESSION_SECRET || 'lochanawasthi',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl }),
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

// ---- Passport
require('./config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());

// ---- Locals (must be before routes)
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.q = req.query; // enables ?msg= / ?sub=
  next();
});

// Auth guard
const ensureAuth = (req, res, next) => req.isAuthenticated() ? next() : res.redirect('/#auth-section');


// Shared locals for all views
app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  // guests: 1 total attempt; logged-in: unlimited
  const guestAttempts = Number(req.session?.guestAttempts || 0);
  res.locals.guestRemaining = req.user ? Infinity : Math.max(0, 1 - guestAttempts);
  res.locals.q = req.query || {};
  next();
});

// Locals (must be before routes)
app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  res.locals.q = req.query;
  // how many free guest attempts remain (0 or 1)
  res.locals.guestRemaining = Math.max(0, 1 - Number(req.session?.guestAttempts || 0));
  next();

});

// Make currentUser, guestRemaining, and query available to all views
app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  // guests have 1 attempt total; users unlimited (Infinity is fine for display logic)
  const guestAttempts = Number(req.session?.guestAttempts || 0);
  res.locals.guestRemaining = req.user ? Infinity : Math.max(0, 1 - guestAttempts);
  res.locals.q = req.query || {};
  next();
});

//  Routes

app.use('/auth', require('./routes/auth'));
// app.use('/wizard', ensureAuth, require('./routes/wizard'));
// app.use('/ai', ensureAuth, require('./routes/ai'));
app.use('/wizard', require('./routes/wizard')); // guest-friendly wizard
app.use('/ai', require('./routes/ai'));         // guest can call /ai/plan once
app.use('/newsletter', require('./routes/newsletter')); // if you’re using newsletter

app.get('/', (req, res) => {
  const guestRemaining = Math.max(0, 1 - Number(req.session?.guestAttempts || 0));
  res.render('microworkout/homepage', {
    title: 'Micro-Workout',
    currentUser: req.user,
    guestRemaining,
    query: req.query
  });
});

// -Home
app.get('/', (req, res) => res.render('microworkout/homepage', { title: 'MicroWorkout' }));

// Server
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));

module.exports = app;
