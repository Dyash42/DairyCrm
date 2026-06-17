# Heroku / Railway / Render-style process model.
# IMPORTANT: keep devDependencies during build is NOT required (tsx + prisma
# client are runtime deps), but the Prisma CLI used by `release` lives in
# devDependencies — set NPM_CONFIG_PRODUCTION=false (or keep dev deps) so the
# release phase can run migrations.
release: npm --workspace @jharanai/backend run db:generate && npm --workspace @jharanai/backend run db:migrate
web: npm --workspace @jharanai/backend run start:prod
worker: npm --workspace @jharanai/backend run worker:prod
