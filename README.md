# analytics-service
A production-ready, dockerized analytics pipeline: high-throughput event ingestion, durable queueing, background processing, and read-optimized reporting — built with Node.js, Express, Redis, MongoDB, and a worker service.

⚡️ Purpose: capture page/view events at scale, persist them reliably, and provide fast aggregated metrics for dashboards or product analytics.

---

Badges (add after creating repo assets)
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Docker](https://img.shields.io/badge/docker-ready-blue)]()
[![Node.js](https://img.shields.io/badge/node-%3E=_18-green)]()

Table of contents
- Project summary
- Architecture & flow
- Mermaid diagram
- Tech stack
- Design & implementation details
- Folder structure
- Quick start (Docker)
- .env example
- API reference (POST /event, GET /stats)
- Sample payloads & curl / PowerShell
- MongoDB schema, indexes, aggregation examples
- Queue rationale & durability tradeoffs
- Observability, testing & security notes
- Scaling, deployment & performance tuning
- Future improvements
- Contributing & license

---

Project summary
- Lightweight ingestion API receives events and enqueues to Redis for minimal latency.
- Worker service consumes queue and writes to MongoDB (supports batching and retries).
- Reporting API exposes aggregated metrics (total views, unique users, top paths).
- Fully containerized with docker-compose for local development; designed for horizontal scale in production.

Why this pattern?
- Keep ingestion fast and stateless.
- Offload heavy I/O to workers to smooth spikes.
- Simple, robust, and easy to reason about in interviews and real projects.

---

Architecture & high-level flow (text)
1. Client -> POST /event on Ingestion API
2. Ingestion API validates and pushes message to Redis queue (LPUSH / XADD)
3. Worker process (one or many) BRPOP / XREADs messages, does validation/normalization
4. Worker writes events to MongoDB (insertMany / upserts for idempotency)
5. Reporting API queries MongoDB using aggregation pipelines for metrics

Simple ASCII:
Client --> Ingest API --> Redis Queue --> Worker --> MongoDB
Client --> Reporting API --> MongoDB (aggregation read)

Mermaid architecture diagram
```mermaid
flowchart LR
  subgraph clients[Clients]
    C[Browser / Mobile / Server]
  end

  C -->|POST /event| Ingest[Ingestion API<br/>(Express)]
  Ingest -->|LPUSH / XADD| Redis[(Redis Queue)]
  Redis -->|BRPOP / XREAD| Worker[Worker Service<br/>(Node)]
  Worker -->|insertMany / bulkWrite| Mongo[(MongoDB)]
  Reporter[Reporting API<br/>(Express)] -->|aggregate read| Mongo
  C -->|GET /stats| Reporter

  style Ingest fill:#f3f4ff,stroke:#666
  style Redis fill:#fef3c7,stroke:#996600
  style Worker fill:#fff1f2,stroke:#cc0000
  style Mongo fill:#e6ffef,stroke:#00773d
  style Reporter fill:#f0f9ff,stroke:#1e6fb8
```

---

Tech stack (at a glance)
| Layer | Technology |
|---|---|
| Runtime | Node.js (LTS) |
| HTTP | Express |
| Queue | Redis (Lists or Streams) |
| Data | MongoDB (collections + aggregation pipeline) |
| Orchestration | Docker / Docker Compose (dev) |
| Worker | Node.js background worker |
| Logging | Console (winston/pino recommended) |
| Observability | Prometheus / Grafana (recommended) |
| Testing | Jest / Supertest (suggested) |

---

Design & implementation details — technical depth

Ingestion API
- Responsible for light validation, enrichment (IP -> geo optional), and pushing to Redis.
- Should return 202 Accepted for async success.
- Minimal I/O, no DB operations on critical request path.

Worker
- Use BRPOP (lists) or XREADGROUP (streams + consumer groups).
- Implements:
  - Batch reads (N messages) to reduce per-op overhead.
  - Bulk inserts (insertMany or bulkWrite) with ordered:false for performance.
  - Retry/backoff policy and a DLQ for poison messages.
  - Idempotency: accept optionally-provided eventId to dedupe (unique index or upsert).

Reporting API
- Read-only API using MongoDB aggregation pipeline.
- Query parameters to filter date ranges, granularity, and sorting.
- Consider pre-aggregated collections for heavy OLAP queries.

Data flow characteristics
- At-peek throughput: scale workers horizontally, use Redis persistence config (RDB/AOF) and memory sizing.
- Ordering: lists preserve pop order; Redis Streams allow consumer groups and offset tracking.

Security & API governance
- API keys for ingestion, rate-limiting per key, public ingestion endpoints behind a gateway.
- Validate payload size and fields; enforce rate limits and quotas.

---

Folder structure (representative)
```
.
├─ docker-compose.yml
├─ .env.example
├─ ingestion-api/
│  ├─ Dockerfile
│  ├─ package.json
│  └─ src/
│     ├─ index.js            # express app + routes
│     ├─ routes/event.js
│     └─ lib/redisClient.js
├─ worker/
│  ├─ Dockerfile
│  ├─ package.json
│  └─ src/
│     ├─ index.js            # worker bootstrap
│     ├─ consumer.js         # queue consumer and batching logic
│     └─ processors/
│         └─ persistEvent.js
├─ reporting-api/
│  ├─ Dockerfile
│  ├─ package.json
│  └─ src/
│     ├─ index.js
│     └─ routes/stats.js
├─ scripts/
└─ README.md
```

---

Quick start — Docker (development)
1) Copy env:
```bash
cp .env.example .env
```
2) Build and run:
```bash
docker-compose up --build
```
3) Endpoints (defaults):
- Ingestion: http://localhost:3000/event
- Reporting: http://localhost:3001/stats
- Redis (internal): redis://redis:6379
- MongoDB (internal): mongodb://mongo:27017/analytics

