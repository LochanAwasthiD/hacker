const express = require('express');
const Session = require('../models/session.js');
const TipLog = require('../models/TipLog.js');

const router = express.Router();

const MODEL = process.env.MODEL || 'gemini-2.5-flash';

const systemTips = `
You are a concise, safety-first fitness assistant.
Return markdown with:
# <Short Title>
- 3–5 bullet tips (specific to user's goal/level/equipment/time)
- One line starting with "⚠️ Caution:" if pain/injury is mentioned
Avoid medical diagnosis. Simple language.
`;

const systemPlan = `
You are a workout program generator. Return STRICT JSON only:
{
  "weeks": 4,
  "daysPerWeek": <number>,
  "plan": [
    {
      "day": "Day 1 - Upper Push",
      "durationMin": 45,
      "workout": [
        {"exercise":"Bench Press","sets":4,"reps":"6-8","rir":2}
      ],
      "finisher":"Incline walk 10 min",
      "warmup":"5 min dynamic + light sets",
      "cooldown":"5 min stretch"
    }
  ],
  "progression": "Add 2.5–5% load or 1–2 reps weekly if RIR>2; deload in week 4 if needed."
}
No extra text, JSON only. Tailor to user's goal, level, constraints, equipment.
If constraints include pain/injury, include "medicalNote":"Consider seeing a professional".
`;

router.post('/tips', async (_req, res) => {
  const s = await Session.findOne().sort({ createdAt: -1 });
  if (!s) return res.status(400).json({ ok:false, error:'No session' });

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: systemTips });

  const userPrompt = `
Goal: ${s.goal || 'general fitness'}
Level: ${s.level}
Constraints: ${s.constraints || 'none'}
Days/Week: ${s.daysPerWeek || 3}
Equipment: ${s.equipment?.join(', ') || 'bodyweight'}
Return format as instructed.
`;

  const result = await model.generateContent(userPrompt);
  const text = result.response.text() || '';
  const lines = text.split('\n').map(t=>t.trim()).filter(Boolean);

  s.tips = lines;
  await s.save();
  try { await TipLog.create({ goal:s.goal, level:s.level, constraints:s.constraints, responseRaw:text, tips:lines.slice(0,10) }); } catch {}

  res.json({ ok:true, content: lines });
});

router.post('/plan', async (_req, res) => {
  const s = await Session.findOne().sort({ createdAt: -1 });
  if (!s) return res.status(400).json({ ok:false, error:'No session' });

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: systemPlan });

  const spec = {
    goal: s.goal || 'general fitness',
    level: s.level,
    constraints: s.constraints || 'none',
    daysPerWeek: s.daysPerWeek || 3,
    equipment: s.equipment?.length ? s.equipment : ['bodyweight']
  };

  const result = await model.generateContent(JSON.stringify(spec));
  const raw = result.response.text() || '{}';

  let plan;
  try { plan = JSON.parse(raw); }
  catch {
    const i = raw.indexOf('{'), j = raw.lastIndexOf('}');
    plan = JSON.parse(raw.slice(i, j+1));
  }

  s.plan = plan;
  await s.save();
  res.json({ ok:true, plan });
});

module.exports = router;
