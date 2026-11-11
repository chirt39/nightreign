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

from build_weapon_catalog import DEFAULT_AUDIT, DEFAULT_SOURCE, DEFAULT_GRADES, DEFAULT_ICONS, ROOT, Extraction, scaling_grade, skill_item_ids, write_json


def validate(catalogue_path, source, audit_dir, baseline=None, baseline_mode="icons"):
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
    definitions = data["skillDefinitions"]
    used_art_ids, unresolved_contexts = set(), []
    context_count = 0
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
            # Reconstruct the context from source XML, not the generator's icon audit.
            referenced = [r["swordArtsId"] for _, r in tables[row["swordArtsTableId"]]
                          if float(r["chanceWeight"]) > 0 and int(r["swordArtsId"]) >= 0] if skill["kind"] == "pool" else [row["swordArtsParamId"]] if skill["kind"] == "fixed" else []
            name_ids = defaultdict(set)
            for art_id in referenced:
                art_row = arts.get(art_id)
                texts = {x["text"] for x in art_names.get(art_row["textId"] if art_row else None, [])}
                if len(texts) == 1:
                    name_ids[next(iter(texts))].add(art_id)
            check(len(skill["itemIds"]) == len(skill["names"]), "Icon references changed public name count")
            for name, art_id in zip(skill["names"], skill["itemIds"]):
                context_count += 1
                ids = name_ids[name]
                expected_id = next(iter(ids)) if len(ids) == 1 else None
                if expected_id is not None and int(arts[expected_id]["iconId"]) <= 0:
                    expected_id = None
                check(art_id == expected_id, "Icon chosen outside current fixed/pool context")
                if art_id is None:
                    unresolved_contexts.append({"variantId": vid, "name": name, "ids": sorted(ids, key=int)})
                else:
                    check(isinstance(art_id, str), "Art parameter ID must stay a string")
                    used_art_ids.add(art_id)
                    check(definitions[art_id] == {"id": art_id, "textId": arts[art_id]["textId"], "name": name, "iconId": int(arts[art_id]["iconId"])}, "Definition differs from SwordArtsParam text/icon fields")
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
    check(set(definitions) == used_art_ids, "Missing or unused skill definitions")
    check(not {"125", "1056"} & used_art_ids, "Hidden pool defaults leaked into public names")
    # Same global name must retain the distinct source IDs/icons at its real contexts.
    for first, second, name in [("103", "1166", "回旋斩"), ("118", "1165", "罗蕾塔的斩击"),
                               ("1012", "1055", "欧赫剑舞"), ("1018", "1035", "流体化"),
                               ("1047", "1173", "星云"), ("1054", "1191", "不可挡之刃")]:
        check(definitions[first]["name"] == definitions[second]["name"] == name and definitions[first]["iconId"] != definitions[second]["iconId"], "Same-name different-icon sample collapsed")
    menu_files = {x["name"] for x in json.loads((source / "monster-images/menu-inventory.json").read_text(encoding="utf-8"))["menu_files"]}
    check(all(f"MENU_Knowledge_{x['iconId']:05}.tpf.dcx" in menu_files for x in definitions.values()), "Source menu resource not found")
    # Future ambiguity keeps the existing single name and returns null, including when icons coincide.
    fixture = {"kind": "pool", "names": ["同名", "缺失"], "tableId": "sample", "default": {"id": "3", "name": "同名"}}
    opts = {"sample": [{"id": "1", "name": "同名", "weight": 1}, {"id": "2", "name": "同名", "weight": 1}, {"id": "3", "name": "缺失", "weight": 0}]}
    item_ids, issues = skill_item_ids(fixture, opts, {str(i): {"iconId": "10", "textId": "1"} for i in (1, 2, 3)}, {})
    check(item_ids == [None, None] and len(issues) == 2 and fixture["names"] == ["同名", "缺失"], "Ambiguity/zero-weight fallback changed names or picked first")
    fixed_fixture = {"kind": "fixed", "names": ["固定"], "default": {"id": "3", "name": "固定"}}
    item_ids, issues = skill_item_ids(fixed_fixture, opts, {"3": {"iconId": "30", "textId": "3"}}, {})
    check(item_ids == ["3"] and not issues, "Fixed skill incorrectly resolved from a pool")
    duplicate_fixture = {"kind": "pool", "names": ["重复行"], "tableId": "repeated"}
    same_id_rows = {"repeated": [{"id": "1", "name": "重复行", "weight": 1}] * 2}
    item_ids, issues = skill_item_ids(duplicate_fixture, same_id_rows, {"1": {"iconId": "10", "textId": "1"}}, {})
    check(item_ids == ["1"] and not issues, "Repeated identical parameter reference inflated the name list")
    item_ids, issues = skill_item_ids(fixed_fixture, {}, {"3": {"iconId": "0", "textId": "3"}}, {})
    check(item_ids == [None] and len(issues) == 1, "Missing icon reference should retain text without guessing")
    preserved = None
    if baseline:
        before = json.loads(baseline.read_text(encoding="utf-8"))
        after = copy.deepcopy(data)
        for catalogue in [before, after]:
            catalogue.pop("skillDefinitions", None)
            for weapon in catalogue["weapons"]:
                for variant in weapon["variants"]:
                    variant["skill"].pop("itemIds", None)
                    if baseline_mode == "grades":
                        variant.pop("scalingGrades", None)
                        variant.pop("scalingNote", None)
        if baseline_mode == "grades":
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
            "skillNameContexts": context_count, "skillDefinitions": len(definitions), "uniqueSkillNames": len({x["name"] for x in definitions.values()}),
            "unresolvedSkillContexts": unresolved_contexts, "baselineMode": baseline_mode if baseline else None,
            "catalogueSha256": hashlib.sha256(catalogue_path.read_bytes()).hexdigest(),
            "samples": ["匕首普通/火焰/雷电", "33750000/33770000同图标不合并", "33990100来源缺失", "5750000/11750000 DLC专属文本", "10000010多行战技池"]}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogue", type=Path, default=ROOT / "public/weapon-catalog.json")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--audit-dir", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--grades-dir", type=Path, default=DEFAULT_GRADES)
    parser.add_argument("--icons-dir", type=Path, default=DEFAULT_ICONS)
    parser.add_argument("--baseline", type=Path, help="Pre-conversion catalogue for exact unrelated-field comparison")
    parser.add_argument("--baseline-mode", choices=["icons", "grades"], default="icons")
    args = parser.parse_args()
    result = validate(args.catalogue, args.source_root, args.audit_dir, args.baseline, args.baseline_mode)
    write_json(args.audit_dir / "validation.json", result)
    write_json(args.grades_dir / "validation.json", result)
    write_json(args.icons_dir / "validation.json", result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
