import numpy as np
from typing import Optional

class LSESystem:
    """
    Encapsulates a single Linear Structural Equation dynamic system.
    All parameters loaded from a system definition JSON file.
    """

    def __init__(self, system_def: dict):
        self.system_id: str = system_def["system_id"]
        self.difficulty_level: int = system_def["difficulty_level"]
        self.label: str = system_def.get("label", "")
        self.n_exogenous: int = system_def["n_exogenous"]
        self.n_endogenous: int = system_def["n_endogenous"]
        self.exogenous_labels: list[str] = system_def["exogenous_labels"]
        self.endogenous_labels: list[str] = system_def["endogenous_labels"]
        self.weight_matrix: dict[str, float] = system_def.get("weight_matrix", {})
        self.eigendynamic_coefficients: dict[str, float] = system_def.get("eigendynamic_coefficients", {})
        self.cross_weights: dict[str, float] = system_def.get("cross_weights", {})
        self.variable_bounds: dict[str, dict] = system_def["variable_bounds"]
        self.initial_state: dict[str, float] = system_def["initial_state"]
        self.noise_sigma: float = system_def.get("noise_sigma", 0.0)
        self.notes: str = system_def.get("notes", "")
        # Build internal lookup for faster computation
        self._build_lookup()

    def _build_lookup(self):
        """Pre-compute lookup structures for efficient stepping."""
        # exo_to_endo[endo_label] = [(exo_label, weight), ...]
        self._exo_effects: dict[str, list[tuple[str, float]]] = {y: [] for y in self.endogenous_labels}
        for key, weight in self.weight_matrix.items():
            if "->" in key:
                src, dst = key.split("->")
                if src in self.exogenous_labels and dst in self.endogenous_labels:
                    self._exo_effects[dst].append((src, weight))

        # cross_effects[endo_label] = [(src_endo_label, weight), ...]
        self._cross_effects: dict[str, list[tuple[str, float]]] = {y: [] for y in self.endogenous_labels}
        for key, weight in self.cross_weights.items():
            if "->" in key:
                src, dst = key.split("->")
                if src in self.endogenous_labels and dst in self.endogenous_labels:
                    self._cross_effects[dst].append((src, weight))

    def step(self, exogenous_inputs: dict[str, float], current_state: dict[str, float]) -> dict[str, float]:
        """
        Advance system by one time step.

        Args:
            exogenous_inputs: {label: value} for all exogenous variables
            current_state: {label: value} for all endogenous variables at time t

        Returns:
            new_state: {label: value} for all endogenous variables at time t+1
        """
        new_state: dict[str, float] = {}

        for y_label in self.endogenous_labels:
            value = 0.0

            # Sum exogenous contributions
            for x_label, weight in self._exo_effects[y_label]:
                x_val = exogenous_inputs.get(x_label, 0.0)
                value += weight * x_val

            # Sum cross-endogenous contributions
            for src_label, weight in self._cross_effects[y_label]:
                y_val = current_state.get(src_label, 0.0)
                value += weight * y_val

            # Eigendynamic (self-referential) term
            e_y = self.eigendynamic_coefficients.get(y_label, 0.0)
            value += e_y * current_state.get(y_label, 0.0)

            # Add Gaussian noise
            if self.noise_sigma > 0.0:
                value += np.random.normal(0.0, self.noise_sigma)

            # Clamp to bounds
            bounds = self.variable_bounds.get(y_label, {"min": -1e9, "max": 1e9})
            value = float(np.clip(value, bounds["min"], bounds["max"]))

            new_state[y_label] = value

        return new_state

    def get_display_state(self, state: dict[str, float]) -> dict[str, float]:
        """Return state normalized to 0-100 scale for frontend display."""
        display = {}
        for label, value in state.items():
            bounds = self.variable_bounds.get(label, {"min": -100, "max": 100})
            min_v = bounds["min"]
            max_v = bounds["max"]
            if max_v == min_v:
                normalized = 50.0
            else:
                normalized = (value - min_v) / (max_v - min_v) * 100.0
            display[label] = float(np.clip(normalized, 0.0, 100.0))
        return display

    def check_stability(self) -> bool:
        """
        Verify system is mathematically stable.
        The endogenous sub-system is stable if all eigenvalues of the
        combined [eigendynamics + cross_weights] transition matrix have magnitude < 1.
        """
        n = self.n_endogenous
        # Build the transition matrix for endogenous variables
        A = np.zeros((n, n))
        for i, y_label in enumerate(self.endogenous_labels):
            # Diagonal: eigendynamic coefficient
            A[i, i] = self.eigendynamic_coefficients.get(y_label, 0.0)
            # Off-diagonal: cross-weights
            for src_label, weight in self._cross_effects[y_label]:
                j = self.endogenous_labels.index(src_label)
                A[i, j] += weight

        eigenvalues = np.linalg.eigvals(A)
        return bool(np.all(np.abs(eigenvalues) < 1.0))

    def get_true_structure(self) -> dict:
        """Return ground truth weight matrix — used by scoring engine only, never sent to frontend."""
        return {
            "weight_matrix": self.weight_matrix,
            "cross_weights": self.cross_weights,
            "eigendynamic_coefficients": self.eigendynamic_coefficients,
            "exogenous_labels": self.exogenous_labels,
            "endogenous_labels": self.endogenous_labels,
        }

    def get_initial_state(self) -> dict[str, float]:
        return dict(self.initial_state)

    @classmethod
    def validate_system(cls, system_def: dict) -> tuple[bool, str]:
        """Check a system definition for stability and reachability. Returns (is_valid, message)."""
        try:
            sys = cls(system_def)
            if not sys.check_stability():
                return False, "System is dynamically unstable (eigenvalues >= 1)"

            # Reachability check: (I - C - E) must not be near-singular.
            # A highly ill-conditioned (I-C-E) means steady-state targets computed
            # via forward sampling will be poorly distributed; cond > 1000 is a
            # practical failure threshold beyond which target generation degrades.
            n = sys.n_endogenous
            C = np.zeros((n, n))
            for conn, w in sys.cross_weights.items():
                if "->" in conn:
                    src, dst = conn.split("->")
                    if src in sys.endogenous_labels and dst in sys.endogenous_labels:
                        C[sys.endogenous_labels.index(dst), sys.endogenous_labels.index(src)] = w
            E = np.zeros((n, n))
            for label, coef in sys.eigendynamic_coefficients.items():
                if label in sys.endogenous_labels:
                    E[sys.endogenous_labels.index(label), sys.endogenous_labels.index(label)] = coef
            M = np.eye(n) - C - E
            cond = float(np.linalg.cond(M))
            if cond > 1000:
                return False, (
                    f"(I-C-E) is near-singular (cond={cond:.1f}); "
                    "forward-sampled targets will not cover the output space reliably"
                )

            return True, "System is valid and stable"
        except Exception as e:
            return False, f"Validation error: {e}"
