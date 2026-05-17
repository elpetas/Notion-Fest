# Linux environment for the Notion CLI (ntn) on Windows via Docker.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g ntn

WORKDIR /worker

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src

# File-based auth fallback; NOTION_API_TOKEN in env overrides this.
ENV NOTION_KEYRING=0

ENTRYPOINT ["ntn"]
CMD ["workers", "--help"]
