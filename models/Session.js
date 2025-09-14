// models/Session.js
const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  // captured inputs:
  name: String,
  age: Number,
  goal: String,
  level: String,
  constraints: String,
  daysPerWeek: Number,
  durationMin: Number,
  equipment: [String],
  // AI output:
  plan: mongoose.Schema.Types.Mixed,
  state: { type: String, default: 'INTAKE' }
}, { timestamps: true });

module.exports = mongoose.models.Session || mongoose.model('Session', SessionSchema);
