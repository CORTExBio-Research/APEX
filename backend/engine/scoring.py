import math
from typing import Optional

def compute_ska(
    inferred_structure: dict,
    true_structure: dict,
    exogenous_labels: list[str],
    endogenous_labels: list[str],
) -> float:
    """
    Structural Knowledge Accuracy: 1 - normalized Hamming distance
    between inferred and true weight matrix.

    inferred_structure: {connection_key: "positive" | "negative" | "none"}
    true_structure: weight_matrix dict e.g. {"A->Y": 2.0, ...}
    """
    all_possible = [
        f"{x}->{y}"
        for x in exogenous_labels
        for y in endogenous_labels
    ]
    # Also include cross-weights
    for y1 in endogenous_labels:
        for y2 in endogenous_labels:
            if y1 != y2:
                all_possible.append(f"{y1}->{y2}")

    n = len(all_possible)
    if n == 0:
        return 1.0

    hamming = 0
    for conn in all_possible:
        # Ground truth classification
        true_weight = true_structure.get("weight_matrix", {}).get(conn, None)
        if true_weight is None:
            true_weight = true_structure.get("cross_weights", {}).get(conn, None)

        if true_weight is None or true_weight == 0.0:
            true_class = "none"
        elif true_weight > 0:
            true_class = "positive"
        else:
            true_class = "negative"

        # Subject's inferred class
        inferred_class = inferred_structure.get(conn, "none")

        if inferred_class != true_class:
            hamming += 1

    ska = 1.0 - (hamming / n)
    return max(0.0, min(1.0, ska))


def compute_ca(
    control_events: list[dict],
    target_state: dict[str, float],
    variable_bounds: dict[str, dict],
) -> float:
    """
    Control Accuracy: 1 - (RMSE / max_possible_RMSE)
    Averaged across all endogenous variables and all control time steps.
    """
    if not control_events or not target_state:
        return 0.0

    endogenous_labels = list(target_state.keys())
    n_vars = len(endogenous_labels)
    if n_vars == 0:
        return 0.0

    # Compute max possible RMSE for normalization
    max_possible_rmse_per_var = {}
    for label in endogenous_labels:
        bounds = variable_bounds.get(label, {"min": -100, "max": 100})
        span = bounds["max"] - bounds["min"]
        max_possible_rmse_per_var[label] = span

    squared_errors: dict[str, list[float]] = {label: [] for label in endogenous_labels}

    for event in control_events:
        state = event.get("system_state", {})
        for label in endogenous_labels:
            actual = state.get(label, target_state[label])
            target = target_state[label]
            squared_errors[label].append((actual - target) ** 2)

    ca_scores = []
    for label in endogenous_labels:
        if not squared_errors[label]:
            continue
        rmse = math.sqrt(sum(squared_errors[label]) / len(squared_errors[label]))
        max_rmse = max_possible_rmse_per_var.get(label, 1.0)
        if max_rmse == 0:
            ca_scores.append(1.0)
        else:
            ca = 1.0 - (rmse / max_rmse)
            ca_scores.append(max(0.0, min(1.0, ca)))

    if not ca_scores:
        return 0.0
    return sum(ca_scores) / len(ca_scores)


def compute_ee(exploration_events: list[dict], exogenous_labels: list[str]) -> float:
    """
    Exploration Efficiency: proportion of VOTAT interventions.
    VOTAT = Vary One Thing At A Time (only one exo variable changed).
    """
    if not exploration_events:
        return 0.0

    intervention_events = [e for e in exploration_events if e.get("event_type") == "intervention"]
    if not intervention_events:
        return 0.0

    votat_count = sum(1 for e in intervention_events if e.get("is_votat", False))
    return max(0.0, min(1.0, votat_count / len(intervention_events)))


def compute_aui(
    pre_shift_events: list[dict],
    post_shift_events: list[dict],
    target_state: dict[str, float],
    pre_shift_target: dict[str, float],
    variable_bounds: dict[str, dict],
) -> float:
    """
    Adaptive Updating Index: post_shift_CA / pre_shift_CA.
    Normalized to 0-1 range.
    """
    if not pre_shift_events:
        return 0.5  # neutral

    pre_ca = compute_ca(pre_shift_events, pre_shift_target, variable_bounds)
    post_ca = compute_ca(post_shift_events, target_state, variable_bounds)

    if pre_ca == 0:
        return 0.5  # neutral if denominator is zero

    ratio = post_ca / pre_ca
    # Normalize: ratio of 1.0 = no change = 0.5; >1 = improvement; <1 = degradation
    # Map [0, 2] -> [0, 1], clamp
    normalized = ratio / 2.0
    return max(0.0, min(1.0, normalized))


def compute_composite(
    ska: float,
    ca: float,
    ee: float,
    aui: float,
    weights: Optional[dict] = None,
) -> float:
    """Composite APEX Ability Score."""
    if weights is None:
        weights = {"ska": 0.35, "ca": 0.35, "ee": 0.20, "aui": 0.10}
    score = (
        weights.get("ska", 0.35) * ska
        + weights.get("ca", 0.35) * ca
        + weights.get("ee", 0.20) * ee
        + weights.get("aui", 0.10) * aui
    )
    return max(0.0, min(1.0, score))


def is_votat(
    current_inputs: dict[str, float],
    previous_inputs: dict[str, float],
    exogenous_labels: list[str],
) -> bool:
    """Check if intervention changed exactly one exogenous variable."""
    if not previous_inputs:
        return False
    changed = sum(
        1 for label in exogenous_labels
        if abs(current_inputs.get(label, 0) - previous_inputs.get(label, 0)) > 1e-9
    )
    return changed == 1
