import json
import os
from pathlib import Path
from backend.engine.lse_engine import LSESystem

_SYSTEMS_DIR = Path(__file__).parent.parent / "config" / "systems"
_system_cache: dict[str, LSESystem] = {}

def load_system(system_id: str) -> LSESystem:
    """Load a system definition by ID (e.g., 'level_01')."""
    if system_id in _system_cache:
        return _system_cache[system_id]
    path = _SYSTEMS_DIR / f"{system_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"System definition not found: {path}")
    with open(path) as f:
        system_def = json.load(f)
    system = LSESystem(system_def)
    _system_cache[system_id] = system
    return system

def load_system_for_level(level: int) -> LSESystem:
    """Load the system for a given difficulty level (1-15)."""
    system_id = f"level_{level:02d}"
    return load_system(system_id)

def list_all_systems() -> list[dict]:
    """Return metadata for all available system definitions."""
    systems = []
    for path in sorted(_SYSTEMS_DIR.glob("level_*.json")):
        with open(path) as f:
            data = json.load(f)
        is_valid, msg = LSESystem.validate_system(data)
        systems.append({
            "system_id": data["system_id"],
            "difficulty_level": data["difficulty_level"],
            "label": data.get("label", ""),
            "n_exogenous": data["n_exogenous"],
            "n_endogenous": data["n_endogenous"],
            "noise_sigma": data.get("noise_sigma", 0.0),
            "is_stable": is_valid,
            "validation_msg": msg,
        })
    return systems

def get_system_config_for_frontend(system: LSESystem) -> dict:
    """Return system config safe to send to frontend (no weights)."""
    return {
        "system_id": system.system_id,
        "difficulty_level": system.difficulty_level,
        "n_exogenous": system.n_exogenous,
        "n_endogenous": system.n_endogenous,
        "exogenous_labels": system.exogenous_labels,
        "endogenous_labels": system.endogenous_labels,
        "variable_bounds": system.variable_bounds,
        "initial_state": system.initial_state,
    }