Stop:
```bash
docker-compose down
```
Run detached:
```bash
docker-compose up -d --build
```

Minimal docker-compose snippet (example)
```yaml
version: "3.8"
services:
  ingestion:
    build: ./ingestion-api
    ports: ["3000:3000"]
    env_file: .env
    depends_on: ["redis"]
  worker:
    build: ./worker
    env_file: .env
    depends_on: ["redis","mongo"]
  reporting:
    build: ./reporting-api
    ports: ["3001:3001"]
    env_file: .env
    depends_on: ["mongo"]
  redis:
    image: redis:7
    volumes:
      - redis-data:/data
  mongo:
    image: mongo:6
    volumes:
      - mongo-data:/data/db
volumes:
  redis-data:
  mongo-data:
```

.env example
```
# Server
NODE_ENV=development

# Ingestion
INGEST_PORT=3000
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_QUEUE=analytics:events

# Worker
WORKER_CONCURRENCY=2
WORKER_BATCH_SIZE=100
WORKER_POLL_TIMEOUT=5

# Reporting
REPORT_PORT=3001
MONGO_URI=mongodb://mongo:27017/analytics

# Logging
LOG_LEVEL=info
```

---

API Reference

POST /event — Ingestion API
- URL: POST /event
- Headers: Content-Type: application/json, Authorization: Bearer <api-key> (recommended)
- Success: 202 Accepted { "status": "queued", "queued": true }
- Errors: 400 validation, 401 unauthorized, 429 rate limit, 500 server error

Request JSON schema (compact)
- eventId? (string) — optional id for idempotency
- timestamp? (ISO8601) — server will fill if missing
- userId? (string)
- sessionId? (string)
- path (string) — required
- ip? (string)
- userAgent? (string)
- properties? (object) — free-form

Server-side validation example (pseudo)
- path must be string, length < 2048
- properties must be <= 4KB
- optional eventId validated as UUID or string

GET /stats — Reporting API
- URL: GET /stats
- Query params:
  - start (ISO8601) — optional
  - end (ISO8601) — optional
  - limit (int) — top-n paths (default 10)
  - groupBy (string) — optional (path, userId, etc.)
