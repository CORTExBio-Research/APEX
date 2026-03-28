# APEX — Adaptive Problem-solving under Expanding compleXity
## Claude Code Technical Specification Prompt
### CORTExBio Corporation | Confidential
### Version 1.0 | March 2026

---

## OVERVIEW FOR CLAUDE CODE

You are being asked to build **APEX** — a web-based behavioral research platform for measuring Complex Problem Solving (CPS) ability. APEX presents subjects with a hidden dynamic causal system. Subjects must first explore the system to discover its causal structure (Exploration Phase), then control it to reach defined target states (Control Phase), and finally complete a Metacognitive Report about their confidence and understanding.

The platform uses:
- **Backend:** Python + FastAPI
- **Frontend:** React (TypeScript preferred, JavaScript acceptable)
- **Database:** SQLite for development, PostgreSQL-compatible schema for production
- **Deployment target:** Web-deployable, intended for hosting at `apex.cortex-bio.com`
- **Architecture:** Fully modular — every parameter, system definition, and scoring rule must be configurable via external files (JSON/YAML), not hardcoded

This is Version 1. It does not need to be perfect. It needs to be functional, modular, and extensible. We will refine after reviewing the first build.

---

## THEORETICAL BACKGROUND (READ BEFORE BUILDING)

APEX is grounded in the Linear Structural Equation (LSE) formalism for dynamic systems (Funke, 2001). The subject interacts with a system defined by:

- **Exogenous variables (inputs):** Variables the subject can directly manipulate via sliders or input controls
- **Endogenous variables (outputs):** Variables the subject cannot directly manipulate; they change as a consequence of exogenous inputs and their own dynamics
- **Causal weight matrix:** Hidden from the subject; defines how exogenous variables affect endogenous variables
- **Eigendynamics:** Some endogenous variables have a self-referential term — they grow or decay over time steps independent of any input

The system evolves in **discrete time steps**. At each time step, the subject may adjust one or more exogenous variables. The system then computes the new state of all endogenous variables according to the LSE equations. The subject observes the new output state and updates their mental model accordingly.

The fundamental equation for each endogenous variable Y at time t+1 is:

```
Y(t+1) = Σ [w_i * X_i(t)] + Σ [w_j * Y_j(t)] + e_Y * Y(t)
```

Where:
- X_i are exogenous variables with causal weights w_i
- Y_j are other endogenous variables with cross-weights w_j (optional, for higher complexity)
- e_Y is the eigendynamic coefficient for Y (0 = no eigendynamic; >0 = growth; <0 = decay)

---

## SYSTEM ARCHITECTURE

```
apex/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── routers/
│   │   ├── session.py           # Session creation, participant registration
│   │   ├── trial.py             # Trial state, interventions, phase transitions
│   │   ├── scoring.py           # Scoring computation endpoints
│   │   └── admin.py             # Admin: view sessions, export data
│   ├── models/
│   │   ├── session.py           # SQLAlchemy session model
│   │   ├── trial.py             # Trial state and event log model
│   │   └── participant.py       # Participant model
│   ├── engine/
│   │   ├── lse_engine.py        # Core LSE simulation engine
│   │   ├── staircase.py         # Adaptive difficulty staircase logic
│   │   ├── scoring.py           # All scoring algorithms
│   │   └── system_loader.py     # Load system definitions from JSON
│   ├── config/
│   │   ├── systems/             # Pre-specified LSE system definitions (JSON)
│   │   │   ├── level_01.json
│   │   │   ├── level_02.json
│   │   │   └── ... (up to level_20.json)
│   │   ├── staircase_config.json # Staircase parameters
│   │   └── app_config.json      # General app configuration
│   └── database.py              # DB connection and session management
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ExplorationPhase.tsx    # Exploration UI
│   │   │   ├── ControlPhase.tsx        # Control UI
│   │   │   ├── MetacognitiveReport.tsx # Between-phase report
│   │   │   ├── SystemDisplay.tsx       # Live variable display (gauges/graphs)
│   │   │   ├── InterventionPanel.tsx   # Exogenous variable controls
│   │   │   ├── HistoryPanel.tsx        # Time-series history of variables
│   │   │   ├── InstructionScreen.tsx   # Phase instructions
│   │   │   └── ResultsScreen.tsx       # Post-trial feedback (optional)
│   │   ├── hooks/
│   │   │   ├── useTrialState.ts        # Trial state management
│   │   │   └── useEventLogger.ts       # Client-side event logging
│   │   ├── api/
│   │   │   └── apexApi.ts              # All API calls to FastAPI backend
│   │   ├── types/
│   │   │   └── apex.types.ts           # TypeScript interfaces
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml           # Local dev + production deployment
├── Dockerfile.backend
├── Dockerfile.frontend
└── README.md
```

