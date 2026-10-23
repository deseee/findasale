FROM node:22-bookworm

WORKDIR /app

ENV CI=true

# Install OpenSSL (Prisma requirement)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# pnpm version must match root package.json packageManager (lockfile v9)
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# Copy workspace root files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy only required packages
COPY packages/database ./packages/database
COPY packages/backend ./packages/backend

# Install backend + database deps (database needed for migrations and seed)
RUN pnpm install --frozen-lockfile --filter backend... --filter database

# Generate Prisma client
RUN pnpm --filter database exec prisma generate

# Switch into backend package
WORKDIR /app/packages/backend

EXPOSE 5000

CMD ["pnpm", "dev"]