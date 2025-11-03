FROM mcr.microsoft.com/playwright:v1.56.1-jammy
WORKDIR /app
USER root

# Variables d'environnement générales
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CI=1

COPY package*.json ./
COPY .internal-scripts/ ./.internal-scripts/

# 1) Installer les dépendances sans exécuter les scripts (évite l'invite interactive)
RUN set -eux; \
    npm ci --omit=dev --ignore-scripts

# 2) Installer Chromium (non-interactif) avec ses dépendances système
RUN set -eux; npx playwright install --with-deps chromium

# 3) Exécuter explicitement le postinstall si nécessaire (il ne devrait plus demander d'input)
#    Retirer "|| true" si tu veux que l'échec de postinstall casse le build.
RUN set -eux; node ./.internal-scripts/postinstall.js || true

# Copier le reste du code applicatif
COPY . .

# Mettre l’entrypoint à l’endroit attendu et le rendre exécutable
RUN cp docker/entrypoint.sh /app/entrypoint.sh \
 && chmod +x /app/entrypoint.sh

# Créer le groupe/utilisateur pwuser avec UID/GID 5555 et préparer les répertoires /data
RUN groupadd -g 5555 pwuser || true \
 && useradd -u 5555 -g 5555 -M -s /bin/bash pwuser || true \
 && mkdir -p /data/profiles /data/downloads \
 && chown -R pwuser:pwuser /app /data /data/profiles /data/downloads \
 && chmod 0755 /app /data /data/profiles /data/downloads

ENV NODE_ENV=production \
    BP_BROWSER=chromium \
    BP_HEADLESS=true \
    BP_CHROMIUM_SANDBOX=false

VOLUME ["/data/profiles", "/data/downloads"]

USER pwuser
ENTRYPOINT ["/bin/bash", "/app/entrypoint.sh"]
# Pas de CMD: entrypoint.sh utilisera START_CMD
