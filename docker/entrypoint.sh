#!/bin/bash
set -e

# Créer les dossiers avec permissions larges (tmpfs)
mkdir -p /data/.local/share/beachpatrol
chmod 777 /data/.local/share
chmod 777 /data/.local/share/beachpatrol

mkdir -p /data/.config/beachpatrol
chmod 777 /data/.config/beachpatrol

# Répertoires permanents (bind mounts)
mkdir -p "${BP_PROFILE_DIR}" "${BP_DOWNLOADS_DIR}"

# Debug
echo "[entrypoint] BP_PROFILE_DIR=${BP_PROFILE_DIR}"
echo "[entrypoint] BP_DOWNLOADS_DIR=${BP_DOWNLOADS_DIR}"
echo "[entrypoint] XDG_DATA_HOME=${XDG_DATA_HOME}"
echo "[entrypoint] BP_CHROMIUM_ARGS=${BP_CHROMIUM_ARGS}"

# Déterminer les arguments
ARGS=("$@")
if [ "${BP_HEADLESS}" = "true" ] && [[ ! " ${ARGS[@]} " =~ " --headless " ]]; then
  ARGS+=("--headless")
fi

echo "[entrypoint] Lancement: ${ARGS[*]}"
exec "${ARGS[@]}"