"""
Sample Size & Power
Deterministic sample-size calculations. No language model is involved in any number produced here.
Normal quantiles come from Python's statistics.NormalDist (Wichura AS241 algorithm). Each method is
checked against published reference values in tests/test_sample_size.py.
"""

import math
from statistics import NormalDist

METHOD_VERSION = "sample-size/1.0.0"
DISCLAIMER = ("Planning estimate only. Results depend entirely on the stated assumptions and must be reviewed "
              "by a qualified statistician before use in a protocol or statistical analysis plan.")

_N = NormalDist()


class SampleSizeError(ValueError):
    """Invalid inputs or an unsupported design. The message is shown to the user."""


def z(p: float) -> float:
    return _N.inv_cdf(p)


# ─── Method catalogue ────────────────────────────────────────────────

METHODS = {
    "two_means": {
        "name": "Two independent means (parallel groups)",
        "endpoint_type": "continuous", "design": "parallel",
        "formula": "n₁ = (1 + 1/k) · σ² · (z₁₋α/s + z₁₋β)² / Δ²  + z₁₋α/s² / (2(1+k)),  n₂ = k · n₁",
        "reference": "Normal approximation with Guenther (1981) t-distribution correction; matches G*Power two-sample t-test.",
        "test": "Two-sample t-test",
        "justification": "Default for a continuous endpoint compared between two independent parallel groups with an approximately normal distribution.",
        "required": ["delta", "sd"],
    },
    "one_mean": {
        "name": "One mean / paired differences",
        "endpoint_type": "continuous", "design": "single_arm",
        "formula": "n = (z₁₋α/s + z₁₋β)² · σ² / Δ² + z₁₋α/s² / 2",
        "reference": "Normal approximation with Guenther (1981) correction; matches G*Power one-sample t-test.",
        "test": "One-sample or paired t-test",
        "justification": "Default for a continuous endpoint in a single group, or for within-subject paired differences.",
        "required": ["delta", "sd"],
    },
    "two_proportions": {
        "name": "Two independent proportions (parallel groups)",
        "endpoint_type": "binary", "design": "parallel",
        "formula": "n₁ = [z₁₋α/s·√(p̄q̄(1+1/k)) + z₁₋β·√(p₁q₁ + p₂q₂/k)]² / (p₁ − p₂)²,  p̄ = (p₁ + k·p₂)/(1+k); "
                   "optional continuity correction n₁′ = n₁/4 · (1 + √(1 + 2(k+1)/(k·n₁·|p₁−p₂|)))²",
        "reference": "Fleiss, Levin & Paik (2003) pooled-variance method; continuity correction per Fleiss, Tytun & Ury (1980).",
        "test": "Two-sample z-test for proportions (chi-square equivalent)",
        "justification": "Default for a binary endpoint compared between two independent groups with adequate expected counts.",
        "required": ["p1", "p2"],
    },
    "time_to_event": {
        "name": "Time-to-event, log-rank test (parallel groups)",
        "endpoint_type": "time_to_event", "design": "parallel",
        "formula": "D = (z₁₋α/s + z₁₋β)² · (1+k)² / (k · (ln HR)²);  N = D / P(event)",
        "reference": "Schoenfeld (1983) required number of events.",
        "test": "Log-rank test",
        "justification": "Default for a time-to-event endpoint under proportional hazards in two parallel groups.",
        "required": ["hazard_ratio", "event_probability"],
    },
}

SUPPORTED = {(m["endpoint_type"], m["design"]): mid for mid, m in METHODS.items()}

UNSUPPORTED_DESIGNS = {
    "crossover": "Crossover designs need within-subject correlation and period effects; not supported by this calculator.",
    "cluster": "Cluster-randomised designs need an intra-cluster correlation (design effect); not supported.",
    "multi_arm": "Designs with more than two arms need multiplicity adjustment; not supported.",
    "adaptive": "Adaptive / group-sequential designs need boundary calculations; not supported.",
    "factorial": "Factorial designs are not supported.",
}


