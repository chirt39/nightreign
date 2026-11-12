"""Rebuild exact-ID deep-relic navigation exceptions from an existing extraction.

No downloads, game unpacking, save-file access or UI changes. Public output only
permits a deep relic to open a unique normal-outside description when its own
deep-outside description is absent. Pool membership is not a drop-rate claim.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r"E:\海斗\outputs\nightreign-data-20261109")
DEFAULT_EVIDENCE = Path(r"E:\海斗\outputs\relic-effect-navigation")
FIELDS = {
    "positive": [f"attachEffectTableId_{i}" for i in range(1, 4)],
    "negative": [f"attachEffectTableId_curse{i}" for i in range(1, 4)],
}


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build(source, output, evidence_dir):
    inputs = set()

    def table(name):
        path = source / "strict/regulation-bin" / f"{name}.param.xml"
        inputs.add(path)
        root = ET.parse(path).getroot()
        defaults = {x.get("name"): x.get("defaultValue") for x in root.find("fields")}
        # Table IDs can repeat: retain every weighted row, including its index.
        return [{**defaults, **x.attrib} for x in root.find("rows")]

    antiques = table("EquipParamAntique")
    raw_pools = table("AttachEffectTableParam")
    effect_rows = table("AttachEffectParam")
    effects = {x["id"]: x for x in effect_rows}
    if len(effects) != len(effect_rows):
        raise ValueError("Duplicate AttachEffectParam IDs require review")
    pools = defaultdict(list)
    for index, row in enumerate(raw_pools):
        base = int(row["chanceWeight"])
        dlc = int(row["chanceWeight_dlc"])
        if dlc < -1:
            raise ValueError("Unknown DLC weight sentinel")
        effective_dlc = base if dlc == -1 else dlc
        if int(row["attachEffectId"]) >= 0 and (base > 0 or effective_dlc > 0):
            pools[row["id"]].append({**row, "sourceIndex": index, "effectiveDlcWeight": effective_dlc})

    names = defaultdict(list)
    for path in sorted((source / "localized/text-bundles").rglob("AttachEffectName*.fmg.xml")):
        if "zhocn" not in path.parts or path.name not in {"AttachEffectName.fmg.xml", "AttachEffectName_dlc01.fmg.xml"}:
            continue
        inputs.add(path)
        for row in ET.parse(path).getroot().find("entries"):
            name = (row.text or "").strip()
            if name and name != "%null%":
                names[row.get("id")].append({"name": name, "file": path.relative_to(source).as_posix()})

    glossary_path = ROOT / "public/effect_encyclopedia.json"
    item_path = ROOT / "public/items_data.json"
    glossary = json.loads(glossary_path.read_text(encoding="utf-8"))
    items = json.loads(item_path.read_text(encoding="utf-8"))["items"]
    descriptions = defaultdict(list)
    for row in glossary["entries"]:
        descriptions[(row["category"], row["id"])].append(row)

    native = {role: defaultdict(list) for role in FIELDS}
    unresolved = []
    deep_rows = [x for x in antiques if x["isDeepRelic"] == "1"]
    raw_table_ids = {x["id"] for x in raw_pools}
    for relic in deep_rows:
        for role, fields in FIELDS.items():
            for field in fields:
                table_id = relic[field]
                if int(table_id) < 0:
                    continue
                if table_id not in raw_table_ids:
                    unresolved.append({"relicId": relic["id"], "field": field, "tableId": table_id})
                    continue
                active = pools[table_id]
                singleton = len({r["attachEffectId"] for r in active}) == 1
                for option in active:
                    effect_id = option["attachEffectId"]
                    effect = effects.get(effect_id)
                    if effect is None or effect["isDebuff"] != ("1" if role == "negative" else "0"):
                        raise ValueError(f"Native pool role/AttachEffectParam mismatch: {effect_id}")
                    native[role][effect_id].append({
                        "relicId": relic["id"], "isDeepRelic": 1, "field": field,
                        "tableId": table_id, "sourceIndex": option["sourceIndex"],
                        "baseWeight": int(option["chanceWeight"]), "dlcWeight": int(option["chanceWeight_dlc"]),
                        "effectiveDlcWeight": option["effectiveDlcWeight"],
                        "singleCandidatePool": singleton, "effectId": effect_id,
                        "attachTextId": effect["attachTextId"], "isDebuff": int(effect["isDebuff"]),
                    })
    if unresolved:
        raise ValueError(f"Unresolved native deep pool references: {unresolved}")

    result = {role: [] for role in FIELDS}
    missing, empty_explanations = [], []
    excluded_matches = []
    for role in FIELDS:
        for effect_id in sorted(native[role], key=int):
            normal = descriptions[("normal-outside", effect_id)]
            deep = descriptions[("deep-outside", effect_id)]
            # Do not use an in-game entry, a same-key entry, or the first duplicate.
            if not deep and len(normal) == 1:
                description_negative = normal[0]["type"].startswith("减益")
                if description_negative == (role == "negative"):
                    result[role].append(int(effect_id))
                else:
                    excluded_matches.append({"id": effect_id, "role": role, "reason": "description-role-mismatch"})
            elif len(normal) > 1 or len(deep) > 1:
                excluded_matches.append({"id": effect_id, "role": role, "reason": "duplicate-description"})
            if not any(x["explanation"].strip() for x in normal + deep):
                text_id = effects[effect_id]["attachTextId"]
                evidence = names.get(text_id, [])
                unique_names = {x["name"] for x in evidence}
                record = {"effect_id": effect_id, "name": next(iter(unique_names)) if len(unique_names) == 1 else "名称待核对",
                                "role": role, "attach_text_id": text_id,
                                "name_sources": json.dumps(evidence, ensure_ascii=False, separators=(",", ":")),
                                "evidence_count": len(native[role][effect_id]),
                                "native_evidence": json.dumps(native[role][effect_id][0], ensure_ascii=False, separators=(",", ":")),
                                "full_evidence": "native-evidence.json#" + role + "/" + effect_id}
                (missing if not normal and not deep else empty_explanations).append(record)

    raw_by_id = {x["id"]: x for x in antiques}
    type_conflicts = [{"itemId": key, "publicType": item["type"], "nativeIsDeepRelic": raw_by_id.get(key, {}).get("isDeepRelic"),
                       "usedForProof": False} for key, item in items.items()
                     if item["type"] == "DeepRelic" and raw_by_id.get(key, {}).get("isDeepRelic") != "1"]
    manifest_path = source / "source-manifest.json"
    inputs.add(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    metadata = {
        "gameVersion": manifest["executable_version"], "regulationVersion": manifest["regulation_version"],
        "rule": "Exact native deep pool ID, split by main/curse field and checked against isDebuff; unique normal-outside only when deep-outside absent.",
        "scope": "Static candidate evidence in this extraction, not arbitrary cross-mode permission or a drop probability.",
        "nativeDeepRows": len(deep_rows), "nativePositiveIds": len(native["positive"]), "nativeNegativeIds": len(native["negative"]),
        "positive": len(result["positive"]), "negative": len(result["negative"]), "genuinelyMissing": len(missing),
        "missingDefinition": "No entry in either outside category; existing entries with blank explanation are reported separately.",
        "knownEntriesWithEmptyExplanation": len(empty_explanations),
        "missingByRole": dict(Counter(x["role"] for x in missing)),
        "singletonPoolEvidenceIds": {role: sorted([key for key, chains in native[role].items() if any(x["singleCandidatePool"] for x in chains)], key=int) for role in FIELDS},
        "sources": [{"file": path.relative_to(source).as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(inputs)],
        "publicSources": [{"file": path.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in [glossary_path, item_path]],
        "glossarySourceCommit": glossary["sourceCommit"], "excludedMatches": excluded_matches,
        "legacyTypeConflicts": type_conflicts,
        "legacyNote": "Public DeepRelic labels with native isDeepRelic=0 do not establish pool membership. No ID rounding or placeholder-table substitution.",
    }
    write_json(output, result)
    write_json(evidence_dir / "native-evidence.json", native)
    write_json(evidence_dir / "summary.json", metadata)
    evidence_dir.mkdir(parents=True, exist_ok=True)
    for filename, records in [("genuinely-missing.csv", missing), ("known-entries-with-empty-explanation.csv", empty_explanations)]:
        with (evidence_dir / filename).open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=["effect_id", "name", "role", "attach_text_id", "name_sources", "evidence_count", "native_evidence", "full_evidence"])
            writer.writeheader()
            writer.writerows(records)
    return result, metadata


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=ROOT / "public/relic_effect_cross_mode.json")
    parser.add_argument("--evidence-dir", type=Path, default=DEFAULT_EVIDENCE)
    args = parser.parse_args()
    _, summary = build(args.source_root, args.output, args.evidence_dir)
    print(json.dumps({key: summary[key] for key in ["nativeDeepRows", "nativePositiveIds", "nativeNegativeIds", "positive", "negative", "genuinelyMissing", "missingByRole"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
