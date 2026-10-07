FROM node:20-alpine

# Fonts are required to draw text on report card designs and logos (alpine ships none).
RUN apk add --no-cache fontconfig ttf-dejavu font-liberation && fc-cache -f

WORKDIR /app

COPY package*.json ./
RUN npm install   # <-- changed from npm ci

COPY . .
RUN npm run build

EXPOSE 5000

CMD ["npm", "start"]
