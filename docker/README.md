# BeachPatrol Docker Setup

Dockerized BeachPatrol service with proper permissions and volume management.

---

## Prerequisites

### 1. Create dedicated user and group (UID/GID 5555)

This user will own all persistent volumes and run the container process.

```bash
# Create group
sudo groupadd -g 5555 docker_vol_manager

# Create user (no home, no login)
sudo useradd -u 5555 -g 5555 -M -s /usr/sbin/nologin docker_vol_manager

# Verify
id docker_vol_manager
# Expected: uid=5555(docker_vol_manager) gid=5555(docker_vol_manager) groups=5555(docker_vol_manager)
```

### 2. Add your user to docker group (if not already done)

```bash
sudo usermod -aG docker $USER
newgrp docker  # Or logout/login
```

---

## Installation

### 1. Clone repository

```bash
https://github.com/sebastiancarlos/beachpatrol#
cd beachpatrol/docker
```

### 2. Run setup script

The script will:
- Create volume directories (downloads, profiles)
- Set proper ownership (5555:5555)
- Build Docker image
- Start container
- Show live logs

```bash
./setup.sh
```

## Directory Structure
```
tio_patrol/
├── docker/
│   ├── docker-compose.yml     # Service definition
│   ├── Dockerfile             # Image build
│   ├── entrypoint.sh          # Container startup
│   ├── setup.sh               # Initial setup script
│   ├── check-permissions.sh   # Permission verification
│   ├── downloads/             # Downloaded files (5555:5555)
│   └── profiles/              # Browser profiles (5555:5555)
│       └── default/
├── commands/                  # Command modules (read-only)
├── beachpatrol.js             # Main application
└── package.json
```
## Permissions Overview
|          Path         |   Owner   | Mode |     Purpose    |
|:---------------------:|:---------:|:----:|:--------------:|
| downloads/            | 5555:5555 | 755  | File downloads |
| profiles/             | 5555:5555 | 755  | Browser state  |
| /data/.local (tmpfs)  | -         | 1777 | Runtime cache  |
| /data/.config (tmpfs) | -         | 1777 | Config cache   |
| /data/.cache (tmpfs)  | -         | 1777 | Browser cache  |

## Management Commands
### Check status
```
cd ./beachpatrol/docker
docker compose ps
docker compose logs -f beachpatrol
```
### Stop service
```
docker compose down
```
### Restart service
```
docker compose restart
docker compose logs -f beachpatrol
```
### Rebuild from scratch
```
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

## Environment Variables
|       Variable      |         Default        |         Description        |
|:-------------------:|:----------------------:|:--------------------------:|
| BP_BROWSER          | chromium               | Browser engine             |
| BP_HEADLESS         | true                   | Headless mode              |
| BP_CHROMIUM_SANDBOX | false                  | Disable sandbox (required) |
| BP_PROFILE_DIR      | /data/profiles/default | Profile location           |
| BP_DOWNLOADS_DIR    | /data/downloads        | Download location          |
| BP_SOCKET           | 0.0.0.0:9321           | TCP socket binding         |
| BP_HTTP_PORT        | 9322                   | HTTP API port              |
| BP_WRITE_FILES      | 1                      | Enable file writing        |
| BP_COPY_LINKS       | 1                      | Enable link copying        |
| BP_FOLLOW_REPLIES   | 1                      | Follow reply chains        |

## Health Check
The container runs a health check every 20s:
```
nc -z 127.0.0.1 9321
```
Check health status:
```
docker compose ps
# Should show "healthy" status
```