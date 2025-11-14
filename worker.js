require('dotenv').config();
const Redis = require('ioredis');
const mongoose = require('mongoose');
const Event = require('./models/event');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const QUEUE_KEY = 'analytics:events';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analytics';

const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

async function connectMongo() {
  await mongoose.connect(MONGO_URI, { dbName: 'analytics' });
  console.log('Worker connected to MongoDB');
}

async function processLoop() {
  console.log('Worker started processing loop...');
  while (true) {
    try {
      // BRPOP blocks until an element is available. timeout 0 -> block indefinitely
      const res = await redis.blpop(QUEUE_KEY, 0); // returns [key, value]
      const raw = res[1];
      let data;
      try { data = JSON.parse(raw); } catch (e) {
        console.error('invalid json from queue', raw);
        continue;
      }
      // prepare document
      const timestamp = new Date(data.timestamp);
      const date = timestamp.toISOString().slice(0,10); // YYYY-MM-DD

      const doc = {
        site_id: data.site_id,
        event_type: data.event_type,
        path: data.path || '/',
        user_id: data.user_id || null,
        timestamp,
        date
      };

      // write to mongo
      await Event.create(doc);
    } catch (err) {
      console.error('Worker error', err);
      // Wait a bit on error to avoid tight loop
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

(async () => {
  try {
    await connectMongo();
    processLoop();
  } catch (e) {
    console.error('Worker start error', e);
    process.exit(1);
  }
})();
