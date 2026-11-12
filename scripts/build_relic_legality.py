"""Build exact native relic slot evidence; no legacy-ID remapping or save access.

The output describes parameter candidates, not proof of acquisition or runtime
sorting. Unknown relationships are omitted from items, never converted to null.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r"E:\海斗\outputs\nightreign-data-20261109")
FIELDS = {
    "positive": [f"attachEffectTableId_{i}" for i in range(1, 4)],
    "negative": [f"attachEffectTableId_curse{i}" for i in range(1, 4)],
}


def build(source: Path):
    inputs = set()

    def table(name):
        path = source / "strict/regulation-bin" / f"{name}.param.xml"
        inputs.add(path)
        root = ET.parse(path).getroot()
        defaults = {f.get("name"): f.get("defaultValue") for f in root.find("fields")}
        # AttachEffectTableParam repeats IDs: each row is a weighted candidate.
        return [{**defaults, **row.attrib} for row in root.find("rows")]

    antiques = table("EquipParamAntique")
    raw_pools = table("AttachEffectTableParam")
    effect_rows = table("AttachEffectParam")
    native_effects = {int(row["id"]): row for row in effect_rows}
    if len(native_effects) != len(effect_rows):
        raise ValueError("Duplicate effect IDs")
    if len({row["id"] for row in antiques}) != len(antiques):
        raise ValueError("Duplicate antique IDs")

    # Names corroborate item identities; effect-mirror/debug antique rows without
    # an actual AntiqueName must not become ordinary relic templates.
    named = set()
    name_root = source / "localized/text-bundles/data0/msg/engus"
    for path in sorted(name_root.rglob("AntiqueName*.fmg.xml")):
        inputs.add(path)
        named.update(row.get("id") for row in ET.parse(path).getroot().find("entries")
                     if (row.text or "").strip() not in {"", "%null%"})
    if not named:
        raise ValueError("Missing native AntiqueName evidence")

    public_path = ROOT / "public/items_data.json"
    public_items = json.loads(public_path.read_text(encoding="utf-8"))["items"]
    public_relics = {k: v for k, v in public_items.items()
                     if v["type"] in {"Relic", "DeepRelic", "UniqueRelic"}}
    pools = defaultdict(set)
    variants = {"base": defaultdict(set), "dlc": defaultdict(set)}
    pool_exists = {int(row["id"]) for row in raw_pools}
    inactive_rows = 0
    for row in raw_pools:
        pid, eid = int(row["id"]), int(row["attachEffectId"])
        base, override = int(row["chanceWeight"]), int(row["chanceWeight_dlc"])
        if base < 0 or override < -1:
            raise ValueError(f"Unknown weight sentinel: {row}")
        dlc = base if override == -1 else override
        if base == 0 and dlc == 0:
            inactive_rows += 1
            continue
        if eid <= 0:
            raise ValueError(f"Active empty/invalid pool candidate requires review: {row}")
        pools[pid].add(eid)
        for name, weight in [("base", base), ("dlc", dlc)]:
            if weight > 0:
                variants[name][pid].add(eid)

    items, unknown_items, conflicts = {}, {}, []
    for row in antiques:
        key = row["id"]
        if key not in named:
            continue
        if key in public_items and public_items[key]["type"] == "Misc":
            unknown_items[key] = {"reasons": ["not-a-relic-in-public-catalog"]}
            continue
        mode = "deep" if row["isDeepRelic"] == "1" else "normal"
        public = public_relics.get(key)
        if public and (public["type"] == "DeepRelic") != (mode == "deep"):
            conflicts.append({"id": key, "publicType": public["type"], "nativeMode": mode})
        item = {"mode": mode, "color": int(row["relicColor"])}
        reasons = []
        for role, fields in FIELDS.items():
            item[role] = []
            for field in fields:
                pid = int(row[field])
                if pid == -1:
                    item[role].append(None)
                    continue
                item[role].append(pid)
                if pid not in pool_exists:
                    reasons.append(f"{field}:missing-pool:{pid}")
                elif not pools[pid]:
                    reasons.append(f"{field}:no-active-candidate:{pid}")
                elif any(eid not in native_effects for eid in pools[pid]):
                    reasons.append(f"{field}:missing-effect-definition:{pid}")
                elif any((native_effects[eid]["isDebuff"] == "1") != (role == "negative")
                         for eid in pools[pid]):
                    reasons.append(f"{field}:mixed-or-wrong-effect-role:{pid}")
        if reasons:
            unknown_items[key] = {"reasons": reasons}
            continue
        if all(pid is None for pid in item["positive"]):
            unknown_items[key] = {"reasons": ["no-positive-relic-slot"]}
            continue
        if any(n is not None and p is None for p, n in zip(item["positive"], item["negative"])):
            raise ValueError(f"Unpaired native negative slot: {key}")
        if mode == "normal" and any(pid is not None for pid in item["negative"]):
            raise ValueError(f"Unexpected normal negative slot: {key}")
        populated = [pid for role in FIELDS for pid in item[role] if pid is not None]
        fixed = [len(pools[pid]) == 1 for pid in populated]
        item["generation"] = "fixed" if all(fixed) else "mixed" if any(fixed) else "random"
        if item["generation"] == "fixed":
            for role in FIELDS:
                item["preset" + role.title()] = [next(iter(pools[pid])) if pid is not None else None
                                                  for pid in item[role]]
        items[key] = item

    native_ids = {row["id"] for row in antiques}
    for key in public_relics:
        if key not in native_ids:
            unknown_items[key] = {"reasons": ["public-id-absent-from-native-table"]}
        elif key not in named:
            unknown_items[key] = {"reasons": ["no-native-item-name"]}

    used_pools = {pid for item in items.values() for role in FIELDS
                  for pid in item[role] if pid is not None}
    used_effects = {eid for pid in used_pools for eid in pools[pid]}
    paired = defaultdict(set)
    for item in items.values():
        if item["mode"] != "deep" or item["generation"] == "fixed":
            continue
        for pid, curse in zip(item["positive"], item["negative"]):
            if pid is not None:
                for eid in pools[pid]:
                    paired[eid].add(curse is not None)
    effects = {}
    for eid in sorted(used_effects):
        row = native_effects[eid]
        effect = {"negative": row["isDebuff"] == "1",
                  "compatibilityId": int(row["compatibilityId"]),
                  "exclusivityId": int(row["exclusivityId"])}
        if eid in paired:
            effect["requiresNegativeInRandomDeep"] = next(iter(paired[eid])) if len(paired[eid]) == 1 else None
        effects[str(eid)] = effect

    differences = {}
    for pid in sorted(used_pools):
        base_only = variants["base"][pid] - variants["dlc"][pid]
        dlc_only = variants["dlc"][pid] - variants["base"][pid]
        if base_only or dlc_only:
            differences[str(pid)] = {"baseOnly": sorted(base_only), "dlcOnly": sorted(dlc_only)}
    manifest_path = source / "source-manifest.json"
    inputs.add(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    result = {
        "version": "native-" + manifest["regulation_version"] + "-v1",
        "items": dict(sorted(items.items(), key=lambda pair: int(pair[0]))),
        "pools": {str(pid): sorted(pools[pid]) for pid in sorted(used_pools)},
        "effects": effects,
        "poolVariantDifferences": differences,
        "unknownItems": dict(sorted(unknown_items.items(), key=lambda pair: int(pair[0]))),
        "metadata": {
            "gameVersion": manifest["executable_version"],
            "regulationVersion": manifest["regulation_version"],
            "poolPolicy": "union-of-positive-base-and-effective-dlc-weights",
            "dlcWeightSentinel": -1,
            "nullPolicy": "native-slot-field-equals-minus-one-only",
            "compatibilityScope": "same-random-relic; nonnegative group IDs; not across equipped relics",
            "exclusivityScope": "equipped-relic duplicate warning; not a generation ban or stacking proof",
            "unknown": ["runtime-roll-and-save-order", "fourth-save-slot-semantics",
                        "unknown_0-pool-field", "acquisition-and-drop-probabilities",
                        "legacy-item-id-aliases", "runtime-stacking"],
            "legacyModeConflicts": conflicts,
            "counts": {"nativeItems": len(antiques), "namedNativeItems": sum(row["id"] in named for row in antiques),
                       "omittedUnnamedNativeItems": sum(row["id"] not in named for row in antiques),
                       "items": len(items), "deepItems": sum(x["mode"] == "deep" for x in items.values()),
                       "generation": dict(Counter(x["generation"] for x in items.values())),
                       "pools": len(used_pools), "effects": len(effects),
                       "inactivePoolRowsExcluded": inactive_rows},
            "sources": [{"file": path.relative_to(source).as_posix(),
                         "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(inputs)],
            "publicCatalog": {"file": "public/items_data.json",
                              "sha256": hashlib.sha256(public_path.read_bytes()).hexdigest(),
                              "usage": "cross-check only; never an ID alias"},
            "sourceRights": "Derived from user-provided local game extraction; game data rights remain with their owners.",
        },
    }
    return result


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=ROOT / "src/data/relic-legality.json")
    parser.add_argument("--check", action="store_true", help="Compare generated data without writing")
    args = parser.parse_args()
    data = build(args.source_root)
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if args.output.read_text(encoding="utf-8") != encoded:
            raise SystemExit("Relic legality data differs from native sources")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    print(json.dumps(data["metadata"]["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
