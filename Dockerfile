# ==========================================
# STAGE 1: Build & Development Dependencies
# ==========================================
FROM node:20-alpine AS development

# Accept DATABASE_URL as a build-time argument
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

WORKDIR /usr/src/app

# Copy package descriptors first to leverage Docker layer caching
COPY package*.json ./

# Install compilation build dependencies and runtime libraries for Prisma/bcrypt
RUN apk add --no-cache make gcc g++ python3 openssl libc6-compat

# Install all dependencies (including devDependencies)
RUN npm install

# Copy the rest of the application files
COPY . .

# Generate Prisma client if schema exists
RUN if [ -f prisma/schema.prisma ]; then npx prisma generate; fi

# ==========================================
# STAGE 2: Production Build
# ==========================================
FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./
COPY --from=development /usr/src/app/node_modules ./node_modules
COPY . .

# Run the build script to compile TypeScript to Javascript
RUN npm run build

# Prune devDependencies to keep production image thin
RUN npm prune --production

# Generate Prisma client for production build context
RUN if [ -f prisma/schema.prisma ]; then npx prisma generate; fi

# ==========================================
# STAGE 3: Production Runner
# ==========================================
FROM node:20-alpine AS production

WORKDIR /usr/src/app

# Set Node environment to production
ENV NODE_ENV=production

# Copy production files and pruned node_modules
COPY package*.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

# Copy prisma schema if it exists for database migrations
COPY --from=build /usr/src/app/prisma ./prisma

# Use a non-privileged system user for runtime security
USER node

# Expose port (NestJS default)
EXPOSE 3000

CMD ["node", "dist/main"]