---

## MODULE 1: LSE ENGINE (`backend/engine/lse_engine.py`)

This is the core computational module. Everything else depends on it.

### Requirements

```python
class LSESystem:
    """
    Encapsulates a single Linear Structural Equation dynamic system.
    All parameters loaded from a system definition JSON file.
    """
    
    def __init__(self, system_def: dict):
        # system_def contains:
        # - system_id: str
        # - difficulty_level: int (1-20)
        # - n_exogenous: int
        # - n_endogenous: int
        # - exogenous_labels: list[str]  (abstract labels: "A", "B", "C"...)
        # - endogenous_labels: list[str] (abstract labels: "Y", "Z", "W"...)
        # - weight_matrix: dict  (maps "A->Y": float, "B->Z": float, etc.)
        # - eigendynamic_coefficients: dict (maps endogenous_label: float)
        # - cross_weights: dict  (endogenous-to-endogenous; maps "Y->Z": float)
        # - variable_bounds: dict (min/max for each variable)
        # - initial_state: dict  (starting values for all variables)
        # - noise_sigma: float   (optional Gaussian noise added to outputs)
        pass
    
    def step(self, exogenous_inputs: dict, current_state: dict) -> dict:
        """
        Advance system by one time step.
        
        Args:
            exogenous_inputs: {label: value} for all exogenous variables
            current_state: {label: value} for all endogenous variables at time t
        
        Returns:
            new_state: {label: value} for all endogenous variables at time t+1
        """
        pass
    
    def get_display_state(self, state: dict) -> dict:
        """Return state formatted for frontend display (normalized 0-100 scale)."""
        pass
    
    def check_stability(self) -> bool:
        """Verify system is mathematically stable (eigenvalues within bounds)."""
        pass
```

### Critical Implementation Notes

- All variable values must be **clamped** to their defined bounds at every time step to prevent runaway values
- Gaussian noise (configurable sigma) should be added to endogenous outputs to introduce opacity — subjects cannot perfectly infer causal weights from a single observation
- The system must expose a `get_true_structure()` method that returns the ground truth weight matrix — used by the scoring engine, never sent to the frontend
- Implement a `validate_system()` class method that checks a system definition for stability before it is accepted into the library

---

## MODULE 2: SYSTEM LIBRARY (`backend/config/systems/`)

### Pre-specified System Definitions

Build **15 system definition JSON files** spanning difficulty levels 1 through 15. Levels 16-20 are reserved for future addition. Each file follows this schema:

```json
{
  "system_id": "level_01",
  "difficulty_level": 1,
  "label": "Simple Linear — 2 inputs, 2 outputs, no eigendynamics",
  "n_exogenous": 2,
  "n_endogenous": 2,
  "exogenous_labels": ["A", "B"],
  "endogenous_labels": ["Y", "Z"],
  "weight_matrix": {
    "A->Y": 2.0,
    "A->Z": 3.0,
    "B->Z": -2.0
  },
  "cross_weights": {},
  "eigendynamic_coefficients": {
    "Y": 0.0,
    "Z": 0.0
  },
  "variable_bounds": {
    "A": {"min": -5, "max": 5},
    "B": {"min": -5, "max": 5},
    "Y": {"min": -50, "max": 50},
    "Z": {"min": -50, "max": 50}
  },
  "initial_state": {"Y": 0, "Z": 0},
  "noise_sigma": 0.0,
  "notes": "Direct replication of Funke (2001) Figure 1 example system"
}
```

