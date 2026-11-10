"""Build the weapon catalogue from an existing local extraction; no network/unpacking.

Usage: python scripts/build_weapon_catalog.py [--source-root PATH] [--audit-dir PATH]
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r"E:\海斗\outputs\nightreign-data-20261109")
DEFAULT_AUDIT = Path(r"E:\海斗\outputs\weapon-encyclopedia-20261110\data")
DEFAULT_PARAMDEX = Path(r"E:\海斗\tools\WitchyBND-3.0.1.0\Assets\Paramdex\NR")

# Human-reviewed labels for NR Meta's WEP_TYPE, not the coarse WEAPON_CATEGORY.
CATEGORIES = {
    "1": "短剑", "3": "直剑", "5": "大剑", "7": "特大剑", "9": "曲剑",
    "11": "大曲剑", "13": "刀", "14": "双头剑", "15": "刺剑", "16": "重刺剑",
    "17": "斧", "19": "大斧", "21": "槌", "23": "大槌", "24": "连枷",
    "25": "矛", "28": "大矛", "29": "戟", "31": "镰刀", "35": "拳头",
    "37": "钩爪", "39": "软鞭", "41": "特大武器", "50": "轻弓", "51": "弓",
    "53": "大弓", "55": "弩", "56": "弩炮", "57": "手杖", "61": "圣印记",
    "65": "小盾", "67": "中盾", "69": "大盾", "81": "箭", "83": "大箭",
    "85": "弩箭", "86": "弩炮箭", "87": "火把",
}
STAT_FIELDS = {"strength": "Strength", "dexterity": "Agility", "intelligence": "Magic", "faith": "Faith", "arcane": "Luck"}
ATTACK_FIELDS = {"physical": "Physics", "magic": "Magic", "fire": "Fire", "lightning": "Thunder", "holy": "Dark"}


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class Extraction:
    def __init__(self, source):
        self.source = source
        self.inputs = set()

    def param(self, name):
        path = self.source / "strict/regulation-bin" / (name + ".param.xml")
        self.inputs.add(path)
        root = ET.parse(path).getroot()
        defaults = {f.get("name"): f.get("defaultValue") for f in root.find("fields")}
        # Do not collapse duplicate table IDs: these are weighted candidate lists.
        return [{**defaults, **r.attrib} for r in root.find("rows")]

    def texts(self, category):
        result = defaultdict(list)
        for path in sorted((self.source / "localized/text-bundles").rglob(category + "*.fmg.xml")):
            if "zhocn" not in path.parts or path.name not in {category + ".fmg.xml", category + "_dlc01.fmg.xml"}:
                continue
            self.inputs.add(path)
            for entry in ET.parse(path).getroot().find("entries"):
                text = (entry.text or "").strip()
                if text and text != "%null%":
                    result[entry.get("id")].append({"text": text, "file": path.relative_to(self.source).as_posix(), "dlcText": path.name == category + "_dlc01.fmg.xml"})
        return result


def number(row, field):
    value = float(row[field])
    return int(value) if value.is_integer() else value


def build(source, paramdex, audit_dir):
    extraction = Extraction(source)
    weapons = extraction.param("EquipParamWeapon")
    custom = extraction.param("EquipParamCustomWeapon")
    arts = {r["id"]: r for r in extraction.param("SwordArtsParam")}
    tables = extraction.param("SwordArtsTableParam")
    attached = extraction.param("AttachEffectTableParam")
    effect_definitions = extraction.param("AttachEffectParam")
    effect_names = extraction.texts("AttachEffectName")
    weapon_names, art_names = extraction.texts("WeaponName"), extraction.texts("ArtsName")
    by_id = {r["id"]: r for r in weapons}
    if len(by_id) != len(weapons):
        raise ValueError("Duplicate EquipParamWeapon IDs require review")
    table_map = defaultdict(list)
    for index, row in enumerate(tables):
        table_map[row["id"]].append({**row, "sourceIndex": index})

    def name_for(entries, key):
        names = {v["text"] for v in entries.get(key, [])}
        return next(iter(names)) if len(names) == 1 else None

    def art(art_id):
        row = arts.get(art_id)
        text_id = row["textId"] if row else None
        return {"id": art_id, "textId": text_id, "name": name_for(art_names, text_id)}

    skill_pools = {}
    def skill(row):
        fixed = art(row["swordArtsParamId"])
        table_id = row["swordArtsTableId"]
        if int(table_id) >= 0:
            if table_id not in skill_pools:
                skill_pools[table_id] = [{**art(option["swordArtsId"]), "weight": number(option, "chanceWeight"), "sourceIndex": option["sourceIndex"]}
                                        for option in table_map.get(table_id, [])]
            candidates = skill_pools[table_id]
            active = [v for v in candidates if v["weight"] > 0 and int(v["id"]) >= 0]
            names = list(dict.fromkeys(v["name"] for v in active if v["name"]))
            unknown = sum(v["name"] is None for v in active)
            return {"kind": "pool" if active else "unknown", "names": names,
                    "note": "可能出现的战技候选；实际战技随配置而定。" + (f"{unknown} 条候选中文名待核对。" if unknown else "") + ("可用战技待核对。" if not active else ""),
                    "tableId": table_id, "default": fixed}
        return {"kind": "fixed" if fixed["name"] else "unknown", "names": [fixed["name"]] if fixed["name"] else [],
                "note": "参数默认固定战技；定制配置可另行覆盖。" if fixed["name"] else "战技名称或引用待核对。", "default": fixed}

    exclusions, conflicts, groups = [], [], defaultdict(list)

    def root_for(row):
        seen, current = set(), row
        while True:
            if current["id"] in seen:
                return None, "来源引用循环"
            seen.add(current["id"])
            refs = {current["originEquipWep" + (str(i) if i else "")] for i in range(26)} - {"-1"}
            if len(refs) != 1:
                return None, "来源引用缺失或多个源ID冲突"
            target = next(iter(refs))
            if target not in by_id:
                return None, "源武器ID未命中"
            if target == current["id"]:
                return current, None
            current = by_id[target]

    for row in weapons:
        reasons = []
        name = name_for(weapon_names, row["id"])
        if not name:
            reasons.append("中文名缺失或同ID文本冲突")
        if row["wepType"] not in CATEGORIES:
            reasons.append("分类未确认")
        if row["sortId"] == "9999999":
            reasons.append("排序为占位值；玩家目录身份未确认")
        root, error = root_for(row)
        if error:
            reasons.append(error)
        if root:
            if root["wepType"] != row["wepType"]:
                reasons.append("源武器分类冲突")
            if not name_for(weapon_names, root["id"]):
                reasons.append("源武器中文名未确认")
            if root["sortId"] == "9999999":
                reasons.append("源武器排序为占位值")
        if reasons:
            exclusions.append({"id": row["id"], "name": name, "reasons": reasons, "row": row, "nameEvidence": weapon_names.get(row["id"], [])})
            if error or "冲突" in "".join(reasons):
                conflicts.append({"id": row["id"], "reasons": reasons})
            continue
        groups[root["id"]].append(row)

    result = []
    for root_id in sorted(groups, key=int):
        rows = sorted(groups[root_id], key=lambda r: (r["id"] != root_id, int(r["id"])))
        root = by_id[root_id]
        name = name_for(weapon_names, root_id)
        variants = []
        for row in rows:
            variant_name = name_for(weapon_names, row["id"])
            notes = []
            if row["id"] != root_id and variant_name == name:
                notes.append("此变体的适用条件待核对。")
            variants.append({"id": row["id"], "name": variant_name,
                "label": "普通" if row["id"] == root_id else variant_name if variant_name != name else "同名变体 " + str(1 + sum(v["name"] == name and v["id"] != root_id for v in variants)),
                "iconId": int(row["iconId"]), "rarity": None,
                "attack": {k: number(row, "attackBase" + v) for k, v in ATTACK_FIELDS.items()},
                "attackTypes": [label for field, label in [("isNormalAttackType", "普通"), ("isBlowAttackType", "打击"), ("isSlashAttackType", "斩击"), ("isThrustAttackType", "突刺")] if row[field] == "1"],
                "requirements": None, "requirementNote": "使用条件待核对。",
                "scaling": {k: number(row, "correct" + v) for k, v in STAT_FIELDS.items()},
                "scalingNote": "基础补正系数，非游戏等级标记；不包含强化、等级同步和角色属性修正。",
                "skill": skill(row), "notes": notes, "sourceIds": [row["id"]]})
        dlc = True if any(x["dlcText"] for x in weapon_names[root_id]) else None
        result.append({"id": root_id, "name": name, "categoryId": root["wepType"], "categoryLabel": CATEGORIES[root["wepType"]],
                       "dlc": dlc, "iconId": int(root["iconId"]), "aliases": [], "representativeVariantId": root_id,
                       "variants": variants, "sourceIds": [r["id"] for r in rows],
                       "notes": ["获取途径待核对。"]})

    included = {v["id"] for item in result for v in item["variants"]}
    custom_audit = [{"id": r["id"], "targetWeaponId": r["targetWeaponId"],
                     "status": "included-variant" if r["targetWeaponId"] in included else "excluded-target" if r["targetWeaponId"] in by_id else "unresolved-target",
                     "row": r} for r in custom]
    input_manifest = source / "source-manifest.json"
    extraction.inputs.add(input_manifest)
    manifest = json.loads(input_manifest.read_text(encoding="utf-8"))
    meta_path = paramdex / "Meta/EquipParamWeapon.xml"
    enum = ET.parse(meta_path).find("./Enums/Enum[@Name='WEP_TYPE']")
    enum_ids = {x.get("Value") for x in enum}
    if any(item["categoryId"] not in enum_ids for item in result):
        raise ValueError("A catalogue category has no NR WEP_TYPE enum")
    provenance = {"source": "本机 Steam 游戏提取；游戏原始数据，非社区推算。", "batch": source.name,
                  "regulationSha256": manifest["regulation_sha256"],
                  "files": [{"path": path.relative_to(source).as_posix(), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(extraction.inputs)],
                  "classificationMetaSha256": hashlib.sha256(meta_path.read_bytes()).hexdigest(),
                  "grouping": "沿 originEquipWep0..25 的一致显式引用追溯；缺失、循环或冲突不取整。",
                  "licenseStatus": "原游戏数据及文本的再分发许可待项目发布前核对；当前仅本地预览。"}
    summary = {"rawWeaponRows": len(weapons), "namedWeaponRows": sum(name_for(weapon_names, r["id"]) is not None for r in weapons),
               "weaponCount": len(result), "variantCount": len(included), "excludedRows": len(exclusions),
               "confirmedDlcWeapons": sum(x["dlc"] is True for x in result), "unknownDlcWeapons": sum(x["dlc"] is None for x in result),
               "customRows": len(custom), "unresolvedCustomRows": sum(x["status"] == "unresolved-target" for x in custom_audit),
               "skillKinds": dict(Counter(v["skill"]["kind"] for x in result for v in x["variants"])),
               "skillTableRows": len(tables), "skillTableIds": len(table_map), "attachEffectTableRows": len(attached),
               "attachEffectTableIds": len({r["id"] for r in attached})}
    catalogue = {"schemaVersion": 1, "gameVersion": manifest["executable_version"], "regulationVersion": manifest["regulation_version"],
                 "categories": [{"id": k, "label": CATEGORIES[k]} for k in sorted({x["categoryId"] for x in result}, key=int)],
                 "weapons": result, "summary": summary, "provenance": provenance}
    write_json(audit_dir / "excluded-weapon-rows.json", exclusions)
    write_json(audit_dir / "reference-conflicts.json", conflicts)
    write_json(audit_dir / "custom-configurations.json", custom_audit)
    write_json(audit_dir / "skill-table-rows.json", tables)
    write_json(audit_dir / "attach-effect-table-rows.json", attached)
    write_json(audit_dir / "attach-effect-definitions.json", [{"row": r, "nameEvidence": effect_names.get(r["attachTextId"], [])} for r in effect_definitions])
    write_json(audit_dir / "included-source-rows.json", [{"row": r, "nameEvidence": weapon_names[r["id"]]} for r in weapons if r["id"] in included])
    write_json(audit_dir / "skill-name-evidence.json", art_names)
    write_json(audit_dir / "resolved-skill-pools.json", skill_pools)
    write_json(audit_dir / "summary.json", summary)
    return catalogue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--paramdex", type=Path, default=DEFAULT_PARAMDEX)
    parser.add_argument("--output", type=Path, default=ROOT / "public/weapon-catalog.json")
    parser.add_argument("--audit-dir", type=Path, default=DEFAULT_AUDIT)
    args = parser.parse_args()
    catalogue = build(args.source_root, args.paramdex, args.audit_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(catalogue["summary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
