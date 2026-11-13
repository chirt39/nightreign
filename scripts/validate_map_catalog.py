#!/usr/bin/env python3
"""Validate native map joins, identity overrides, coverage and filter examples."""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

from build_map_catalog import ASSET_MANIFEST, CASTLE_BOSS_ATTACH_IDS, OVERRIDES, OUTPUT, SOURCE, param, sha256

NATIVE_AUDIT = Path(r"E:\海斗\outputs\enemy-full-audit\native")


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
    field_elite_count = 0
    display_position_count = Counter()
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
            assert point["coverage"]["fieldElite"] == ("known" if raw in overrides["verifiedFieldEliteMapIds"] and point["attachId"] not in CASTLE_BOSS_ATTACH_IDS else "unknown")
            if point["attachId"] in CASTLE_BOSS_ATTACH_IDS:
                assert not any(f.get("role") == "fieldElite" for f in point["features"])
            assert any(f.get("sourceId") == f"smallBaseMap:{raw}" for f in point["features"])
            for feature in point["features"]:
                if feature.get("sourceId", "").startswith("buildingCategory:"):
                    category_count += 1
                    assert feature["sourceId"] in catalog["definitions"]["features"]
                if feature.get("sourceId", "").startswith("fieldBoss:"):
                    field_boss_count += 1
                    assert feature["displayCategory"] == catalog["definitions"]["features"][feature["sourceId"]]["displayCategory"] == "baseBoss"
                    assert feature["sourceId"] in catalog["definitions"]["features"]
                if feature.get("sourceId", "").startswith("fieldElite:"):
                    field_elite_count += 1
                    assert feature["sourceId"] == f"fieldElite:{raw}"
                    assert feature["displayCategory"] == catalog["definitions"]["features"][feature["sourceId"]]["displayCategory"] == "fieldElite"
                    display_key = f"{pattern['terrain']['value']}:{point['attachId']}"
                    display_override = overrides.get("fieldEliteDisplayPositionOverrides", {}).get(display_key)
                    if display_override:
                        assert feature["displayNormalized"] == display_override["normalized"]
                        assert feature["displayPositionAccuracy"] == "reference"
                        display_position_count[display_key] += 1
                    else:
                        assert "displayNormalized" not in feature
        if pattern["events"]["state"] == "known":
            event_count += 1
            assert len(pattern["events"]["values"]) == 1
            assert pattern["events"]["values"][0]["sourceId"] in catalog["definitions"]["events"]
        else:
            assert pattern["events"] == {"state": "known_absent", "values": []}

    assert point_count == 23830
    assert field_boss_count == 348
    assert field_elite_count == 5060
    assert display_position_count == {"0:755": 160, "0:2755": 80}
    for pid, elite_attach, building_attach in (("0", "755", "305"), ("1000", "2755", "2305")):
        points = {point["attachId"]: point for point in by_id[pid]["points"]}
        elite = points[elite_attach]
        assert elite["normalized"] == points[building_attach]["normalized"]
        assert elite["world"]["source"] == f"SmallBaseAndSpotAttachPoint:{elite_attach}"
        assert any(f.get("kind") == "building" and f.get("sourceId", "").startswith("smallBaseMap:") for f in elite["features"])
    castle_basement_raw = sum(
        point["attachId"] in {"756", "2756"} and any(
            f.get("sourceId", "").startswith("smallBaseMap:") and f["sourceId"].split(":", 1)[1] in overrides["verifiedFieldEliteMapIds"]
            for f in point["features"]
        )
        for pattern in patterns for point in pattern["points"]
    )
    assert castle_basement_raw == 390
    reference_points = catalog["referencePoints"]
    assert len(reference_points) == len(overrides["referencePoints"]) + len(overrides["nativeReferenceElitePoints"])
    assert len({p["key"] for p in reference_points}) == len(reference_points)
    assert Counter(p["terrainId"] for p in reference_points) == {"1": 12, "2": 10, "5": 14}
    assert all(p["filterable"] is False and p["positionAccuracy"] in {"reference", "native", "native_entity_placement"} for p in reference_points)
    assert Counter(p["displayCategory"] for p in reference_points) == {"fieldElite": 34, "baseBoss": 2}
    assert {p["key"] for p in reference_points if p["displayCategory"] == "baseBoss"} == {"1:2", "1:3"}
    icon_rows = overrides["verifiedReferencePointIconRows"]
    native_points = overrides["nativeReferenceElitePoints"]
    assert {p["key"] for p in reference_points if p["worldMapPointIconId"] is not None} == set(icon_rows) | set(native_points)
    assert all(p["worldMapPointIconId"] in {16, 28} and p["nativeWorldMapPointRowIds"] == icon_rows[p["key"]] for p in reference_points if p["key"] in icon_rows)
    assert all(p["worldMapPointIconId"] is None for p in reference_points if p["key"] not in icon_rows and p["key"] not in native_points)
    _, world_map_rows = param(args.source, "WorldMapPointParam")
    world_map_by_id = {row["id"]: row for row in world_map_rows}
    for point in reference_points:
        for row_id in point.get("nativeWorldMapPointRowIds", []):
            row = world_map_by_id[row_id]
            transform = asset_manifest["terrains"][point["terrainId"]]["coordinateTransform"]
            x = (int(row["gridXNo"]) * transform["pixelX"]["gridXNo"] + float(row["posX"]) * transform["pixelX"]["posX"] + transform["pixelX"]["constant"]) / transform["width"]
            y = (int(row["gridZNo"]) * transform["pixelY"]["gridZNo"] + float(row["posZ"]) * transform["pixelY"]["posZ"] + transform["pixelY"]["constant"]) / transform["height"]
            assert math.hypot(x - point["normalized"]["x"], y - point["normalized"]["y"]) * transform["width"] < 1
            assert point["worldMapPointIconId"] == int(row["worldMapPointIconId"])
    npc_evidence = overrides["verifiedReferencePointNpcParamIds"]
    assert len(npc_evidence) == 23
    flag_to_point = {int(world_map_by_id[(icon_rows.get(key) or [native_points[key]["worldMapPointRowId"]])[0]]["eventFlagId0"]): key for key in npc_evidence}
    flag_entities = defaultdict(list)
    with (NATIVE_AUDIT / "events.jsonl").open(encoding="utf-8") as stream:
        for line in stream:
            for event in json.loads(line)["events"]:
                for instruction in event["instructions"]:
                    args32 = instruction.get("int32") or []
                    if len(args32) > 6 and args32[1] == 90015017 and args32[6] in flag_to_point:
                        flag_entities[args32[6]].append(args32[2])
    assert set(flag_entities) == set(flag_to_point)
    assert all(len(entities) == 1 for entities in flag_entities.values())
    entity_npcs = defaultdict(set)
    target_entities = {entities[0] for entities in flag_entities.values()}
    with (NATIVE_AUDIT / "placements.jsonl").open(encoding="utf-8") as stream:
        for line in stream:
            placement = json.loads(line)
            for entity in target_entities & {placement["entityId"], *placement["entityGroups"]}:
                entity_npcs[entity].add(placement["NpcParamId"])
    for flag, key in flag_to_point.items():
        assert entity_npcs[flag_entities[flag][0]] == set(npc_evidence[key]), key
    assert Counter(p["worldMapPointIconId"] for p in reference_points if p["displayCategory"] == "fieldElite") == {16: 16, 28: 11, None: 7}
    native_elite_icons = Counter()
    for map_id, elite in overrides["verifiedFieldEliteMapIds"].items():
        icon_id = catalog["definitions"]["features"][f"fieldElite:{map_id}"]["worldMapPointIconId"]
        assert icon_id == elite["worldMapPointIconId"]
        native_elite_icons[icon_id] += 1
    assert native_elite_icons == {16: 11, 28: 11}
    assert all(0 <= p["normalized"][axis] <= 1 for p in reference_points for axis in ("x", "y"))
    assert event_count == 251
    assert len(catalog["definitions"]["nightlords"]) == 10
    assert len(catalog["definitions"]["bosses"]) == 35
    red_wolf = catalog["definitions"]["features"]["fieldElite:4651"]
    assert red_wolf["nameZh"] == "红狼" and red_wolf["referenceName"] == "Red Wolf"
    assert red_wolf["npcNameTextId"] is None and red_wolf["nameMethod"] == "reference_label_translation"
    assert sum(any(f.get("sourceId") == "fieldElite:4651" for point in p["points"] for f in point["features"]) for p in patterns) == 243
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
        "verifiedFieldElitePoints": field_elite_count,
        "fieldEliteDisplayPositionOverrides": dict(display_position_count),
        "excludedCastleBasementRawPoints": castle_basement_raw,
        "displayOnlyReferencePoints": len(reference_points),
        "nativeFieldEliteIconTemplates": dict(native_elite_icons),
        "nativeReferenceIconPoints": sum(p["worldMapPointIconId"] in {16, 28} for p in reference_points),
        "verifiedReferencePointEventEntityLinks": len(npc_evidence),
        "unresolvedReferenceFieldEliteIcons": sum(p["displayCategory"] == "fieldElite" and p["worldMapPointIconId"] is None for p in reference_points),
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
        terrain_reference_names = {"0": "Normal", "1": "Mountaintop", "2": "Crater", "3": "Rotted", "4": "Great Hollow", "5": "Noklateo"}
        named_slots = reference["remote"]["bossPositions"]["positions"]
        slot_assignments = reference["remote"]["bossAssignments"]["seeds"]
        field_elite_slot_matches = 0
        for pid, pattern in by_id.items():
            positions = named_slots[terrain_reference_names[pattern["terrain"]["value"]]]
            assignments = slot_assignments.get(pid, {})
            for point in pattern["points"]:
                elite = next((f for f in point["features"] if f.get("role") == "fieldElite"), None)
                if elite is None or point["normalized"] is None or point["attachId"] in {"756", "2756"}:
                    continue
                x, y = point["normalized"]["x"] * 1000, point["normalized"]["y"] * 1000
                nearest = min(positions, key=lambda p: math.hypot(x - p["x"], y - p["y"]))
                if math.hypot(x - nearest["x"], y - nearest["y"]) > 45 or not nearest.get("slot"):
                    continue
                assigned = assignments.get(nearest["slot"])
                if not assigned:
                    continue
                map_id = elite["sourceId"].split(":", 1)[1]
                expected = overrides["verifiedFieldEliteMapIds"][map_id]["referenceName"]
                assert assigned.lower().replace("-", "") == expected.lower().replace("-", "") or (map_id == "4672" and assigned == "Golden Hippo")
                field_elite_slot_matches += 1
        assert field_elite_slot_matches > 3500
        report["fieldEliteNamedSlotCrosscheck"] = field_elite_slot_matches
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
