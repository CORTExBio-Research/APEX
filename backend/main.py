import json
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

from backend.database import init_db
from backend.routers import session, trial, scoring, admin

_APP_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "app_config.json")

def _load_cors_origins() -> list[str]:
    try:
        with open(_APP_CONFIG_PATH) as f:
            config = json.load(f)
        cors = config.get("cors_origins", ["http://localhost:3000", "http://localhost:5173"])
    except Exception:
        cors = ["http://localhost:3000", "http://localhost:5173"]
    # Also allow from env var
    env_origins = os.getenv("APEX_CORS_ORIGINS", "")
    if env_origins:
        cors.extend(env_origins.split(","))
    # Always allow local dev
    cors.extend(["http://localhost:3000", "http://localhost:5173", "http://localhost:4173"])
    return list(set(cors))

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(
    title="APEX API",
    description="Adaptive Problem-solving under Expanding compleXity — CORTExBio",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_load_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(session.router)
app.include_router(trial.router)
app.include_router(scoring.router)
app.include_router(admin.router)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "APEX API", "version": "1.0.0"}

# Serve React frontend static files
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        index_path = os.path.join(frontend_dist, "index.html")
        return FileResponse(index_path)
