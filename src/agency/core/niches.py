"""Loaders for config/niches.yaml and config/offers.yaml. Never hard-code niches or prices."""

from __future__ import annotations

from typing import Any

import yaml

from agency.config import ROOT


def _load(name: str) -> dict[str, Any]:
    return yaml.safe_load((ROOT / "config" / name).read_text()) or {}


def niches() -> dict[str, Any]:
    return _load("niches.yaml")


def offers() -> list[dict[str, Any]]:
    return _load("offers.yaml").get("offers", [])
