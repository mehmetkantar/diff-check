# syntax=docker/dockerfile:1
#
# On-prem image for the Redline demo app: a static site served by nginx.
# Documents are parsed, OCR'd and compared in the browser; the server never sees them.
#
#   docker build -f deploy/Dockerfile -t redline .
#   docker run --rm -p 8080:8080 redline

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

# Install with the lockfile first so dependency layers are cached between builds.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/ocr/package.json packages/ocr/
COPY packages/react/package.json packages/react/
COPY packages/element/package.json packages/element/
COPY apps/demo/package.json apps/demo/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY fixtures ./fixtures
# prebuild copies the OCR runtime (tesseract.js worker, WebAssembly core, tur + eng data) into dist/ocr.
RUN npm run build -w apps/demo

# ---- serve ----
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/demo/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
