FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY --from=builder /app/dist ./dist
# We need sqlite3 which has binary components, so npm install --production is needed in final image
# or copy node_modules from builder if architectures match. 
# For simplicity in this env:
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8008
CMD ["npm", "start"]
