"""Validate the catalogue against the existing local extraction and real examples."""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import sys

from build_weapon_catalog import DEFAULT_AUDIT, DEFAULT_SOURCE, ROOT, Extraction, write_json


def validate(catalogue_path, source, audit_dir):
    data = json.loads(catalogue_path.read_text(encoding="utf-8"))
    extraction = Extraction(source)
    raw = extraction.param("EquipParamWeapon")
    by_id = {r["id"]: r for r in raw}
    weapon_names = extraction.texts("WeaponName")
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
            check("基础补正系数" in variant["scalingNote"] and "非游戏等级标记" in variant["scalingNote"], "Scaling disclosure missing")
            for key, suffix in [("physical", "Physics"), ("magic", "Magic"), ("fire", "Fire"), ("lightning", "Thunder"), ("holy", "Dark")]:
                value = variant["attack"][key]
                check(isinstance(value, (int, float)) and math.isfinite(value) and value == float(row["attackBase" + suffix]), "Attack component differs from source")
            for key, suffix in [("strength", "Strength"), ("dexterity", "Agility"), ("intelligence", "Magic"), ("faith", "Faith"), ("arcane", "Luck")]:
                check(variant["scaling"][key] == float(row["correct" + suffix]), "Scaling raw coefficient differs from source")
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
    return {"status": "passed", "checks": count, "weaponCount": len(families), "variantCount": len(variants), "skillPools": len(skill_pools),
            "catalogueSha256": hashlib.sha256(catalogue_path.read_bytes()).hexdigest(),
            "samples": ["匕首普通/火焰/雷电", "33750000/33770000同图标不合并", "33990100来源缺失", "5750000/11750000 DLC专属文本", "10000010多行战技池"]}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogue", type=Path, default=ROOT / "public/weapon-catalog.json")
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--audit-dir", type=Path, default=DEFAULT_AUDIT)
    args = parser.parse_args()
    result = validate(args.catalogue, args.source_root, args.audit_dir)
    write_json(args.audit_dir / "validation.json", result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
