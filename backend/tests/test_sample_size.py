"""
Sample Size & Power — checked against independently published reference values.

References:
- G*Power 3.1 (Faul et al. 2007), two-sample t-test, α=0.05 two-sided, power 0.80:
  d=0.2 → 394/group, d=0.5 → 64/group, d=0.8 → 26/group; one-sample t-test d=0.5 → 34.
- Fleiss, Levin & Paik (2003): p1=0.60 vs p2=0.80, α=0.05 two-sided, power 0.80 → 82/group
  without continuity correction, 91/group with correction (Fleiss, Tytun & Ury 1980).
- Schoenfeld (1983): HR=0.5, α=0.05 two-sided, power 0.80 → 66 events;
  HR=0.75, power 0.90 → 508 events.
"""

import pytest

from services.sample_size import SampleSizeError, calculate, z

BASE = {"alpha": 0.05, "power": 0.8, "sided": 2}


def test_normal_quantiles():
    assert z(0.975) == pytest.approx(1.959964, abs=1e-6)
    assert z(0.8) == pytest.approx(0.841621, abs=1e-6)
    assert z(0.9) == pytest.approx(1.281552, abs=1e-6)


@pytest.mark.parametrize("d,expected", [(0.2, 394), (0.5, 64), (0.8, 26)])
def test_two_means_matches_gpower(d, expected):
    r = calculate({**BASE, "endpoint_type": "continuous", "delta": d, "sd": 1})
    assert r["evaluable"]["per_arm"] == [expected, expected]
    assert r["evaluable"]["total"] == 2 * expected


def test_two_means_scales_with_units():
    # Same standardised effect in raw units: delta 5 mmHg, SD 10 mmHg ≡ d = 0.5
    r = calculate({**BASE, "endpoint_type": "continuous", "delta": 5, "sd": 10, "units": "mmHg"})
    assert r["evaluable"]["per_arm"] == [64, 64]
    assert any("mmHg" in a for a in r["assumptions"])


def test_one_mean_matches_gpower():
    r = calculate({**BASE, "endpoint_type": "continuous", "design": "single_arm", "delta": 0.5, "sd": 1})
    assert r["evaluable"]["total"] == 34


def test_two_proportions_fleiss():
    r = calculate({**BASE, "endpoint_type": "binary", "p1": 0.6, "p2": 0.8})
    assert r["evaluable"]["per_arm"] == [82, 82]
    r_cc = calculate({**BASE, "endpoint_type": "binary", "p1": 0.6, "p2": 0.8, "continuity_correction": True})
    assert r_cc["evaluable"]["per_arm"] == [91, 91]


@pytest.mark.parametrize("hr,power,events", [(0.5, 0.8, 66), (0.75, 0.9, 508)])
def test_logrank_events_schoenfeld(hr, power, events):
    r = calculate({**BASE, "power": power, "endpoint_type": "time_to_event", "hazard_ratio": hr, "event_probability": 1.0})
    assert r["events"] == events


def test_time_to_event_total_from_event_probability():
    r = calculate({**BASE, "endpoint_type": "time_to_event", "hazard_ratio": 0.5, "event_probability": 0.5})
    assert r["events"] == 66
    # 65.35 events / 0.5 = 130.7 participants → 66 per arm with 1:1 allocation
    assert r["evaluable"]["per_arm"] == [66, 66]


def test_dropout_adjustment_and_rounding():
    r = calculate({**BASE, "endpoint_type": "continuous", "delta": 0.5, "sd": 1, "dropout": 0.1})
    # 64 / (1 - 0.10) = 71.1 → 72 per arm
    assert r["evaluable"]["per_arm"] == [64, 64]
    assert r["enrollment"]["per_arm"] == [72, 72]
    assert r["enrollment"]["total"] == 144
    assert "1 − r" in r["attrition_formula"]


def test_allocation_ratio_is_preserved_exactly():
    r = calculate({**BASE, "endpoint_type": "continuous", "delta": 0.5, "sd": 1, "allocation_ratio": "1:2", "dropout": 0.15})
    e1, e2 = r["evaluable"]["per_arm"]
    n1, n2 = r["enrollment"]["per_arm"]
    assert e2 == 2 * e1 and n2 == 2 * n1
    assert e1 == 48 and e2 == 96  # G*Power, N2/N1 = 2
    assert n1 >= e1 / 0.85 and n2 >= e2 / 0.85
    # Unequal allocation needs more participants overall than 1:1
    assert r["evaluable"]["total"] > 128


