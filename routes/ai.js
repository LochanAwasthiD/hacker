// routes/ai.js
const express = require('express');
const Session = require('../models/Session');  // your existing model
const router = express.Router();

const MODEL = process.env.MODEL || 'gemini-2.5-flash';

// Single, strict system prompt for a structured plan
const systemPlan = `
You are a workout program generator. Return STRICT JSON only:
{
  "weeks": <number>,
  "daysPerWeek": <number>,
  "plan": [
    {
      "day": "Day 1 - <focus>",
      "durationMin": <number>,
      "workout": [
        {"exercise":"<name>","sets":<number>,"reps":"<range or number>","rir":<number>}
      ],
      "finisher":"<short optional>",
      "warmup":"<short optional>",
      "cooldown":"<short optional>"
    }
  ],
  "progression": "<1-2 lines>"
}
No extra text. Tailor to goal/level/constraints/equipment/duration. If constraints mention pain or injury, add "medicalNote": "Consider seeing a professional".
`;

// POST /ai/plan
router.post('/plan', async (req, res) => {
  try {
    // 1) Find or create a "current" session for this user
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ ok: false, error: 'Not authenticated' });

    // Grab latest open session (or create)
    let s = await Session.findOne({ user: userId }).sort({ createdAt: -1 });
    if (!s) s = await Session.create({ user: userId });

    // 2) Merge any inputs sent now (body) into session and persist
    const patch = {};
    [
      'name', 'age', 'goal', 'level', 'constraints',
      'daysPerWeek', 'durationMin'
    ].forEach(k => {
      if (req.body[k] !== undefined && req.body[k] !== null && String(req.body[k]).trim() !== '') {
        patch[k] = k === 'age' || k === 'daysPerWeek' || k === 'durationMin' ? Number(req.body[k]) : String(req.body[k]);
      }
    });

    // equipment can be array or CSV
    if (req.body.equipment !== undefined) {
      const eq = Array.isArray(req.body.equipment)
        ? req.body.equipment
        : String(req.body.equipment).split(',').map(x => x.trim()).filter(Boolean);
      patch.equipment = eq;
    }

    if (Object.keys(patch).length) {
      Object.assign(s, patch);
      await s.save();
    }

    // 3) Build spec from DB (single source of truth)
    const spec = {
      userName: s.name || req.user.name || 'friend',
      age: s.age || undefined,
      goal: s.goal || 'general fitness',
      level: s.level || 'beginner',
      constraints: s.constraints || 'none',
      daysPerWeek: s.daysPerWeek || 3,
      durationMin: s.durationMin || 15,
      equipment: (s.equipment && s.equipment.length) ? s.equipment : ['bodyweight']
    };

    // 4) Call Gemini
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: systemPlan
    });

    const result = await model.generateContent(JSON.stringify(spec));
    const raw = result.response.text() || '{}';

    // 5) Parse JSON strictly, with a safe fallback if the model added noise
    let plan;
    try {
      plan = JSON.parse(raw);
    } catch {
      const i = raw.indexOf('{'), j = raw.lastIndexOf('}');
      plan = JSON.parse(raw.slice(i, j + 1));
    }

    // 6) Save plan → session, mark as done
    s.plan = plan;
    s.state = 'PLAN_READY';
    await s.save();

    // 7) If called via fetch: return JSON. If form-nav, redirect.
    const wantsJSON = req.headers.accept?.includes('application/json') || req.xhr;
    if (wantsJSON) {
      return res.json({ ok: true, plan });
    }
    return res.redirect('/wizard/output');
  } catch (err) {
    console.error('AI plan error:', err);
    // Friendly JSON for fetch; redirect for forms
    if (req.headers.accept?.includes('application/json') || req.xhr) {
      return res.status(500).json({ ok: false, error: 'Could not generate plan. Try again.' });
    }
    return res.redirect('/wizard/fitnessgoal?msg=plan_error');
  }
});

module.exports = router;
