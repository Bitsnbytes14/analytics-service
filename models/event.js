const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  site_id: { type: String, required: true, index: true },
  event_type: { type: String, required: true },
  path: { type: String },
  user_id: { type: String },
  timestamp: { type: Date, required: true, index: true },
  date: { type: String, index: true } // YYYY-MM-DD for quick date queries
}, { strict: false });

module.exports = mongoose.model('Event', EventSchema);
