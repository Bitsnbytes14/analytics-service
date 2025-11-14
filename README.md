# 📊 Website Analytics Backend (Ingestion → Queue → Worker → Reporting)

A complete, production-style analytics backend built using:

- **Node.js + Express**
- **Redis (asynchronous queue)**
- **MongoDB (event storage & aggregation)**
- **Background Worker Service**
- **Docker + Docker Compose**

This system mimics real analytics platforms like Google Analytics, Mixpanel, and Segment — built with a clean microservices pattern.

---

## 🚀 Features

### ✔ Ultra-fast Ingestion API  
Accepts events instantly and pushes into Redis queue (no DB blocking).

### ✔ Background Worker  
Continuously consumes queue events and writes them to MongoDB.

### ✔ Reporting API  
Aggregated analytics:
- total views  
- unique users  
- top visited paths  
- filtering by site + optional date  

### ✔ Fully Dockerized  
Start everything with:

