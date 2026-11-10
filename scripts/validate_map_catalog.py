#!/usr/bin/env python3
"""Validate native map joins, identity overrides, coverage and filter examples."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from build_map_catalog import ASSET_MANIFEST, OVERRIDES, OUTPUT, SOURCE, param, sha256


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=OUTPUT)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--reference", type=Path, help="Optional Artimuz-derived evidence snapshot outside the repository")
    parser.add_argument("--report", type=Path, help="Write a machine-readable validation report")
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    assert catalog["schemaVersion"] == 1
    assert catalog["provenance"]["identityOverridesSha256"] == sha256(OVERRIDES)
    assert catalog["provenance"]["sourceManifestSha256"] == sha256(args.source / "source-manifest.json")
    asset_manifest = json.loads(ASSET_MANIFEST.read_text(encoding="utf-8")) if ASSET_MANIFEST.exists() else {}
    assert catalog["provenance"]["assetManifestSha256"] == (sha256(ASSET_MANIFEST) if ASSET_MANIFEST.exists() else None)
    calibrated_terrains = {
        terrain_id for terrain_id, row in asset_manifest.get("terrains", {}).items()
        if terrain_id.isdigit() and row.get("status") == "verified" and row.get("coordinateTransform")
    }

    patterns = catalog["patterns"]
    by_id = {str(row["patternId"]): row for row in patterns}
    assert len(by_id) == len(patterns) == 520
    _, flags = param(args.source, "LotResultMapPatternFlag")
    _, plays = param(args.source, "LotResultPlayAreaParam")
    _, smalls = param(args.source, "LotResultSmallBaseAndSpot")
    native_flags: dict[str, list[dict[str, str]]] = defaultdict(list)
    native_smalls: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in flags:
        native_flags[row["patternId"]].append(row)
    for row in smalls:
        native_smalls[row["patternId"]].append(row)
    native_plays = {row["patternId"]: row for row in plays}
    assert set(by_id) == set(native_flags) == set(native_plays) == set(native_smalls)

    point_count = 0
    category_count = 0
    field_boss_count = 0
    event_count = 0
    for pid, pattern in by_id.items():
        flag = native_flags[pid]
        target = {r["targetBoss"] for r in flag}
        terrain = {r["rareMap"] for r in flag}
        assert len(target) == len(terrain) == 1
        assert pattern["nightlord"]["menuRowId"] == next(iter(target))
        assert pattern["terrain"]["value"] == next(iter(terrain))
        assert pattern["dayBosses"]["day1"]["sourceId"] == native_plays[pid]["bossId1"]
        assert pattern["dayBosses"]["day2"]["sourceId"] == native_plays[pid]["bossId2"]
        assert pattern["nightlord"]["form"] == "unknown"
        assert pattern["eligibility"]["depths"]["state"] == "unknown"
        assert pattern["eligibility"]["allPlayersHaveDlc"]["required"] == (next(iter(target)) in {"8", "9"} or next(iter(terrain)) == "4" or any(r["eventFlag"] == "8081" for r in flag))

        raw_points = native_smalls[pid]
        points = pattern["points"]
        assert len(points) == len(raw_points)
        native_by_attach = {r["attachId"]: r for r in raw_points}
        assert len(native_by_attach) == len(raw_points) == len({p["attachId"] for p in points})
        for point in points:
            point_count += 1
            assert point["normalized"] is None or (0 <= point["normalized"]["x"] <= 1 and 0 <= point["normalized"]["y"] <= 1)
            if pattern["terrain"]["value"] not in calibrated_terrains:
                assert point["normalized"] is None
            if point["normalized"] is not None:
                transform = asset_manifest["terrains"][pattern["terrain"]["value"]]["coordinateTransform"]
                world = point["world"]
                assert world["areaNo"] == transform["areaNo"]
                px, py = transform["pixelX"], transform["pixelY"]
                expected_x = round((world["gridXNo"] * px["gridXNo"] + world["posX"] * px["posX"] + px["constant"]) / transform["width"], 7)
                expected_y = round((world["gridZNo"] * py["gridZNo"] + world["posZ"] * py["posZ"] + py["constant"]) / transform["height"], 7)
                assert point["normalized"] == {"x": expected_x, "y": expected_y}
            assert point["coverage"]["monster"] == point["coverage"]["event"] == "unknown"
            raw = native_by_attach[point["attachId"]]["smallBaseMapId"]
            assert point["coverage"]["primarySmallBaseBoss"] == ("known" if raw in overrides["verifiedFieldBossMapIds"] else "unknown")
            assert any(f.get("sourceId") == f"smallBaseMap:{raw}" for f in point["features"])
            for feature in point["features"]:
                if feature.get("sourceId", "").startswith("buildingCategory:"):
                    category_count += 1
                    assert feature["sourceId"] in catalog["definitions"]["features"]
                if feature.get("sourceId", "").startswith("fieldBoss:"):
                    field_boss_count += 1
                    assert feature["sourceId"] in catalog["definitions"]["features"]
        if pattern["events"]["state"] == "known":
            event_count += 1
            assert len(pattern["events"]["values"]) == 1
            assert pattern["events"]["values"][0]["sourceId"] in catalog["definitions"]["events"]
        else:
            assert pattern["events"] == {"state": "known_absent", "values": []}

    assert point_count == 23830
    assert field_boss_count == 348
    assert event_count == 251
    assert len(catalog["definitions"]["nightlords"]) == 10
    assert len(catalog["definitions"]["bosses"]) == 35
    assert set(catalog["definitions"]["terrains"]) == set("012345")
    for terrain_id, terrain in overrides["terrainCodes"].items():
        assert catalog["definitions"]["terrains"][terrain_id]["nameZh"] == terrain["nameZh"]
        assert catalog["definitions"]["terrains"][terrain_id]["menuTextId"] == terrain["menuTextId"]
    assert all(b["referenceSlug"] == overrides["bossIds"][id]["referenceSlug"] for id, b in catalog["definitions"]["bosses"].items())

    report: dict = {
        "schemaVersion": 1,
        "patterns": len(patterns), "nativePoints": point_count,
        "classifiedBuildingPoints": category_count,
        "verifiedFieldBossPoints": field_boss_count,
        "eventPatterns": event_count,
        "terrainCounts": dict(sorted(Counter(p["terrain"]["value"] for p in patterns).items())),
        "calibratedTerrains": sorted(calibrated_terrains),
        "normalizedPoints": sum(point["normalized"] is not None for p in patterns for point in p["points"]),
        "exampleFilterCounts": {},
    }

    # All examples use facts from the same native pattern rows. Adding a fact
    # must never increase the candidate set.
    examples = [
        ("nightlord0", lambda p: p["nightlord"]["menuRowId"] == "0"),
        ("plus_day1_4929", lambda p: p["nightlord"]["menuRowId"] == "0" and p["dayBosses"]["day1"]["sourceId"] == "4929"),
        ("plus_day2_4860", lambda p: p["nightlord"]["menuRowId"] == "0" and p["dayBosses"]["day1"]["sourceId"] == "4929" and p["dayBosses"]["day2"]["sourceId"] == "4860"),
        ("plus_event_7724", lambda p: p["nightlord"]["menuRowId"] == "0" and p["dayBosses"]["day1"]["sourceId"] == "4929" and p["dayBosses"]["day2"]["sourceId"] == "4860" and p["events"]["state"] == "known" and p["events"]["values"][0]["sourceId"] == "event:7724"),
    ]
    previous: set[str] | None = None
    for name, predicate in examples:
        current = {p["patternId"] for p in patterns if predicate(p)}
        assert previous is None or current <= previous
        report["exampleFilterCounts"][name] = len(current)
        previous = current
    assert report["exampleFilterCounts"] == {
        "nightlord0": 50, "plus_day1_4929": 25, "plus_day2_4860": 11, "plus_event_7724": 2,
    }
    narrowed = [by_id[id] for id in ("0", "4")]
    at_113 = [{f.get("sourceId") for point in p["points"] if point["attachId"] == "113" for f in point["features"]} for p in narrowed]
    assert "buildingCategory:ruins" in at_113[0] and "buildingCategory:mainencampment" in at_113[1]
    report["exampleFilterCounts"]["plus_point_113_ruins"] = 1
    great_hollow_gladius = [p for p in patterns if p["nightlord"]["menuRowId"] == "0" and p["terrain"]["value"] == "4"]
    assert len(great_hollow_gladius) == 5
    primary_at_1111 = {
        p["patternId"]: next((f.get("sourceId") for point in p["points"] if point["attachId"] == "1111" for f in point["features"] if f.get("role") == "primarySmallBaseBoss"), None)
        for p in great_hollow_gladius
    }
    assert primary_at_1111["1005"] == "fieldBoss:4917"
    assert primary_at_1111["1006"] == "fieldBoss:4910"
    unknown_at_1111 = next(point for point in by_id["1015"]["points"] if point["attachId"] == "1111")
    assert unknown_at_1111["coverage"]["primarySmallBaseBoss"] == "unknown"
    assert any(f.get("sourceId") == "smallBaseMap:4990" for f in unknown_at_1111["features"])
    report["exampleFilterCounts"]["great_hollow_gladius_primary_boss_1111_4917"] = sum(value == "fieldBoss:4917" for value in primary_at_1111.values())
    assert report["exampleFilterCounts"]["great_hollow_gladius_primary_boss_1111_4917"] == 1

    if args.reference:
        reference = json.loads(args.reference.read_text(encoding="utf-8"))
        seeds = {str(int(r["seed_id"])): r for r in reference["seeds"]}
        boss_assignments = {str(int(r["seed_id"])): r for r in reference["bossAssignments"]}
        assert set(seeds) == set(boss_assignments) == set(by_id)
        target_slugs = {
            "0": "1_Gladius", "1": "2_Adel", "2": "3_Gnoster", "3": "4_Maris", "4": "5_Libra",
            "5": "6_Fulghor", "6": "7_Caligo", "7": "8_Heolstor", "8": "9_Balancers", "9": "10_Greg",
        }
        for pid, pattern in by_id.items():
            assert seeds[pid]["nightlord"] == target_slugs[pattern["nightlord"]["menuRowId"]]
            assert seeds[pid]["map_type"] == overrides["terrainCodes"][pattern["terrain"]["value"]]["referenceName"]
            for field, ref_field in (("day1", "night1"), ("day2", "night2")):
                boss_id = pattern["dayBosses"][field]["sourceId"]
                assert boss_assignments[pid][ref_field] == overrides["bossIds"][boss_id]["referenceSlug"]
            native_event = pattern["events"]
            external_event = seeds[pid].get("Event") or ""
            if native_event["state"] == "known_absent":
                assert not external_event
            else:
                event = native_event["values"][0]
                event_code = event["sourceId"].split(":", 1)[1]
                family = overrides["eventCodes"][event_code]["referenceFamily"]
                assert external_event == family + (f"Day{event['day']}" if event["day"] else "")
        for map_id, field_boss in overrides["verifiedFieldBossMapIds"].items():
            native_set = {
                pid for pid, pattern in by_id.items()
                if any(
                    feature.get("sourceId") == f"fieldBoss:{map_id}"
                    for point in pattern["points"] for feature in point["features"]
                )
            }
            reference_set = {
                pid for pid, record in boss_assignments.items()
                if field_boss["referenceSlug"] in record.get("fieldBosses", [])
            }
            assert native_set == reference_set
        _, define_rows = param(args.source, "SmallBaseAndSpotDefine")
        map_icons: dict[str, set[str]] = defaultdict(set)
        for row in define_rows:
            for field, map_id in row.items():
                if field.startswith("mapId") and map_id.isdigit() and int(map_id) > 0:
                    map_icons[map_id].add(row["worldMapPointIconId1"])
        building_agreement = {}
        for icon_id, category in overrides["pointIconCategories"].items():
            key = category["key"]
            agreed = 0
            for pid in by_id:
                native_count = sum(icon_id in map_icons[row["smallBaseMapId"]] for row in native_smalls[pid])
                reference_count = sum(bool(value) and value.split("_", 1)[0] == key for value in seeds[pid]["slots"].values())
                agreed += native_count == reference_count
            assert f"{agreed}/520" == category["referenceAgreement"]
            building_agreement[key] = agreed
        report["explicitIdReferenceCrosscheck"] = "520/520 target, terrain, day bosses and event family/day matched"
        report["fieldBossPresenceCrosscheck"] = "17/17 field-boss pattern sets matched"
        report["buildingCategoryCountAgreement"] = building_agreement
        report["referenceSha256"] = sha256(args.reference)

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
