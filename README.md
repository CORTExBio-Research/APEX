# APEX — Adaptive Problem-solving under Expanding compleXity

**CORTExBio Corporation | Confidential | Version 1.0**

A web-based behavioral research platform for measuring Complex Problem Solving (CPS) ability using Linear Structural Equation (LSE) dynamic systems.

---

## Prerequisites

- **Docker** ≥ 24.0 and **Docker Compose** ≥ 2.0
- **Node.js** ≥ 20 (for local frontend dev)
- **Python** ≥ 3.12 (for local backend dev)

---

## Quickstart (Docker — Recommended)

```bash
# 1. Copy the environment template
cp .env.example .env

# 2. Edit .env — set a strong APEX_ADMIN_PASSWORD and APEX_SECRET_KEY
nano .env

# 3. Build and start the full stack
docker compose up --build

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API docs: http://localhost:8000/docs
```

The entire stack comes up with a single command. SQLite database is persisted in a Docker volume.

---

## Local Development (without Docker)

### Backend

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export APEX_ADMIN_PASSWORD=dev_admin
export APEX_SECRET_KEY=dev_secret

# Run the FastAPI development server
uvicorn backend.main:app --reload --port 8000

# API docs: http://localhost:8000/docs
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server (proxies /api → localhost:8000)
npm run dev

# Frontend: http://localhost:5173
```

---

## How to Add a New System Definition

System definitions live in `backend/config/systems/`. Each is a JSON file following this schema:

```json
{
  "system_id": "level_16",
  "difficulty_level": 16,
  "label": "Your descriptive label",
  "n_exogenous": 6,
  "n_endogenous": 6,
  "exogenous_labels": ["A", "B", "C", "D", "E", "F"],
  "endogenous_labels": ["Y", "Z", "W", "V", "U", "T"],
  "weight_matrix": {
    "A->Y": 2.0,
    "B->Z": -1.5
  },
  "cross_weights": {
    "Y->Z": 0.3
  },
  "eigendynamic_coefficients": {
    "Y": 0.5,
    "Z": -0.4,
    "W": 0.0,
    "V": 0.0,
    "U": 0.0,
    "T": 0.0
  },
  "variable_bounds": {
    "A": {"min": -5, "max": 5},
    "Y": {"min": -50, "max": 50}
  },
  "initial_state": {"Y": 0, "Z": 0, "W": 0, "V": 0, "U": 0, "T": 0},
  "noise_sigma": 1.0,
  "notes": "Optional description"
}
```

**Stability rules:**
- `eigendynamic_coefficients` must all be in (-1, 1) — recommend (-0.8, 0.7)
- `cross_weights` magnitudes should be small (< 0.5 each)
- The combined endogenous transition matrix must have all eigenvalues with magnitude < 1

You can validate a system programmatically:
```python
from backend.engine.lse_engine import LSESystem
import json

with open("backend/config/systems/level_16.json") as f:
    system_def = json.load(f)

is_valid, msg = LSESystem.validate_system(system_def)
print(is_valid, msg)
```

The staircase will automatically use levels up to `max_level` in `backend/config/staircase_config.json`. Update that value to include your new levels.

---

## How to Change Scoring Weights

Edit `backend/config/app_config.json`:

```json
{
  "scoring_weights": {
    "ska": 0.35,
    "ca": 0.35,
    "ee": 0.20,
    "aui": 0.10
  }
}
```

Weights must sum to 1.0. Changes take effect immediately (no restart needed for config changes if running in dev mode; restart required in Docker).

---

## How to Export Participant Data

### Single session (participant self-service)

The Results screen provides a **Download Data (CSV)** button after session completion.

### Via API

```bash
# Single session export
curl http://localhost:8000/api/scoring/export/{SESSION_ID} \
  -o apex_session.csv

# Full database export (all sessions — requires admin password)
curl http://localhost:8000/api/admin/export/all \
  -H "X-Admin-Password: your_admin_password" \
  -o apex_all_data.csv

# List all sessions
curl http://localhost:8000/api/admin/sessions \
  -H "X-Admin-Password: your_admin_password"
```

The CSV contains every intervention event with timestamps, VOTAT flags, system states, and all four scoring dimensions per trial.

---

## How to Change Phase Timings

Edit `backend/config/app_config.json`:

```json
{
  "phase_timings": {
    "exploration_seconds": 240,
    "metacog_seconds": 180,
    "control_seconds": 240
  }
}
```

---

## Deployment to a Cloud Provider

### Option A: VPS (DigitalOcean, Linode, Hetzner, etc.)

```bash
# On your server:
git clone <your-repo> apex && cd apex
cp .env.example .env
# Edit .env with production values

# Set strong secrets:
APEX_ADMIN_PASSWORD=$(openssl rand -hex 16)
APEX_SECRET_KEY=$(openssl rand -hex 32)

docker compose up -d --build

# Set up reverse proxy (nginx or Caddy) pointing to port 3000
# Point DNS: apex.cortex-bio.com → your server IP
```

### Option B: Render / Railway

1. Create two services: one for backend (`Dockerfile.backend`), one for frontend (`Dockerfile.frontend`)
2. Set the environment variables in each service's dashboard
3. For the frontend, set `APEX_CORS_ORIGINS` to your backend's URL
4. Update `backend/config/app_config.json` `cors_origins` to include your production domain

### Production Database (PostgreSQL)

For production, replace SQLite with PostgreSQL:

```bash
# In your .env:
APEX_DATABASE_URL=postgresql+asyncpg://user:password@host:5432/apex_db
```

Add `asyncpg` to `requirements.txt` and provision a managed PostgreSQL instance (e.g., Supabase, Neon, Railway Postgres).

---

## Architecture Overview

```
apex/
├── backend/
│   ├── main.py                     # FastAPI app entry point
│   ├── database.py                 # Async SQLAlchemy setup
│   ├── models/                     # ORM models (Participant, Session, Trial, Event)
│   ├── engine/
│   │   ├── lse_engine.py           # Core LSE simulation
│   │   ├── staircase.py            # Adaptive difficulty (Bayesian + 2up/1down)
│   │   ├── scoring.py              # SKA, CA, EE, AUI, composite
│   │   └── system_loader.py        # JSON system definition loader
│   ├── routers/                    # FastAPI route handlers
│   └── config/
│       ├── app_config.json         # Phase timings, scoring weights
│       ├── staircase_config.json   # Staircase parameters
│       └── systems/                # 15 pre-specified LSE system definitions
└── frontend/
    └── src/
        ├── components/             # React UI components
        ├── hooks/                  # useTrialState, useCountdown, useEventLogger
        ├── api/                    # API client (apexApi.ts)
        └── types/                  # TypeScript interfaces
```

---

## Scoring Dimensions

| Dimension | Abbreviation | Description | Weight |
|-----------|-------------|-------------|--------|
| Structural Knowledge Accuracy | SKA | How accurately the subject inferred the causal structure | 35% |
| Control Accuracy | CA | How close outputs were brought to targets | 35% |
| Exploration Efficiency | EE | Proportion of VOTAT (Vary One Thing At A Time) interventions | 20% |
| Adaptive Updating Index | AUI | Performance recovery after mid-trial target shift (levels 8+) | 10% |

**Composite APEX Score** = 0.35·SKA + 0.35·CA + 0.20·EE + 0.10·AUI

---

*CORTExBio Corporation | Confidential | March 2026*
*Contact: Daniel Gutierrez, Founder & CEO | cortex-bio.com*
