require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const Redis = require('ioredis');
const cors = require('cors');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const QUEUE_KEY = 'analytics:events';

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

const app = express();
app.use(cors());
app.use(bodyParser.json());

function validateEvent(body) {
  if (!body.site_id) return 'site_id is required';
  if (!body.event_type) return 'event_type is required';
  if (!body.timestamp) return 'timestamp is required';
  return null;
}

app.post('/event', async (req, res) => {
  const body = req.body;
  const err = validateEvent(body);
  if (err) return res.status(400).json({ error: err });

  // Normalize minimal fields and push to Redis list
  const event = {
    site_id: String(body.site_id),
    event_type: String(body.event_type),
    path: body.path || '/',
    user_id: body.user_id || null,
    timestamp: body.timestamp
  };

  try {
    // push to Redis list (fast) - use RPUSH
    await redis.rpush(QUEUE_KEY, JSON.stringify(event));
    // return fast success (202 Accepted)
    return res.status(202).json({ status: 'accepted' });
  } catch (e) {
    console.error('Redis push error', e);
    return res.status(500).json({ error: 'queue_error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ingestion API listening on port ${PORT}`);
});