def select_method(endpoint_type: str, design: str) -> str:
    if design in UNSUPPORTED_DESIGNS:
        raise SampleSizeError(UNSUPPORTED_DESIGNS[design])
    mid = SUPPORTED.get((endpoint_type, design))
    if not mid:
        raise SampleSizeError(
            f"No validated method for a {endpoint_type.replace('_', '-')} endpoint with a {design.replace('_', ' ')} design. "
            "Supported: continuous (parallel or single-arm/paired), binary (parallel), time-to-event (parallel).")
    return mid


# ─── Validation ──────────────────────────────────────────────────────

def _num(inputs: dict, key: str, label: str, lo: float | None = None, hi: float | None = None,
         lo_open: bool = True, hi_open: bool = True, required: bool = True, default=None) -> float | None:
    v = inputs.get(key, default)
    if v is None or v == "":
        if required:
            raise SampleSizeError(f"{label} is required.")
        return default
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise SampleSizeError(f"{label} must be a number.")
    if not math.isfinite(v):
        raise SampleSizeError(f"{label} must be a finite number.")
    if lo is not None and (v <= lo if lo_open else v < lo):
        raise SampleSizeError(f"{label} must be {'greater than' if lo_open else 'at least'} {lo}.")
    if hi is not None and (v >= hi if hi_open else v > hi):
        raise SampleSizeError(f"{label} must be {'less than' if hi_open else 'at most'} {hi}.")
    return v


def _ratio(inputs: dict) -> tuple[int, int]:
    raw = inputs.get("allocation_ratio", "1:1")
    try:
        a, b = (int(str(x).strip()) for x in str(raw).split(":"))
    except Exception:
        raise SampleSizeError("Allocation ratio must look like '1:1' or '2:1' (whole numbers).")
    if not (1 <= a <= 10 and 1 <= b <= 10):
        raise SampleSizeError("Allocation ratio parts must be whole numbers between 1 and 10.")
    return a, b


def normalize_inputs(inputs: dict) -> dict:
    endpoint_type = inputs.get("endpoint_type")
    design = inputs.get("design", "parallel")
    if endpoint_type not in ("continuous", "binary", "time_to_event"):
        raise SampleSizeError("Endpoint type must be continuous, binary or time_to_event.")
    method = select_method(endpoint_type, design)
    hypothesis = inputs.get("hypothesis", "superiority")
    if hypothesis not in ("superiority", "non_inferiority"):
        raise SampleSizeError("Hypothesis must be superiority or non_inferiority (equivalence is not supported).")
    if hypothesis == "non_inferiority" and method == "time_to_event":
        raise SampleSizeError("Non-inferiority for time-to-event endpoints is not supported.")
    sided = int(_num(inputs, "sided", "Sidedness", required=False, default=2))
    if sided not in (1, 2):
        raise SampleSizeError("Sidedness must be 1 (one-sided) or 2 (two-sided).")
    if hypothesis == "non_inferiority" and sided != 1:
        raise SampleSizeError("Non-inferiority tests are one-sided; set sidedness to 1 (commonly alpha = 0.025).")

    out = {
        "endpoint_type": endpoint_type, "design": design, "method": method, "hypothesis": hypothesis,
        "sided": sided,
        "alpha": _num(inputs, "alpha", "Significance level (alpha)", 0, 0.2, hi_open=False),
        "power": _num(inputs, "power", "Power", 0.5, 0.99, lo_open=False, hi_open=False),
        "dropout": _num(inputs, "dropout", "Dropout / non-evaluable rate", 0, 0.5, lo_open=False, required=False, default=0.0),
        "primary_endpoint": str(inputs.get("primary_endpoint") or "")[:500],
        "units": str(inputs.get("units") or "")[:50],
        "continuity_correction": bool(inputs.get("continuity_correction", False)),
    }
    if design == "parallel":
        out["allocation_ratio"] = "%d:%d" % _ratio(inputs)
    if hypothesis == "non_inferiority":
        out["margin"] = _num(inputs, "margin", "Non-inferiority margin", 0)
    if method in ("two_means", "one_mean"):
        out["sd"] = _num(inputs, "sd", "Standard deviation", 0)
        out["delta"] = _num(inputs, "delta", "Expected difference (effect size)",
                            required=True) if hypothesis == "superiority" else _num(inputs, "delta", "Expected difference", required=False, default=0.0)
        if hypothesis == "superiority" and out["delta"] == 0:
            raise SampleSizeError("Expected difference must not be zero for a superiority test.")
    elif method == "two_proportions":
        out["p1"] = _num(inputs, "p1", "Proportion in group 1 (experimental)", 0, 1)
        out["p2"] = _num(inputs, "p2", "Proportion in group 2 (control)", 0, 1)
        if hypothesis == "superiority" and out["p1"] == out["p2"]:
            raise SampleSizeError("The two proportions must differ for a superiority test.")
    elif method == "time_to_event":
        out["hazard_ratio"] = _num(inputs, "hazard_ratio", "Hazard ratio", 0)
        if abs(out["hazard_ratio"] - 1) < 1e-9:
            raise SampleSizeError("Hazard ratio must differ from 1.")
        out["event_probability"] = _num(inputs, "event_probability", "Probability of observing an event", 0, 1, hi_open=False)
    return out


