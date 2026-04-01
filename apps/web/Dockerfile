FROM node:20-slim

WORKDIR /app

# Install dependencies for native modules
RUN apt-get update && apt-get install -y \
    libc6 \
    libgcc1 \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "run", "dev"]