### Difficulty Progression Guidelines

Design the 15 systems according to this progression. Each level increases difficulty along one or more of these dimensions:

| Level | Exogenous Vars | Endogenous Vars | Eigendynamics | Cross-weights | Noise | Key Feature Added |
|-------|---------------|-----------------|---------------|---------------|-------|-------------------|
| 1 | 2 | 2 | None | None | 0.0 | Baseline: direct effects only |
| 2 | 2 | 2 | None | None | 0.5 | Noise introduced |
| 3 | 2 | 3 | None | None | 0.5 | Third output added |
| 4 | 3 | 3 | None | None | 0.5 | Third input added |
| 5 | 3 | 3 | 1 var | None | 0.5 | First eigendynamic |
| 6 | 3 | 3 | 2 vars | None | 1.0 | Two eigendynamics |
| 7 | 3 | 4 | 1 var | 1 link | 1.0 | First cross-weight (indirect effect) |
| 8 | 4 | 4 | 2 vars | 1 link | 1.0 | Larger system |
| 9 | 4 | 4 | 2 vars | 2 links | 1.5 | Two indirect effects |
| 10 | 4 | 5 | 2 vars | 2 links | 1.5 | Increased output dimensionality |
| 11 | 5 | 5 | 3 vars | 2 links | 2.0 | High connectivity |
| 12 | 5 | 5 | 3 vars | 3 links | 2.0 | Dense indirect effects |
| 13 | 5 | 6 | 3 vars | 3 links | 2.5 | Near-maximum variable count |
| 14 | 6 | 6 | 4 vars | 4 links | 2.5 | High connectivity + strong eigendynamics |
| 15 | 6 | 6 | 4 vars | 5 links | 3.0 | Theoretical ceiling: near-impossible to fully characterize |

**Critical design constraint for Level 15:** The system must be designed so that complete causal characterization within a single exploration phase is theoretically impossible. The combination of noise, eigendynamics, and dense cross-weights should ensure that no subject can achieve a perfect structural knowledge score. This is the unreachable ceiling.

All 15 systems must pass the `validate_system()` stability check before inclusion.

---

## MODULE 3: ADAPTIVE STAIRCASE (`backend/engine/staircase.py`)

### Requirements

The staircase determines which system difficulty level a subject encounters on each trial based on their running performance.

```python
class AdaptiveStaircase:
    """
    Bayesian-adaptive difficulty selection.
    Maintains a running estimate of subject ability and selects
    the next trial difficulty to maximize information gain.
    
    Falls back to a simpler 2-up/1-down rule if Bayesian
    estimation fails or is disabled in config.
    """
    
    def __init__(self, config: dict):
        # config loaded from staircase_config.json
        # - initial_level: int (default: 3)
        # - min_level: int (default: 1)
        # - max_level: int (default: 15)
        # - ability_prior_mean: float
        # - ability_prior_sd: float
        # - performance_threshold: float (score below this = failure)
        # - fallback_rule: "2up1down" | "bayesian"
        pass
    
    def update(self, trial_result: dict) -> int:
        """
        Update ability estimate based on completed trial result.
        Returns the recommended difficulty level for the next trial.
        """
        pass
    
    def get_ability_estimate(self) -> dict:
        """
        Return current ability estimate with confidence interval.
        {
          "estimated_level": float,
          "ci_lower": float,
          "ci_upper": float,
          "n_trials_completed": int
        }
        """
        pass
```

### Staircase Configuration (`backend/config/staircase_config.json`)

```json
{
  "initial_level": 3,
  "min_level": 1,
  "max_level": 15,
  "ability_prior_mean": 5.0,
  "ability_prior_sd": 3.0,
  "performance_threshold": 0.5,
  "fallback_rule": "2up1down",
  "calibration_trials": 2,
  "max_trials_per_session": 8
}
```