# ─── Core formulas (return unrounded evaluable sizes) ────────────────

def _z_terms(p: dict) -> tuple[float, float]:
    return z(1 - p["alpha"] / p["sided"]), z(p["power"])


def _k(p: dict) -> float:
    a, b = (int(x) for x in p.get("allocation_ratio", "1:1").split(":"))
    return b / a


def raw_sizes(p: dict) -> dict:
    za, zb = _z_terms(p)
    m = p["method"]
    if m == "two_means":
        k = _k(p)
        delta = abs(p["delta"]) if p["hypothesis"] == "superiority" else p["delta"] + p["margin"]
        if delta <= 0:
            raise SampleSizeError("Expected difference plus margin must be positive for non-inferiority.")
        n1 = (1 + 1 / k) * p["sd"] ** 2 * (za + zb) ** 2 / delta ** 2 + za ** 2 / (2 * (1 + k))
        return {"n1": n1, "n2": k * n1}
    if m == "one_mean":
        delta = abs(p["delta"]) if p["hypothesis"] == "superiority" else p["delta"] + p["margin"]
        if delta <= 0:
            raise SampleSizeError("Expected difference plus margin must be positive for non-inferiority.")
        return {"n": (za + zb) ** 2 * p["sd"] ** 2 / delta ** 2 + za ** 2 / 2}
    if m == "two_proportions":
        k = _k(p)
        p1, p2 = p["p1"], p["p2"]
        q1, q2 = 1 - p1, 1 - p2
        if p["hypothesis"] == "superiority":
            d = abs(p1 - p2)
            pbar = (p1 + k * p2) / (1 + k)
            n1 = (za * math.sqrt(pbar * (1 - pbar) * (1 + 1 / k)) + zb * math.sqrt(p1 * q1 + p2 * q2 / k)) ** 2 / d ** 2
            if p["continuity_correction"]:
                n1 = n1 / 4 * (1 + math.sqrt(1 + 2 * (k + 1) / (k * n1 * d))) ** 2
        else:
            d = (p1 - p2) + p["margin"]
            if d <= 0:
                raise SampleSizeError("Expected difference plus margin must be positive for non-inferiority.")
            n1 = (za + zb) ** 2 * (p1 * q1 + p2 * q2 / k) / d ** 2
        return {"n1": n1, "n2": k * n1}
    if m == "time_to_event":
        k = _k(p)
        events = (za + zb) ** 2 * (1 + k) ** 2 / (k * math.log(p["hazard_ratio"]) ** 2)
        total = events / p["event_probability"]
        return {"events": events, "n1": total / (1 + k), "n2": total * k / (1 + k)}
    raise SampleSizeError("Unknown method")