def test_non_inferiority_requires_one_sided():
    with pytest.raises(SampleSizeError, match="one-sided"):
        calculate({**BASE, "endpoint_type": "binary", "p1": 0.85, "p2": 0.85, "hypothesis": "non_inferiority", "margin": 0.1})
    r = calculate({"alpha": 0.025, "power": 0.8, "sided": 1, "endpoint_type": "binary", "p1": 0.85, "p2": 0.85,
                   "hypothesis": "non_inferiority", "margin": 0.1})
    # (1.95996 + 0.84162)^2 · (2 · 0.85 · 0.15) / 0.1^2 = 200.1 → 201
    assert r["evaluable"]["per_arm"] == [201, 201]


@pytest.mark.parametrize("inputs,message", [
    ({"endpoint_type": "continuous", "delta": 0.5, "sd": 1, "alpha": 0, "power": 0.8}, "alpha"),
    ({"endpoint_type": "continuous", "delta": 0.5, "sd": 1, "alpha": 0.05, "power": 1.2}, "Power"),
    ({"endpoint_type": "continuous", "delta": 0.5, "sd": 0, "alpha": 0.05, "power": 0.8}, "Standard deviation"),
    ({"endpoint_type": "continuous", "delta": 0, "sd": 1, "alpha": 0.05, "power": 0.8}, "must not be zero"),
    ({"endpoint_type": "continuous", "delta": "abc", "sd": 1, "alpha": 0.05, "power": 0.8}, "number"),
    ({"endpoint_type": "binary", "p1": 0.5, "p2": 0.5, "alpha": 0.05, "power": 0.8}, "must differ"),
    ({"endpoint_type": "binary", "p1": 1.2, "p2": 0.5, "alpha": 0.05, "power": 0.8}, "Proportion"),
    ({"endpoint_type": "time_to_event", "hazard_ratio": 1, "event_probability": 0.5, "alpha": 0.05, "power": 0.8}, "differ from 1"),
    ({"endpoint_type": "continuous", "delta": 0.5, "sd": 1, "alpha": 0.05, "power": 0.8, "dropout": 0.6}, "Dropout"),
    ({"endpoint_type": "continuous", "delta": 0.5, "sd": 1, "alpha": 0.05, "power": 0.8, "allocation_ratio": "1:0"}, "Allocation"),
    ({"endpoint_type": "continuous", "design": "crossover", "delta": 0.5, "sd": 1, "alpha": 0.05, "power": 0.8}, "Crossover"),
    ({"endpoint_type": "continuous", "design": "cluster", "delta": 0.5, "sd": 1, "alpha": 0.05, "power": 0.8}, "Cluster"),
    ({"endpoint_type": "binary", "design": "single_arm", "p1": 0.3, "p2": 0.2, "alpha": 0.05, "power": 0.8}, "No validated method"),
    ({"endpoint_type": "ordinal", "alpha": 0.05, "power": 0.8}, "Endpoint type"),
])
def test_invalid_inputs_and_unsupported_designs(inputs, message):
    with pytest.raises(SampleSizeError, match=message):
        calculate(inputs)


def test_output_documents_method_assumptions_and_sensitivity():
    r = calculate({**BASE, "endpoint_type": "binary", "p1": 0.6, "p2": 0.8, "dropout": 0.1})
    assert r["method_version"].startswith("sample-size/")
    assert "Fleiss" in r["reference"] and r["formula"]
    assert "Planning estimate" in r["disclaimer"]
    params = {row["parameter"] for row in r["sensitivity"]}
    assert {"Power", "Dropout rate", "Control proportion (p₂)"} <= params
    # Higher power always needs at least as many participants
    p90 = next(x for x in r["sensitivity"] if x["parameter"] == "Power" and x["value"] == "0.9")
    assert p90["evaluable_total"] > r["evaluable"]["total"]


def test_results_are_deterministic():
    inputs = {**BASE, "endpoint_type": "time_to_event", "hazard_ratio": 0.7, "event_probability": 0.6, "dropout": 0.05}
    assert calculate(inputs) == calculate(inputs)