---

## MODULE 4: SCORING ENGINE (`backend/engine/scoring.py`)

### Four Scoring Dimensions

Every completed trial produces scores on four dimensions. All scores are normalized 0.0 to 1.0.

**Score 1: Structural Knowledge Accuracy (SKA)**

Measures how accurately the subject inferred the causal structure during exploration.

```
SKA = 1 - (normalized Hamming distance between inferred and true weight matrix)
```

The subject's inferred structure is captured via the Metacognitive Report (see Module 6). They indicate which connections they believe exist (yes/no for each possible pair) and optionally the direction (positive/negative). SKA compares this against ground truth.

**Score 2: Control Accuracy (CA)**

Measures how close the subject brought endogenous variables to their target states during the control phase.

```
CA = 1 - (RMSE / max_possible_RMSE)

Where RMSE = sqrt( mean( (actual_value_t - target_value)^2 ) )
averaged across all endogenous variables and all time steps in control phase
```

**Score 3: Exploration Efficiency (EE)**

Measures how systematically the subject explored the system. Specifically, measures the proportion of exploration interventions that were VOTAT (Vary One Thing At A Time) — changing only one exogenous variable while holding all others constant.

```
EE = (number of VOTAT interventions) / (total number of interventions)
```

**Score 4: Adaptive Updating Index (AUI)**

Measures how quickly and accurately the subject revised their control strategy when the target state was shifted mid-trial (only applicable in levels 8+, where mid-trial target shifts are introduced).

```
AUI = post_shift_CA / pre_shift_CA
```

Values >1.0 indicate the subject improved after the shift (adaptive). Values <1.0 indicate degradation. Normalized to 0-1 range for the composite.

**Composite APEX Ability Score:**

```
APEX_Score = (0.35 * SKA) + (0.35 * CA) + (0.20 * EE) + (0.10 * AUI)
```

Weights are configurable in `app_config.json`. The staircase uses the composite score to update the ability estimate.

---

## MODULE 5: TRIAL FLOW & SESSION MANAGEMENT

### Session Lifecycle

```
1. Participant Registration
   → Participant enters anonymous ID (or is assigned one)
   → Session record created in database
   → APEX variant assigned (Standard by default in v1)

2. Calibration (Trials 1-2)
   → Both at Level 3 (fixed, not adaptive)
   → Establishes baseline for staircase

3. Adaptive Trials (Trials 3-8)
   → Staircase selects level based on running performance
   → Each trial: Exploration Phase → Metacognitive Report → Control Phase → Scoring

4. Session Complete
   → APEX Ability Score computed from all trials
   → Results screen shown to participant
   → All data saved to database
```

### Trial Phase Timing

All timings configurable in `app_config.json`:

| Phase | Default Duration | Behavior at Time Limit |
|-------|-----------------|----------------------|
| Exploration | 4 minutes | Phase ends; participant proceeds to report |
| Metacognitive Report | 3 minutes | Auto-submitted with current responses |
| Control | 4 minutes | Phase ends; scored on state at time limit |

---

## MODULE 6: METACOGNITIVE REPORT (`frontend/src/components/MetacognitiveReport.tsx`)

This screen appears between the Exploration and Control phases. It has three components:

**Component A: Causal Structure Diagram**

Display a matrix of all possible connections between exogenous and endogenous variables. For each possible connection, the subject selects one of three options:
- "Connection exists (positive effect)"
- "Connection exists (negative effect)"  
- "No connection"

This produces the subject's inferred weight matrix, which is compared against ground truth for the SKA score.

**Component B: Confidence Rating**

A single slider: "How confident are you in your understanding of this system?"
Scale: 0 (Not at all confident) to 100 (Completely confident)

This is stored as the **Metacognitive Calibration Score** — compared against SKA to measure calibration accuracy (high confidence + low SKA = overconfidence; low confidence + high SKA = underconfidence).