- Response: 200 OK JSON
  - totalViews (int)
  - uniqueUsers (int)
  - topPaths: [ { path, count } ]
  - start, end (echoed)

Implementation (recommended)
- Use MongoDB aggregation:
  - match by time-range
  - group for topPaths: { _id: "$path", count: { $sum: 1 } }
  - distinct count for unique users (or $addToSet then $size)

Aggregation examples (Mongo shell)
Total views:
```js
db.events.countDocuments({ timestamp: { $gte: ISODate(start), $lt: ISODate(end) }})
```
Unique users:
```js
db.events.distinct("userId", { timestamp: { $gte: ISODate(start), $lt: ISODate(end) } }).length
```
Top paths:
```js
db.events.aggregate([
  { $match: { timestamp: { $gte: ISODate(start), $lt: ISODate(end) } } },
  { $group: { _id: "$path", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 },
  { $project: { path: "$_id", count: 1, _id: 0 } }
])
```

---

Sample JSON payloads

Full example:
```json
{
  "eventId": "e9f6c2b3-12a1-4a9b-8baf-1d2a3b4c5d6e",
  "timestamp": "2025-11-14T09:00:00.000Z",
  "userId": "user_123",
  "sessionId": "sess_abcd",
  "path": "/product/42",
  "ip": "203.0.113.42",
  "userAgent": "Mozilla/5.0 (Macintosh; Intel)",
  "properties": { "referrer": "https://example.com", "pageTitle": "Product 42" }
}
```

Minimal payload:
```json
{ "path": "/home" }
```

curl examples

POST /event:
```bash
curl -s -X POST http://localhost:3000/event \
  -H "Content-Type: application/json" \
  -d '    {
    "eventId":"e9f6c2b3-12a1-4a9b-8baf-1d2a3b4c5d6e",
    "userId":"user_123",
    "path":"/product/42"
  }'
```

GET /stats:
```bash
curl -s "http://localhost:3001/stats?start=2025-11-01T00:00:00Z&end=2025-11-14T23:59:59Z&limit=5"
```

PowerShell POST:
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/event `
  -ContentType "application/json" -Body (@{
    eventId = "e9f6c2b3-12a1-4a9b-8baf-1d2a3b4c5d6e"
    userId = "user_123"
    path = "/product/42"
  } | ConvertTo-Json)
```

---

MongoDB schema & recommended indexes

Collection: events
Document shape:
```json
{
  "_id": ObjectId(),
  "eventId": "e9f6c2b3-..",       // optional for idempotency
  "timestamp": ISODate(),
  "ingestedAt": ISODate(),
  "userId": "user_123",
  "sessionId": "sess_abcd",
  "path": "/product/42",
  "ip": "203.0.113.42",
  "userAgent": "...",
  "properties": { ... }
}
```

Indexes (recommended)
- { timestamp: 1 }                             — range queries, TTL
- { path: 1, timestamp: -1 }                   — top path + recency
- { userId: 1, timestamp: -1 }                 — unique user counting in time-windows
- { eventId: 1 } (unique)                      — idempotency if using eventId
- TTL index example: { timestamp: 1 } expireAfterSeconds: 60*60*24*90

Notes
- Choose indexes based on query profile. Indexes speed reads but increase write cost — tune according to event volume.

---

Queue Rationale — why Redis?
Pros
- Low latency, simple API, easy to operate.
- Allows decoupling ingestion and persistence (backpressure handling).
- Supports high-throughput with LPUSH/BRPOP or Streams + consumer groups.
- Lightweight compared to Kafka for simpler setups.

Cons / Tradeoffs
- Redis persistence (RDB/AOF) is not as durable as Kafka by default.
- Memory-bound: must size instance to hold backlog or set eviction policies carefully.
- For guaranteed long-term retention, use Kafka or S3-based buffering.

Operational recommendations
- Use Redis Streams + consumer groups for multiple consumer coordination and more robust replay semantics.
- Persist with AOF and proper fsync options (or use Redis-on-Flash or clustered Redis for durability).
- Implement DLQ and alerting for growing backlog.

