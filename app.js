require('dotenv').config();
// require('../models/user')

// require('../models/session')

// require('../models/tiplog')
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const path = require('path');
const ejsMate = require('ejs-mate');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');

// --- DB
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

// --- Views (ejs-mate only)
app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// optional: default layout for all views with ejs-mate
app.locals._layoutFile = 'layouts/boilerplate.ejs';

// --- Static & parsers
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 40 }));

// --- Session + Passport
const mongoUrl = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/microworkout';
app.use(session({
  secret: process.env.SESSION_SECRET || 'lochanawasthi',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // secure: true, // enable in production behind HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

require('./config/passport')(passport);   // <-- after session, before routes
app.use(passport.initialize());
app.use(passport.session());

// expose user to templates
app.use((req, res, next) => { res.locals.currentUser = req.user; next(); });

// --- Auth guard
const ensureAuth = (req, res, next) => req.isAuthenticated() ? next() : res.redirect('/#auth-section');

// --- Routes
const authRouter = require('./routes/auth');
const wizardRouter = require('./routes/wizard');
const aiRouter     = require('./routes/ai');

app.use('/auth', authRouter);               // login/signup/logout
app.use('/wizard', ensureAuth, wizardRouter); // wizard flow (protected)
app.use('/ai', ensureAuth, aiRouter);       // AI features (protected)

// homepage
app.get('/', (req, res) => {
  res.render('microworkout/homepage', { title: 'MicroWorkout' });
});

///check views dir and file existence
const fs = require('fs');
console.log('Views dir ->', app.get('views'));
console.log('Expect ->', path.join(app.get('views'), 'microworkout', 'homepage.ejs'));
console.log('Exists? ->', fs.existsSync(path.join(app.get('views'), 'microworkout', 'homepage.ejs')));



// --- Server
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Listening on http://localhost:${port}`));

module.exports = app;