**Component C: Strategy Report (Optional)**

A free-text field: "Briefly describe the strategy you used to explore the system."
Maximum 500 characters. This is stored verbatim for qualitative analysis.

---

## MODULE 7: FRONTEND UI REQUIREMENTS

### Exploration Phase Display

The screen must show simultaneously:
- **Intervention Panel (left):** Sliders for each exogenous variable, labeled abstractly (A, B, C...). Each slider has a numeric readout. A "Submit Intervention" button advances the system by one time step.
- **System Display (center):** Current values of all endogenous variables as both numeric readouts and simple bar gauges (color-coded: green = within normal range, yellow = approaching bounds, red = at bounds).
- **History Panel (right):** A scrollable time-series graph showing the last 10 time steps for all endogenous variables. Each variable has a distinct color.
- **Timer (top right):** Countdown timer for the phase.
- **Step Counter (top left):** "Step X of unlimited" — no step limit during exploration.

### Control Phase Display

Same layout as exploration, with the addition of:
- **Target State Indicators:** Each endogenous variable gauge shows a target value marker (a horizontal line on the gauge). The subject's goal is to bring the variable to that target.
- **Deviation Readout:** Below each gauge, a small numeric display showing current deviation from target ("−12.3 from target").

### Design Requirements
- Clean, minimal interface — no decorative elements that distract from the task
- All text in a single sans-serif font (Inter or similar)
- Dark mode preferred (matches cortex-bio.com aesthetic)
- Fully responsive for desktop (minimum 1280px width assumed for v1)
- No mobile optimization required in v1

---

## MODULE 8: DATABASE SCHEMA

### Tables

```sql
-- Participants
CREATE TABLE participants (
    id TEXT PRIMARY KEY,           -- anonymous participant ID
    created_at TIMESTAMP,
    apex_variant TEXT DEFAULT 'standard',
    metadata JSON                  -- optional: age, group assignment, etc.
);

-- Sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    participant_id TEXT REFERENCES participants(id),
    created_at TIMESTAMP,
    completed_at TIMESTAMP,
    n_trials_completed INTEGER,
    apex_ability_score REAL,
    staircase_final_level REAL,
    status TEXT                    -- 'active', 'completed', 'abandoned'
);

-- Trials
CREATE TABLE trials (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    trial_number INTEGER,
    system_id TEXT,
    difficulty_level INTEGER,
    phase TEXT,                    -- 'calibration' or 'adaptive'
    score_ska REAL,
    score_ca REAL,
    score_ee REAL,
    score_aui REAL,
    score_composite REAL,
    metacog_confidence INTEGER,
    metacog_inferred_structure JSON,
    metacog_calibration_score REAL,
    metacog_strategy_text TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- Event Log (every subject interaction)
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trial_id TEXT REFERENCES trials(id),
    timestamp TIMESTAMP,
    phase TEXT,                    -- 'exploration' or 'control'
    step_number INTEGER,
    event_type TEXT,               -- 'intervention', 'phase_transition', etc.
    exogenous_inputs JSON,         -- {A: val, B: val, ...}
    system_state JSON,             -- {Y: val, Z: val, ...}
    target_state JSON,             -- null during exploration
    is_votat BOOLEAN               -- computed server-side at log time
);
```

---

## MODULE 9: API ENDPOINTS (`backend/routers/`)

### Session Router

```
POST /api/session/create
    Body: { participant_id: str (optional), apex_variant: str }
    Returns: { session_id, first_trial_config }

GET /api/session/{session_id}/status
    Returns: { status, n_trials, ability_estimate, current_trial }
```

### Trial Router

```
POST /api/trial/start
    Body: { session_id, trial_number }
    Returns: { trial_id, system_config (no weights), phase_timings }

POST /api/trial/intervene
    Body: { trial_id, phase, exogenous_inputs: {A: val, B: val} }
    Returns: { new_system_state, step_number, time_remaining }

POST /api/trial/submit_metacog
    Body: { trial_id, inferred_structure: {}, confidence: int, strategy_text: str }
    Returns: { ska_score, calibration_score, control_phase_config }

POST /api/trial/complete
    Body: { trial_id }
    Returns: { trial_scores, next_trial_level, session_ability_estimate }
```