---

Observability, testing & security

Observability
- Instrument endpoints and worker with metrics: request rate, queue length, processing latency, DB write latency, error/error rates.
- Expose /metrics for Prometheus. Use Grafana dashboards.
- Add structured logs (winston or pino) and tracing (OpenTelemetry).

Testing
- Unit tests for route validation, worker processing logic (use nock / redis-mock / mongodb-memory-server).
- Integration tests: docker-compose test profile or GitHub Actions using local containers.
- Load tests: k6 / artillery to validate end-to-end throughput and backpressure.

Security
- Protect ingestion with API keys and TLS (HTTPS).
- Sanitize properties to avoid injection to downstream systems.
- Limit payload size and rate-limit per API key or IP.

---

Scaling & production deployment notes
- Horizontal scale: run many worker containers; use Redis Streams consumer groups to coordinate work.
- DB scaling:
  - Shard MongoDB or use time-partitioned collections if volume is extremely high.
  - Offload heavy analytics to a dedicated OLAP store (ClickHouse, Redshift, BigQuery) for long-term timeseries analysis.
- Use Kubernetes for production orchestration; leverage HPA and Pod disruption budgets.
- Use a message system like Kafka when you need guaranteed persistence, replay, and larger retention.

Performance tuning tips
- Batch size: tune insert batch size for best throughput vs memory.
- BulkWrite with ordered:false improves throughput on large batches.
- Use appropriate writeConcern on MongoDB (w:1 vs majority) depending on durability/perf tradeoffs.
- Tune Redis persistence and memory to avoid data loss during peaks.

---

Future improvements (prioritized)
1. Idempotent ingestion with eventId and unique DB index.
2. Redis Streams + consumer groups for better consumer coordination and offset management.
3. Dead-letter queue + metrics/alerts for poison messages.
4. Pre-aggregation pipeline (daily/hourly rollups) to speed up reporting for long ranges.
5. Auth & API keys + rate limiting and usage metrics.
6. CI/CD pipeline + GitHub Actions with integration tests.
7. Observability: Prometheus/Grafana dashboards, OpenTelemetry traces.
8. Migrate heavy analytics to ClickHouse/Kafka for long-term storage and higher retention.

---

Interview talking points (how to present this project)
- Emphasize separation of concerns: ingestion (low-latency), queueing (resilience & buffering), worker (durable writes), reporting (read-optimized).
- Discuss tradeoffs: Redis vs Kafka; exact-once vs at-least-once; memory vs disk; TTL vs archival.
- Explain horizontal scaling: multiple stateless ingestion instances + multiple worker consumers + MongoDB for read scalability (replica sets/sharding).
- Mention observability & failure modes: backlog growth, DLQ, monitoring queue length, and graceful shutdown.
- Show code snippets of critical sections (enqueuing and bulk inserts) and discuss idempotency.

---

Contributing
- Fork, create a feature branch, add tests, open a PR with a descriptive title.
- Include benchmarks or load-test results for performance-related changes.
- Add or update documentation for any public API change.

License
- Add an appropriate LICENSE file (MIT recommended for open-source demo projects).

---

Appendix — Example worker consumer pseudocode (for interviews)
```js
// consumer.js (pseudo)
async function consumeBatch(redis, mongo, opts) {
  const msgs = await redis.brpop(opts.queue, opts.timeout, opts.batchSize);
  if (!msgs.length) return;
  const docs = msgs.map(normalizeAndValidate);
  try {
    await mongo.collection('events').insertMany(docs, { ordered: false });
  } catch (err) {
    // handle duplicate key (idempotency), log and push failed messages to DLQ
  }
}
```

---

Needables (I can generate next)
- Full .env.example and docker-compose tailored to repo
- OpenAPI/Swagger spec for APIs
- Example healthchecks, graceful shutdown code, and a basic Prometheus metrics exporter
- Pre-built contribution templates and ISSUE/PR templates

— GitHub Copilot Chat Assistant