def _allocate(n1: float, n2: float, ratio: str) -> tuple[int, int]:
    """Smallest whole-number allocation that keeps the exact ratio and meets both arm requirements."""
    a, b = (int(x) for x in ratio.split(":"))
    m = max(math.ceil(n1 / a - 1e-9), math.ceil(n2 / b - 1e-9))
    return a * m, b * m


def sizes(p: dict) -> dict:
    raw = raw_sizes(p)
    r = p["dropout"]
    if "n" in raw:
        n_eval = math.ceil(raw["n"] - 1e-9)
        n_enroll = math.ceil(n_eval / (1 - r) - 1e-9)
        return {"raw": raw, "evaluable": {"per_arm": [n_eval], "total": n_eval},
                "enrollment": {"per_arm": [n_enroll], "total": n_enroll}}
    e1, e2 = _allocate(raw["n1"], raw["n2"], p["allocation_ratio"])
    n1, n2 = _allocate(e1 / (1 - r), e2 / (1 - r), p["allocation_ratio"])
    out = {"raw": raw, "evaluable": {"per_arm": [e1, e2], "total": e1 + e2},
           "enrollment": {"per_arm": [n1, n2], "total": n1 + n2}}
    if "events" in raw:
        out["events"] = math.ceil(raw["events"] - 1e-9)
    return out


# ─── Sensitivity ─────────────────────────────────────────────────────

def _variants(p: dict) -> list[tuple[str, str, dict]]:
    v = []
    m = p["method"]
    if m in ("two_means", "one_mean"):
        for f in (0.8, 0.9, 1.1, 1.2):
            if p["hypothesis"] == "superiority":
                v.append(("Effect size (Δ)", f"{p['delta'] * f:g} (×{f})", {**p, "delta": p["delta"] * f}))
        for f in (0.9, 1.1, 1.25):
            v.append(("Standard deviation (σ)", f"{p['sd'] * f:g} (×{f})", {**p, "sd": p["sd"] * f}))
    elif m == "two_proportions":
        for dp in (-0.05, 0.05):
            p2 = round(p["p2"] + dp, 4)
            if 0 < p2 < 1 and p2 != p["p1"]:
                v.append(("Control proportion (p₂)", f"{p2:g}", {**p, "p2": p2}))
        for dp in (-0.05, 0.05):
            p1 = round(p["p1"] + dp, 4)
            if 0 < p1 < 1 and p1 != p["p2"]:
                v.append(("Experimental proportion (p₁)", f"{p1:g}", {**p, "p1": p1}))
    elif m == "time_to_event":
        for hr in (0.6, 0.65, 0.7, 0.75, 0.8) if p["hazard_ratio"] < 1 else (1.25, 1.33, 1.5, 1.75):
            if abs(hr - p["hazard_ratio"]) > 1e-9:
                v.append(("Hazard ratio", f"{hr:g}", {**p, "hazard_ratio": hr}))
        for ep in (0.5, 0.6, 0.7, 0.8):
            if abs(ep - p["event_probability"]) > 1e-9:
                v.append(("Event probability", f"{ep:g}", {**p, "event_probability": ep}))
    for pw in (0.8, 0.85, 0.9, 0.95):
        if abs(pw - p["power"]) > 1e-9:
            v.append(("Power", f"{pw:g}", {**p, "power": pw}))
    for d in (0.0, 0.1, 0.15, 0.2, 0.3):
        if abs(d - p["dropout"]) > 1e-9:
            v.append(("Dropout rate", f"{d:.0%}", {**p, "dropout": d}))
    return v


