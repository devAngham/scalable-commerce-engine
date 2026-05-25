FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /usr/src/app
COPY package.json package-lock.json* ./
RUN npm install --production
COPY --from=builder /usr/src/app/dist ./dist
COPY .env .env
EXPOSE 3000
CMD ["node", "dist/main.js"]
