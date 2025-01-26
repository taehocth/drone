# Stage 0, "build-stage", based on Node.js, to build and compile the frontend
FROM node:20 AS build-stage

# 1. Accept build arguments
ARG VITE_GOOGLE_MAP_API_KEY
ARG VITE_API_URL
ARG NODE_ENV

# 2. Set environment variables (so Vite sees them)
ENV VITE_GOOGLE_MAP_API_KEY=$VITE_GOOGLE_MAP_API_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV NODE_ENV=$NODE_ENV

WORKDIR /app

COPY package*.json /app/

RUN npm install --production=false

COPY ./ /app/

ARG VITE_API_URL=${VITE_API_URL}

RUN npm run build


# Stage 1, based on Nginx, to have only the compiled app, ready for production with Nginx
FROM nginx:1

COPY --from=build-stage /app/dist/ /usr/share/nginx/html

COPY ./nginx.conf /etc/nginx/conf.d/default.conf
COPY ./nginx-backend-not-found.conf /etc/nginx/extra-conf.d/backend-not-found.conf
