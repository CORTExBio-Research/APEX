import math
from typing import Optional

class AdaptiveStaircase:
    """
    Bayesian-adaptive difficulty selection with 2-up/1-down fallback.
    """

    def __init__(self, config: dict):
        self.initial_level: int = config.get("initial_level", 3)
        self.min_level: int = config.get("min_level", 1)
        self.max_level: int = config.get("max_level", 15)
        self.ability_prior_mean: float = config.get("ability_prior_mean", 5.0)
        self.ability_prior_sd: float = config.get("ability_prior_sd", 3.0)
        self.performance_threshold: float = config.get("performance_threshold", 0.5)
        self.fallback_rule: str = config.get("fallback_rule", "2up1down")
        self.calibration_trials: int = config.get("calibration_trials", 3)
        self.max_trials: int = config.get("max_trials_per_session", 8)
        self.obs_noise_var: float = config.get("observation_noise_variance", 8.0)
        self.max_level_step: int = config.get("max_level_step", 3)
        self.difficulty_scale_exponent: float = config.get("difficulty_scale_exponent", 1.5)

        # State
        self.current_level: int = self.initial_level
        self.n_trials_completed: int = 0
        self.trial_results: list[dict] = []

        # Bayesian state: posterior mean and variance of ability
        self._posterior_mean: float = self.ability_prior_mean
        self._posterior_var: float = self.ability_prior_sd ** 2

        # 2-up/1-down state
        self._consecutive_failures: int = 0
        self._consecutive_successes: int = 0

    def update(self, trial_result: dict) -> int:
        """
        Update ability estimate based on completed trial result.
        Returns the recommended difficulty level for the next trial.

        trial_result must contain:
            - composite_score: float (0.0-1.0)
            - difficulty_level: int
        """
        self.trial_results.append(trial_result)
        self.n_trials_completed += 1

        composite = trial_result.get("composite_score", 0.0)
        level = trial_result.get("difficulty_level", self.current_level)
        success = composite >= self.performance_threshold

        if self.fallback_rule == "bayesian":
            next_level = self._bayesian_update(composite, level, success)
        else:
            next_level = self._twoup_onedown_update(success, level)

        self.current_level = next_level
        return next_level

    def _bayesian_update(self, composite: float, level: int, success: bool) -> int:
        """
        Simple Bayesian update of ability estimate.
        Uses a Gaussian likelihood approximation.
        """
        # Likelihood: if succeeded at level L, ability is probably around L or above
        # Model: ability ~ N(mu, sigma^2), observation: performance ~ N(ability - level, 1)
        # Difficulty-weighted observation: performance at level L demonstrates
        # ability proportional to that level's nonlinear difficulty, not L_max
        exponent = self.difficulty_scale_exponent
        effective_difficulty = (level ** exponent) / (self.max_level ** exponent) * self.max_level
        obs = composite * effective_difficulty

        # Bayesian update (Kalman-like)
        prior_var = self._posterior_var
        prior_mean = self._posterior_mean

        gain = prior_var / (prior_var + self.obs_noise_var)
        self._posterior_mean = prior_mean + gain * (obs - prior_mean)
        self._posterior_var = (1 - gain) * prior_var

        # Select next level: posterior mean ± exploration
        estimated_level = self._posterior_mean
        # Add small exploration: target one level above estimate if uncertain
        target = estimated_level + 0.5 if self._posterior_var > 2.0 else estimated_level
        next_level = round(target)
        # Constrain step size to prevent aggressive level jumping
        next_level = max(self.current_level - self.max_level_step,
                         min(self.current_level + self.max_level_step, next_level))
        return max(self.min_level, min(self.max_level, next_level))

    def _twoup_onedown_update(self, success: bool, level: int) -> int:
        """2-up/1-down staircase: go up after 2 successes, down after 1 failure."""
        if success:
            self._consecutive_failures = 0
            self._consecutive_successes += 1
            if self._consecutive_successes >= 2:
                self._consecutive_successes = 0
                return min(self.max_level, level + 1)
        else:
            self._consecutive_successes = 0
            self._consecutive_failures += 1
            return max(self.min_level, level - 1)
        return level

    def get_ability_estimate(self) -> dict:
        """Return current ability estimate with confidence interval."""
        ci_half = 1.96 * math.sqrt(self._posterior_var)
        return {
            "estimated_level": round(self._posterior_mean, 2),
            "ci_lower": round(max(self.min_level, self._posterior_mean - ci_half), 2),
            "ci_upper": round(min(self.max_level, self._posterior_mean + ci_half), 2),
            "n_trials_completed": self.n_trials_completed,
        }

    def get_current_level(self) -> int:
        return self.current_level
