# Weave Server as a container. Build from the repository root:
#   docker build -f apps/server/Dockerfile -t weave-server .
# Set up once, then run (the company's home lives in the /data volume):
#   docker run -it --rm -v weave:/data -e WEAVE_VAULT_TOKEN=… weave-server init
#   docker run -d --name weave -v weave:/data -e WEAVE_VAULT_TOKEN=… -p 7730:7730 -p 7720:7720 weave-server
FROM node:24-slim AS build
WORKDIR /src
# The desktop app's Electron isn't needed here.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY . .
RUN npm ci --no-audit --no-fund && node apps/server/build.ts

FROM node:24-slim
WORKDIR /app
COPY --from=build /src/apps/server/dist/ ./
RUN npm install --omit=dev --no-audit --no-fund && chown -R node:node /app
# No OS keystore in a container: keys are sealed with a key in the volume, so protect the volume.
ENV WEAVE_HOME=/data WEAVE_KEYSTORE=file NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 7730 7720
# Healthy while the node answers on its local API: a company's server or someone's always-on node alike.
HEALTHCHECK --interval=30s --timeout=10s CMD ["node", "/app/weave-server.mjs", "status"]
ENTRYPOINT ["node", "/app/weave-server.mjs"]
CMD ["run"]
