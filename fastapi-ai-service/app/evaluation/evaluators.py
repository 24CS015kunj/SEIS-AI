"""Evaluation pipeline orchestration.

Runs the current pipeline against the golden dataset, computes metrics
via evaluation/metrics.py, and produces a scorecard with a
regression-vs-baseline gate (§24.1, §24.9).
"""
