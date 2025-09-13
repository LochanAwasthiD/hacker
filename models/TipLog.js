const mongoose = require('mongoose');

const TipLogSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  goal: String,
  level: String,
  constraints: String,
  responseRaw: String,
  tips: [String]
});

module.exports = mongoose.models.TipLog || mongoose.model('TipLog', TipLogSchema);
