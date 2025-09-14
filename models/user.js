const mongoose = require('mongoose');

// models/user.js

const UserSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  age: Number,
  level: { type: String, enum: ['beginner','intermediate','advanced'], lowercase: true },
  primaryGoal: String,
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);