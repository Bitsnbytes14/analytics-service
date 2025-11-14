FROM node:18-slim

WORKDIR /app

COPY package.json package.json
RUN npm install

COPY . .

# default command overridden in docker-compose for each service
CMD ["node", "ingestion.js"]
