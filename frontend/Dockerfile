# Build: Node 24 instala del lockfile y compila el bundle. La URL de la API se fija
# en tiempo de build (D2), no en runtime.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# Runtime: nginx sirve el estatico y resuelve /api y el fallback del SPA (D1, D3).
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
