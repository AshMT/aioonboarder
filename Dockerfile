FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
