"""
verify_reachability.py
Verify that the new _generate_target_state (forward sampling) produces
100% reachable targets at all levels 8-15.

For each generated target Y*, we solve W * X = (I-C-E) * Y* via lstsq
and check that the required X lies within ±5 (slider bounds).
"""
import json
import os
import sys
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

SYSTEMS_DIR = 'backend/config/systems'
N_SAMPLES = 100
np.random.seed(0)

def build_matrices(sd):
    exo = sd['exogenous_labels']
    endo = sd['endogenous_labels']
    n_exo, n_endo = len(exo), len(endo)

    W = np.zeros((n_endo, n_exo))
    for conn, w in sd.get('weight_matrix', {}).items():
        src, dst = conn.split('->')
        if src in exo and dst in endo:
            W[endo.index(dst), exo.index(src)] = w

    C = np.zeros((n_endo, n_endo))
    for conn, w in sd.get('cross_weights', {}).items():
        src, dst = conn.split('->')
        if src in endo and dst in endo:
            C[endo.index(dst), endo.index(src)] = w

    E = np.zeros((n_endo, n_endo))
    for label, coef in sd.get('eigendynamic_coefficients', {}).items():
        if label in endo:
            E[endo.index(label), endo.index(label)] = coef

    return W, C, E, exo, endo


def simulate_generate_target(sd, W, C, E, endo):
    """Replicate the new _generate_target_state logic exactly."""
    M = np.eye(len(endo)) - C - E
    X = np.random.uniform(-4.0, 4.0, size=len(sd['exogenous_labels']))
    try:
        Y_star = np.linalg.solve(M, W @ X)
    except np.linalg.LinAlgError:
        Y_star = np.linalg.lstsq(M, W @ X, rcond=None)[0]
    vb = sd['variable_bounds']
    target = {}
    for i, label in enumerate(endo):
        bounds = vb.get(label, {"min": -50, "max": 50})
        clamped = float(np.clip(Y_star[i], bounds["min"], bounds["max"]))
        target[label] = round(clamped, 1)
    return target, X  # return X too so we can verify it directly


print("=" * 75)
print(f"REACHABILITY VERIFICATION — {N_SAMPLES} samples per level (Levels 8–15)")
print("Method: forward sampling  |  Slider bounds: ±5")
print("=" * 75)
print(f"{'Level':>5} | {'% Reach':>7} | {'Mean|X*|':>8} | {'Max|X*|':>8} | {'Status':>8}")
print("-" * 50)

all_passed = True

for lvl in range(8, 16):
    with open(f'{SYSTEMS_DIR}/level_{lvl:02d}.json') as f:
        sd = json.load(f)
    W, C, E, exo, endo = build_matrices(sd)
    M = np.eye(len(endo)) - C - E

    reachable_count = 0
    x_mags = []

    for _ in range(N_SAMPLES):
        target, X_used = simulate_generate_target(sd, W, C, E, endo)

        # Verify: compute required X* to reach this target via inverse
        y_vec = np.array([target[lbl] for lbl in endo])
        rhs = M @ y_vec
        x_star, _, _, _ = np.linalg.lstsq(W, rhs, rcond=None)
        max_abs = np.max(np.abs(x_star))
        x_mags.append(max_abs)

        # Reachable if required X* is within slider bounds
        # (with small numerical tolerance)
        if max_abs <= 5.0 + 1e-6:
            reachable_count += 1

    pct = 100.0 * reachable_count / N_SAMPLES
    mean_x = float(np.mean(x_mags))
    max_x = float(np.max(x_mags))
    status = "PASS" if pct == 100.0 else "FAIL"
    if pct < 100.0:
        all_passed = False

    print(f"  L{lvl:02d} | {pct:7.1f}% | {mean_x:8.3f} | {max_x:8.3f} | {status:>8}")

print("-" * 50)
print(f"\nAll levels 100% reachable: {'YES ✓' if all_passed else 'NO ✗'}")

if not all_passed:
    print("\n[FAIL] One or more levels have unreachable targets. Review implementation.")
    sys.exit(1)
else:
    print("\n[PASS] Forward sampling guarantees reachability at all levels 8-15.")
    print("       CA scores will always be measured against achievable targets.")
