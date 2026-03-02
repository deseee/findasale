FROM node:18

WORKDIR /app

# Enable pnpm v8 (same as backend)
RUN corepack enable && corepack prepare pnpm@8.15.5 --activate

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages

# Install deps
RUN pnpm install --frozen-lockfile

# Switch into frontend package
WORKDIR /app/packages/frontend

EXPOSE 3000

CMD ["pnpm", "dev"]