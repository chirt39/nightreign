"""Validate the catalogue against the existing local extraction and real examples."""
from __future__ import annotations

import argparse
from bisect import bisect_right
from collections import Counter, defaultdict
import copy
import csv
import hashlib
import json
import math
from pathlib import Path
import sys
import unicodedata

from build_weapon_catalog import DEFAULT_AUDIT, DEFAULT_SOURCE, DEFAULT_GRADES, ROOT, Extraction, scaling_grade, write_json


def validate(catalogue_path, source, audit_dir, baseline=None):
    data = json.loads(catalogue_path.read_text(encoding="utf-8"))
    extraction = Extraction(source)
    raw = extraction.param("EquipParamWeapon")
    by_id = {r["id"]: r for r in raw}
    weapon_names = extraction.texts("WeaponName")
    menu_rows = {r["id"]: r for r in extraction.param("MenuValueTableParam")}
    menu_text = extraction.texts("CL_MenuText")
    csv_weapons = {r["row_id"]: r for r in csv.DictReader((source / "csv/EquipParamWeapon.csv").open(encoding="utf-8-sig"))}
    bounds = [int(menu_rows[str(i)]["value"]) for i in range(105, 99, -1)]
    grades_ascending = ["-", "E", "D", "C", "B", "A", "S"]
    source_thresholds = [(int(menu_rows[str(i)]["value"]), grades_ascending[106-i]) for i in range(100, 106)]
    arts = {r["id"]: r for r in extraction.param("SwordArtsParam")}
    art_names = extraction.texts("ArtsName")
    tables = defaultdict(list)
    skill_pools = json.loads((audit_dir / "resolved-skill-pools.json").read_text(encoding="utf-8"))
    for index, row in enumerate(extraction.param("SwordArtsTableParam")):
        tables[row["id"]].append((index, row))
    count = 0

    def check(condition, message):
        nonlocal count
        count += 1
        if not condition:
            raise ValueError(message)

    check(data["schemaVersion"] == 1, "Unsupported schema")
    check(bounds == [1, 15, 30, 45, 60, 73], "Source grade boundary changed")
    check([menu_rows[str(i)]["textId"] for i in range(100, 107)] == [str(i) for i in [11321, 11322, 11323, 11324, 11325, 11326, 11320]], "Grade text references changed")
    for index, char in enumerate("SABCDE-"):
        check({unicodedata.normalize("NFKC", x["text"]) for x in menu_text[menu_rows[str(100+index)]["textId"]]} == {char}, "Grade menu text mismatch")
    for lower, below, equal in [(1, "-", "E"), (15, "E", "D"), (30, "D", "C"), (45, "C", "B"), (60, "B", "A"), (73, "A", "S")]:
        check(scaling_grade(math.nextafter(lower, -math.inf), source_thresholds) == below, "Immediately before boundary misgraded")
        check(scaling_grade(lower, source_thresholds) == equal, "Equal boundary misgraded")
        check(scaling_grade(math.nextafter(lower, math.inf), source_thresholds) == equal, "Immediately after boundary misgraded")
    check(scaling_grade(0, source_thresholds) == "-", "Zero scaling must display hyphen")
    for invalid in [None, "73", True, False, [], {}, -1, -0.001, math.nan, math.inf, -math.inf]:
        check(scaling_grade(invalid, source_thresholds) is None, "Unknown/invalid value coerced into a grade")
    check(catalogue_path.stat().st_size <= 3_000_000, "Public catalogue exceeds the reviewed payload budget")
    check("skillPools" not in data, "Detailed pools belong in external audit data")
    manifest = json.loads((source / "source-manifest.json").read_text(encoding="utf-8"))
    check(data["gameVersion"] == manifest["executable_version"], "Game version mismatch")
    check(data["regulationVersion"] == manifest["regulation_version"], "Regulation version mismatch")
    categories = {x["id"]: x["label"] for x in data["categories"]}
    families = {w["id"]: w for w in data["weapons"]}
    check(len(families) == len(data["weapons"]), "Duplicate family IDs")
    variants = {}
    for item in data["weapons"]:
        check(isinstance(item["id"], str) and item["id"] in by_id, "Family ID not a source row")
        check(item["categoryLabel"] == categories[item["categoryId"]], "Category label mismatch")
        check(item["representativeVariantId"] == item["id"], "Representative must be explicit root")
        check(item["sourceIds"] == [v["id"] for v in item["variants"]], "Family source list mismatch")
        check(item["dlc"] is True or item["dlc"] is None, "Unproven non-DLC flag")
        dlc_evidence = any(x["dlcText"] for x in weapon_names[item["id"]])
        check((item["dlc"] is True) == dlc_evidence, "DLC requires the root's dedicated DLC text entry")
        for variant in item["variants"]:
            vid = variant["id"]
            check(isinstance(vid, str) and vid not in variants, "Variant ID duplicate or not string")
            variants[vid] = variant
            row = by_id[vid]
            check(variant["name"] in {x["text"] for x in weapon_names[vid]}, "Variant name has no same-ID Chinese text")
            check(row["wepType"] == item["categoryId"], "Cross-category grouping")
            check(row["originEquipWep"] == item["id"], "Sample snapshot requires direct explicit root")
            check(variant["sourceIds"] == [vid], "Variant source ID mismatch")
            check(variant["iconId"] == int(row["iconId"]), "Image ID replaced with weapon ID")
            check(variant["requirements"] is None and variant["rarity"] is None, "Unverified semantics must remain null")
            check("不包含运行时效果或强化模拟" in variant["scalingNote"], "Grade scope disclosure missing")
            for key, suffix in [("physical", "Physics"), ("magic", "Magic"), ("fire", "Fire"), ("lightning", "Thunder"), ("holy", "Dark")]:
                value = variant["attack"][key]
                check(isinstance(value, (int, float)) and math.isfinite(value) and value == float(row["attackBase" + suffix]), "Attack component differs from source")
            for key, suffix in [("strength", "Strength"), ("dexterity", "Agility"), ("intelligence", "Magic"), ("faith", "Faith"), ("arcane", "Luck")]:
                check(variant["scaling"][key] == float(row["correct" + suffix]), "Scaling raw coefficient differs from source")
                value = float(csv_weapons[vid]["correct" + suffix])
                check(variant["scaling"][key] == value, "Independent CSV raw coefficient differs")
                expected_grade = grades_ascending[bisect_right(bounds, value)] if math.isfinite(value) and value >= 0 else None
                check(variant["scalingGrades"][key] == expected_grade, "Grade differs from independent CSV/menu lookup")
            skill = variant["skill"]
            check(skill["kind"] in {"fixed", "pool", "unknown"}, "Invalid skill kind")
            check("candidates" not in skill, "Repeated detailed candidates leaked into public payload")
            fixed_source = arts.get(row["swordArtsParamId"])
            fixed_text_id = fixed_source["textId"] if fixed_source else None
            fixed_names = {x["text"] for x in art_names.get(fixed_text_id, [])}
            check(skill["default"]["textId"] == fixed_text_id and skill["default"]["name"] == (next(iter(fixed_names)) if len(fixed_names) == 1 else None), "Default skill text reference mismatch")
            if int(row["swordArtsTableId"]) >= 0:
                check(skill["tableId"] == row["swordArtsTableId"], "Skill table reference changed")
                options = skill_pools[skill["tableId"]]
                names = list(dict.fromkeys(x["name"] for x in options if x["weight"] > 0 and int(x["id"]) >= 0 and x["name"]))
                check(skill["names"] == names, "Pool names differ from active candidates")
            else:
                check(skill["default"]["id"] == row["swordArtsParamId"], "Default skill reference changed")
    for table_id, options in skill_pools.items():
        check(len(options) == len(tables[table_id]), "Repeated table rows were lost")
        for option, (index, row) in zip(options, tables[table_id]):
            check(option["sourceIndex"] == index and option["id"] == row["swordArtsId"] and option["weight"] == float(row["chanceWeight"]), "Candidate row identity/weight changed")
            art = arts.get(option["id"])
            text_id = art["textId"] if art else None
            names = {x["text"] for x in art_names.get(text_id, [])}
            expected = next(iter(names)) if len(names) == 1 else None
            check(option["textId"] == text_id and option["name"] == expected, "Skill name must follow SwordArtsParam.textId")

    # Independent regression examples from the supplied snapshot, not synthetic game facts.
    dagger = families["1000000"]
    check({"1000000", "1000500", "1000600"}.issubset(dagger["sourceIds"]), "Dagger affinities split incorrectly")
    check(variants["1000000"]["attack"]["physical"] == 58, "Dagger base sample")
    check(variants["1000500"]["attack"]["physical"] == 29 and variants["1000500"]["attack"]["fire"] == 29, "Fire dagger components mixed")
    check(variants["1000600"]["attack"]["lightning"] > 0, "Lightning dagger component missing")
    check(families["33750000"]["iconId"] == families["33770000"]["iconId"] and families["33750000"]["id"] != families["33770000"]["id"], "Same-icon starting/staff rows were merged")
    check("33990100" not in variants and by_id["33990100"]["originEquipWep"] not in by_id, "Unresolved source rounded into a family")
    check(families["5750000"]["dlc"] is True and families["11750000"]["dlc"] is True, "Dedicated DLC text sample missing")
    check(dagger["dlc"] is None, "Container dlc01 name incorrectly marked base dagger DLC")
    for vid in ["1000000", "1140000", "1140500"]:
        check(variants[vid]["scalingGrades"] == {"strength": "E", "dexterity": "S", "intelligence": "-", "faith": "-", "arcane": "-"}, "13/73 weapon example misgraded")
    check(variants["1000000"]["skill"]["kind"] == "pool" and len(skill_pools["10000010"]) > 1, "Dagger skill pool collapsed to fixed")
    exclusions = json.loads((audit_dir / "excluded-weapon-rows.json").read_text(encoding="utf-8"))
    check(set(variants).isdisjoint(x["id"] for x in exclusions), "Included/excluded overlap")
    check(set(variants) | {x["id"] for x in exclusions} == set(by_id), "Source row silently lost")
    custom = json.loads((audit_dir / "custom-configurations.json").read_text(encoding="utf-8"))
    check(len(custom) == len(extraction.param("EquipParamCustomWeapon")), "Custom rows dropped")
    check(sum(x["status"] == "unresolved-target" for x in custom) == data["summary"]["unresolvedCustomRows"], "Unresolved custom targets miscounted")
    attached = json.loads((audit_dir / "attach-effect-table-rows.json").read_text(encoding="utf-8"))
    check(attached == extraction.param("AttachEffectTableParam"), "Attach effect audit lost source rows/defaults")
    check(sum(x["id"] == "100" for x in attached) > 1, "Repeated attach effect table ID was collapsed")
    check(data["summary"]["weaponCount"] == len(families) and data["summary"]["variantCount"] == len(variants), "Summary mismatch")
    for item in data["provenance"]["files"]:
        check(hashlib.sha256((source / item["path"]).read_bytes()).hexdigest() == item["sha256"], "Source hash mismatch: " + item["path"])
    check(data["provenance"]["scalingGrades"]["runtimeVerified"] is False, "Static inference incorrectly called runtime verified")
    preserved = None
    if baseline:
        before = json.loads(baseline.read_text(encoding="utf-8"))
        after = copy.deepcopy(data)
        for catalogue in [before, after]:
            for weapon in catalogue["weapons"]:
                for variant in weapon["variants"]:
                    variant.pop("scalingGrades", None)
                    variant.pop("scalingNote", None)
        old_files = before["provenance"].pop("files")
        new_files = after["provenance"].pop("files")
        after["provenance"].pop("scalingGrades")
        check(all(item in new_files for item in old_files), "Existing provenance changed")
        check(before == after, "Unrelated catalogue fields changed")
        preserved = True
    return {"status": "passed", "checks": count, "weaponCount": len(families), "variantCount": len(variants), "skillPools": len(skill_pools),
            "scalingValuesChecked": len(variants) * 5, "boundaryCases": 18, "invalidCases": 11, "unrelatedFieldsPreserved": preserved,
            "gradeCounts": dict(Counter(grade for variant in variants.values() for grade in variant["scalingGrades"].values())),
            "zeroCoefficients": sum(value == 0 for variant in variants.values() for value in variant["scaling"].values()),
            "catalogueSha256": hashlib.sha256(catalogue_path.read_bytes()).hexdigest(),
            "samples": ["匕首普通/火焰/雷电", "33750000/33770000同图标不合并", "33990100来源缺失", "5750000/11750000 DLC专属文本", "10000010多行战技池"]}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogue", type=Path, default=ROOT / "public/weapon-catalog.json")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--audit-dir", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--grades-dir", type=Path, default=DEFAULT_GRADES)
    parser.add_argument("--baseline", type=Path, help="Pre-conversion catalogue for exact unrelated-field comparison")
    args = parser.parse_args()
    result = validate(args.catalogue, args.source_root, args.audit_dir, args.baseline)
    write_json(args.audit_dir / "validation.json", result)
    write_json(args.grades_dir / "validation.json", result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
