// routes/newsletter.js
const express = require('express');
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');

const router = express.Router();

const tx = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

// (optional) log readiness at boot
tx.verify().then(()=>console.log('[mailer] ready')).catch(err=>console.error('[mailer]', err.message));

// POST /newsletter/subscribe
router.post('/subscribe', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const back = (req.headers.referer || '/').split('#')[0] + '#newsletter';

  // basic email check
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.redirect(back + '?sub=invalid');

  try {
    // render confirmation email HTML
    const html = await ejs.renderFile(
      path.join(__dirname, '..', 'views', 'email', 'subscribe-confirm.ejs'),
      { email }
    );

    // send to subscriber
    await tx.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'Welcome to Micro-Workout 💪',
      html
    });

    // notify owner (optional)
    await tx.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.OWNER_EMAIL || process.env.SMTP_USER,
      subject: '🆕 New newsletter subscriber',
      text: `New subscriber: ${email}`
    });

    return res.redirect(back + '?sub=ok');
  } catch (err) {
    console.error('[newsletter]', err.message);
    return res.redirect(back + '?sub=error');
  }
});

module.exports = router;
