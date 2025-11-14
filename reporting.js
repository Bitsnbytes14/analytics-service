require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Event = require('./models/event');
const bodyParser = require('body-parser');
const cors = require('cors');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analytics';
const PORT = process.env.PORT || 3001;

async function connectMongo() {
  await mongoose.connect(MONGO_URI, { dbName: 'analytics' });
  console.log('Reporting connected to MongoDB');
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

/**
 * GET /stats?site_id=site-abc-123&date=2025-11-12
 */
app.get('/stats', async (req, res) => {
  const site_id = req.query.site_id;
  const date = req.query.date; // optional YYYY-MM-DD

  if (!site_id) return res.status(400).json({ error: 'site_id is required' });

  const match = { site_id };
  if (date) match.date = date;

  try {
    // total_views
    const totalViewsPromise = Event.countDocuments(match);

    // unique_users
    const uniqueUsersPromise = Event.distinct('user_id', match).then(arr => {
      // filter out null/empty user IDs
      return arr.filter(u => u !== null && u !== undefined).length;
    });

    // top_paths
    const topPathsPromise = Event.aggregate([
      { $match: match },
      { $group: { _id: '$path', views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, path: '$_id', views: 1 } }
    ]);

    const [total_views, unique_users, top_paths] = await Promise.all([totalViewsPromise, uniqueUsersPromise, topPathsPromise]);

    return res.json({
      site_id,
      date: date || null,
      total_views,
      unique_users,
      top_paths
    });
  } catch (e) {
    console.error('Reporting error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

(async () => {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`Reporting API listening on port ${PORT}`);
  });
})();