### Scoring Router

```
GET /api/scoring/session/{session_id}
    Returns: full scoring breakdown for all trials in session

GET /api/scoring/export/{session_id}
    Returns: CSV export of all events and scores for the session
```

### Admin Router (password-protected)

```
GET /api/admin/sessions
    Returns: list of all sessions with summary stats

GET /api/admin/export/all
    Returns: full database export as CSV zip

GET /api/admin/system_library
    Returns: list of all loaded system definitions with metadata
```

---

## MODULE 10: CONFIGURATION FILES

### App Config (`backend/config/app_config.json`)

```json
{
  "app_name": "APEX",
  "version": "1.0.0",
  "apex_variants": ["standard", "clinical", "advanced"],
  "default_variant": "standard",
  "phase_timings": {
    "exploration_seconds": 240,
    "metacog_seconds": 180,
    "control_seconds": 240
  },
  "scoring_weights": {
    "ska": 0.35,
    "ca": 0.35,
    "ee": 0.20,
    "aui": 0.10
  },
  "mid_trial_target_shift": {
    "enabled_from_level": 8,
    "shift_at_step": 10,
    "shift_magnitude_fraction": 0.3
  },
  "cors_origins": ["https://cortex-bio.com", "https://apex.cortex-bio.com"],
  "admin_password_env_var": "APEX_ADMIN_PASSWORD"
}
```

---

## DEPLOYMENT REQUIREMENTS

### Docker Compose (for both local dev and production)

Provide a `docker-compose.yml` that spins up:
1. FastAPI backend service (port 8000)
2. React frontend service (Nginx serving built assets, port 3000)
3. SQLite volume mount for development (swap to PostgreSQL connection string for production)

### Environment Variables

```
APEX_DATABASE_URL=sqlite:///./apex.db        # dev
APEX_DATABASE_URL=postgresql://...           # production
APEX_ADMIN_PASSWORD=<set_by_operator>
APEX_CORS_ORIGINS=https://cortex-bio.com,https://apex.cortex-bio.com
APEX_SECRET_KEY=<random_secret_for_sessions>
```

### README Requirements

The README must include:
1. Prerequisites (Docker, Node.js version, Python version)
2. Local development setup (step by step)
3. How to add a new system definition to the library
4. How to change scoring weights
5. How to export participant data
6. How to deploy to a cloud provider (general guidance for a VPS or Render/Railway)

---

## V1 SCOPE BOUNDARIES (WHAT TO EXCLUDE)

The following are planned for v2 and must NOT be built in v1:

- User authentication / login system (anonymous sessions only in v1)
- APEX-Clinical or APEX-Advanced variant-specific UI (all subjects use Standard in v1)
- Real-time multiplayer or collaborative features
- Mobile-responsive design
- Automated email reports
- Integration with cortex-bio.com CMS
- PET/EEG data integration
- Random system generation (pre-specified library only)

---

## SUCCESS CRITERIA FOR V1

The build is complete when:

1. A subject can visit apex.cortex-bio.com, receive an anonymous participant ID, and complete a full session of 8 trials with no errors
2. The adaptive staircase correctly adjusts difficulty based on performance
3. All four scoring dimensions are computed and stored correctly
4. The event log captures every intervention with timestamp and VOTAT classification
5. The admin export endpoint returns a complete, analysis-ready CSV
6. The system library loads all 15 pre-specified systems correctly
7. The Level 15 system is demonstrably harder than Level 1 (verified by running simulated sessions)
8. Docker Compose brings up the full stack with a single command

---

*CORTExBio Corporation | Confidential | March 2026*
*Contact: Daniel Gutierrez, Founder & CEO | cortex-bio.com*
