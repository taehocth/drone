# frontend/Dockerfile

# Stage 0: build
FROM node:20 AS build-stage

WORKDIR /app

# 1) Accept build arguments (Render Docker build args로 들어옴)
ARG VITE_API_URL
ARG VITE_TELEMETRY_WS_URL
ARG NODE_ENV=production

# 2) Set env so Vite sees them at build time
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_TELEMETRY_WS_URL=${VITE_TELEMETRY_WS_URL}
ENV NODE_ENV=${NODE_ENV}

# Install deps first (cache-friendly)
COPY package*.json ./
RUN npm install --production=false

# Copy source
COPY . .

# (옵션) 빌드 로그로 확인하고 싶으면 잠깐 켜두기
# RUN node -e "console.log('VITE_API_URL=', process.env.VITE_API_URL); console.log('VITE_TELEMETRY_WS_URL=', process.env.VITE_TELEMETRY_WS_URL)"

# Build
RUN npm run build


# Stage 1: serve with nginx
FROM nginx:1

COPY --from=build-stage /app/dist/ /usr/share/nginx/html

COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY ./nginx-backend-not-found.conf /etc/nginx/extra-conf.d/backend-not-found.conf