def sensitivity(p: dict) -> list[dict]:
    rows = []
    for param, label, variant in _variants(p):
        try:
            s = sizes(variant)
            rows.append({"parameter": param, "value": label, "evaluable_total": s["evaluable"]["total"],
                         "enrollment_total": s["enrollment"]["total"], "events": s.get("events")})
        except SampleSizeError as e:
            rows.append({"parameter": param, "value": label, "error": str(e)})
    return rows


# ─── Public entry point ──────────────────────────────────────────────

def calculate(inputs: dict) -> dict:
    p = normalize_inputs(inputs)
    s = sizes(p)
    meta = METHODS[p["method"]]
    za, zb = _z_terms(p)
    arms = ["Group 1 (experimental)", "Group 2 (control)"] if p["design"] == "parallel" else ["Single group"]
    assumptions = [
        f"Significance level α = {p['alpha']:g} ({'one' if p['sided'] == 1 else 'two'}-sided); z = {za:.4f}",
        f"Power 1 − β = {p['power']:g}; z = {zb:.4f}",
        f"Expected dropout / non-evaluable rate r = {p['dropout']:.1%}",
    ]
    if p["design"] == "parallel":
        assumptions.append(f"Allocation ratio (group 1 : group 2) = {p['allocation_ratio']}")
    for key, label in (("delta", "Expected difference Δ"), ("sd", "Standard deviation σ"), ("p1", "Proportion p₁"),
                       ("p2", "Proportion p₂"), ("hazard_ratio", "Hazard ratio"), ("event_probability", "P(event) over follow-up"),
                       ("margin", "Non-inferiority margin")):
        if key in p:
            unit = f" {p['units']}" if p.get("units") and key in ("delta", "sd", "margin") and p["method"] != "two_proportions" else ""
            assumptions.append(f"{label} = {p[key]:g}{unit}")
    limitations = [
        "Assumes the stated effect size, variability and event rates are correct; these are the main source of uncertainty.",
        "Does not account for interim analyses, multiplicity, stratification or covariate adjustment.",
    ]
    if p["method"] in ("two_means", "one_mean"):
        limitations.append("Assumes approximately normally distributed outcomes with a common standard deviation.")
    if p["method"] == "two_proportions":
        limitations.append("Large-sample normal approximation; for proportions near 0 or 1 or small samples consider exact methods.")
    if p["method"] == "time_to_event":
        limitations.append("Assumes proportional hazards; P(event) must reflect accrual, follow-up and censoring assumptions.")
    warnings = []
    if p["dropout"] > 0.3:
        warnings.append("Dropout above 30% materially affects validity beyond sample size; consider design mitigations.")
    if p["alpha"] > 0.05:
        warnings.append("Alpha above 0.05 is unusual for confirmatory trials.")
    if p["power"] < 0.8:
        warnings.append("Power below 80% is generally considered inadequate for confirmatory trials.")

    rounding = ("Evaluable size per arm is rounded up to the smallest whole-number allocation that preserves the exact "
                "allocation ratio. Enrollment per arm = ceil(N_evaluable / (1 − r)), again rounded to preserve the ratio.")
    if p["design"] != "parallel":
        rounding = "Evaluable size is rounded up to a whole participant. Enrollment = ceil(N_evaluable / (1 − r))."

    return {
        "method_id": p["method"],
        "method_name": meta["name"],
        "statistical_test": meta["test"],
        "test_justification": meta["justification"],
        "method_version": METHOD_VERSION,
        "formula": meta["formula"],
        "attrition_formula": "N_enroll = ⌈ N_evaluable / (1 − r) ⌉",
        "reference": meta["reference"],
        "inputs": p,
        "arms": arms,
        "raw": {k: round(v, 4) for k, v in s["raw"].items()},
        "evaluable": s["evaluable"],
        "enrollment": s["enrollment"],
        "events": s.get("events"),
        "rounding": rounding,
        "assumptions": assumptions,
        "limitations": limitations,
        "warnings": warnings,
        "sensitivity": sensitivity(p),
        "disclaimer": DISCLAIMER,
    }
