const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema({
  state: { type: String, enum: ['INTAKE','TIPS','PLAN','DONE'], default: 'INTAKE' },
  goal: String,
  level: { type: String, enum: ['beginner','intermediate','advanced'], default: 'beginner' },
  constraints: String,
  daysPerWeek: { type: Number, default: 3 },
  equipment: [String],
  tips: [String],
  plan: Object,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Session || mongoose.model('Session', SessionSchema);
