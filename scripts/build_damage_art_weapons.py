"""Build weapon choices for the shared Double Slash and Flaming Strike attack routes."""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ARTS = {"112": "9080000", "214": "9010500"}
STATUS = {"blood": ("出血", "bleed"), "poizon": ("中毒", "poison"), "disease": ("腐败", "rot"),
          "freeze": ("冻伤", "frost"), "sleep": ("催眠", "sleep"), "madness": ("发狂", "madness")}


def build(source):
    hashes = {}

    def table(name):
        path = source / (name + ".param.xml")
        hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
        root = ET.parse(path).getroot()
        defaults = {f.get("name"): f.get("defaultValue") for f in root.find("fields")}
        return ({**defaults, **r.attrib} for r in root.find("rows"))

    def catalog(name):
        return json.loads((PUBLIC / (name + ".json")).read_text("utf8"))

    def by_id(name):
        return {r["id"]: r for r in table(name)}

    actions = catalog("damage-actions")
    panels = catalog("damage-panel")["variants"]
    images = catalog("weapon-image-manifest")["images"]
    weapons = by_id("EquipParamWeapon")
    behaviors = by_id("BehaviorParam_PC")
    upgrades = by_id("ReinforceParamWeapon")
    effects = by_id("SpEffectParam")
    arts = by_id("SwordArtsParam")
    for name in ["EquipParamWeapon", "BehaviorParam_PC", "SwordArtsParam", "ReinforceParamWeapon", "SpEffectParam"]:
        assert hashes[name] == actions["provenance"]["paramsSha256"][name], name

    # Verify that every releasing judge in these exact TAE branches resolves to
    # shared BehaviorParam_PC, including the known missing reference in Flaming Strike.
    routes = {}
    for art in ARTS:
        branches = [a for a in actions["actions"] if a.get("artId") == art and a.get("coverage") == "six-preview-weapon-native-release-chain"]
        assert len(branches) == 2 and all(any(s["rates"] for s in a["segments"]) for a in branches)
        for a in branches:
            for s in a["segments"]:
                evidence = s["evidence"]
                if "tae" not in evidence:
                    assert s.get("conditional") and not s["rates"]
                    continue
                judge = struct.unpack_from("<i", bytes.fromhex(evidence["tae"]["rawHex"]), 8)[0]
                assert 3000 <= judge < 3900
                b = behaviors[str(300000000 + judge - 3000)]
                assert int(b["variationId"]) == 0 and int(b["behaviorJudgeId"]) == judge - 3000
                assert all(int(b[k]) == evidence["behavior"][k] for k in ["id", "refType", "refId"])
        routes[art] = [a["id"] for a in branches]

    sources = {}
    for r in table("ItemTableParam"):
        if r["itemCategory"] == "6" and int(r["chanceWeight"]) > 0 and int(r["quantity"]) > 0:
            sources.setdefault(r["itemId"], "ItemTableParam:" + r["id"])
    for name in ["ItemLotParam_map", "ItemLotParam_enemy"]:
        for r in table(name):
            for i in range(1, 9):
                suffix = f"{i:02}"
                if r["lotItemCategory" + suffix] == "6" and int(r["lotItemBasePoint" + suffix]) > 0 and int(r["lotItemNum" + suffix]) > 0:
                    sources.setdefault(r["lotItemId" + suffix], f"{name}:{r['id']}:{suffix}")
    pools = defaultdict(set)
    for r in table("SwordArtsTableParam"):
        if int(r["chanceWeight"]) > 0 and r["swordArtsId"] in ARTS:
            pools[r["id"]].add(r["swordArtsId"])
    drops = {}
    for r in table("EquipParamCustomWeapon"):
        if r["id"] in sources and r["isCursed"] == "0":
            for art in pools[r["swordArtsTableId"]]:
                drops.setdefault((r["targetWeaponId"], art), [r["id"], r["swordArtsTableId"], sources[r["id"]]])

    choices = []
    bullet_upgrades = {}
    for w in catalog("weapon-catalog")["weapons"]:
        for art, exemplar in ARTS.items():
            drop = drops.get((w["id"], art))
            if not drop:
                continue
            # SwordArtsParam.defaultWepAttr 0 uses the granted base weapon.
            # For 5 use its recorded fire affinity sibling in the same origin family.
            affinity = arts[art]["defaultWepAttr"]
            assert affinity == ("5" if art == "214" else "0")
            for v in w["variants"]:
                vid = v["id"]
                raw = weapons[vid]
                if affinity == "0" and vid != w["id"]:
                    continue
                if affinity == "5" and not (raw["spAttribute"] == weapons[exemplar]["spAttribute"]
                        and int(raw["attackBaseFire"]) > 0 and int(vid) == int(w["id"]) + 500):
                    continue
                if art not in v["skill"]["itemIds"] or panels[vid]["unavailableReasons"]:
                    continue
                icon = images.get(str(v["iconId"])) or images.get(str(w["iconId"]))
                assert icon and icon["status"] == "verified"
                passives = [int(raw[f"spEffectBehaviorId{i}"]) for i in range(3) if int(raw[f"spEffectBehaviorId{i}"]) > 0]
                statuses = [{"name": name, "icon": f"/enemy-attribute-icons/status-{icon_id}.png"}
                            for key, (name, icon_id) in STATUS.items()
                            if any(int(effects[str(e)][key+"AttackPower"]) > 0 for e in passives)]
                choices.append(dict(artId=art, weaponId=w["id"], variantId=vid, name=v["name"],
                                    label=v["label"], weaponImage=icon["src"], statuses=statuses,
                                    variation=int(raw["behaviorVariationId"]), passiveIds=passives, drop=drop))
                if art == "214":
                    group = raw["reinforceTypeId"]
                    bullet_upgrades[group] = {str(i): {"reinforceRowId": int(group)+i,
                        "baseAtkRate": float(upgrades[str(int(group)+i)]["baseAtkRate"])} for i in panels[vid]["reinforcements"]}
    assert all(any(x["variantId"] == v and x["artId"] == a for x in choices) for a,v in ARTS.items())
    return {"routes": routes, "choices": choices, "bulletUpgrades": bullet_upgrades,
            "sourceHashes": hashes, "dropFields": ["customWeaponId", "swordArtsTableId", "positiveDropReference"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("E:/海斗/outputs/nightreign-data-20261109/strict/regulation-bin"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = build(args.source)
    path = PUBLIC / "damage-art-weapons.json"
    content = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.check:
        assert path.read_text("utf8") == content
    else:
        path.write_text(content, encoding="utf8")
    print({a:sum(c["artId"] == a for c in data["choices"]) for a in ARTS})
