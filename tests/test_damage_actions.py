"""Regression checks for native contact data and dangerous cross-family guesses."""
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class DamageActionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "public/damage-actions.json").read_text(encoding="utf-8"))
        cls.actions = {a["id"]: a for a in cls.data["actions"]}

    def test_straight_sword_real_branches(self):
        expected = {30000: (200000, 1.00, "normal"), 30505: (200100, 1.25, "thrust"),
                    30500: (200105, 1.60, "thrust"), 31030: (200150, 1.07, "normal")}
        for animation, (attack, rate, physical_type) in expected.items():
            action = self.actions[f"motion-23-variation-200-animation-{animation}"]
            segment = action["segments"][0]
            self.assertIn("2000000", action["weaponIds"])
            self.assertEqual(segment["evidence"]["atkParamId"], attack)
            self.assertEqual(segment["rates"]["physical"], rate)
            self.assertEqual(segment["physicalType"], physical_type)

    def test_six_skills_charge_per_input_and_not_per_hit(self):
        expected = {"1051": [11, 11, 11], "1177": [17, 9, 9], "112": [6, 3, 3],
                    "214": [4, 10], "1017": [10, 4], "1037": [17]}
        for action in self.actions.values():
            if action.get("artId") not in expected:
                continue
            costs = expected[action["artId"]]
            paid = action["scope"]["enoughFp"]
            self.assertEqual(action["fpCosts"], costs if paid else [0] * len(costs))
            self.assertEqual([event["eventType"] for event in action["fpConsumptionEvents"]],
                             [330] * len(costs) if paid else [])

    def test_shared_judge_does_not_select_skill_family(self):
        segment = self.actions["motion-20-variation-100-animation-32510"]["segments"][0]
        self.assertEqual(segment["evidence"]["atkParamId"], 100315)
        self.assertEqual(segment["evidence"]["behaviorRows"][0]["id"], 100100315)

    def test_special_weapon_not_given_base_straight_sword_moves(self):
        action = self.actions["motion-23-variation-200-animation-30505"]
        self.assertNotIn("2010000", action["weaponIds"])
        self.assertFalse(action["scope"]["heroMovesetOverrideActive"])

    def test_storm_ruler_is_not_square_off(self):
        storm = self.actions["art-1200-unresolved"]
        self.assertEqual(storm["artId"], "1200")
        self.assertTrue(all(s["rates"] is None and s["flat"] is None for s in storm["segments"]))
        square_off = self.actions["art-115-contact-300000700"]
        self.assertEqual(square_off["segments"][0]["rates"]["physical"], 2)
        self.assertNotEqual(storm["artId"], square_off["artId"])

    def test_double_slash_contacts_are_independently_preserved(self):
        action = self.actions["art-112-contact-300000170"]
        contacts = [s for s in action["segments"] if s.get("rates") is not None]
        self.assertEqual([s["rates"]["physical"] for s in contacts], [.92, 1.05, .84, .86, 1.15, 1.45])
        self.assertTrue(action["completeDamage"])
        self.assertEqual([s["evidence"]["tae"]["animationId"] for s in contacts], [40000, 40000, 40010, 40010, 40010, 40020])
        self.assertIn("art-115-contact-300000705", self.actions)

    def test_executor_charged_contacts_have_different_physical_types(self):
        action = self.actions["executor-cursed-sword-atk-960305"]
        self.assertEqual(action["weaponIds"], ["60700000", "60710000"])
        self.assertEqual([s["physicalType"] for s in action["segments"]], ["slash", "thrust"])
        self.assertEqual([s["rates"]["physical"] for s in action["segments"]], [1, 1.05])

    def test_subcategories_are_contact_specific(self):
        for action in self.actions.values():
            for segment in action["segments"]:
                raw = segment.get("evidence", {}).get("subcategories")
                if raw is None:
                    continue
                expected = {f"atkSubCategory:{v}" for v in raw.values() if v}
                actual = {t for t in segment["tags"] if t.startswith("atkSubCategory:")}
                self.assertEqual(actual, expected)
        charged = self.actions["motion-23-variation-200-animation-30500"]["segments"][0]
        uncharged = self.actions["motion-23-variation-200-animation-30505"]["segments"][0]
        self.assertIn("atkSubCategory:100", charged["tags"])
        self.assertNotIn("atkSubCategory:100", uncharged["tags"])

    def test_unresolved_bullets_do_not_silently_disappear(self):
        for action in self.actions.values():
            if any(e.get("type") == 2 for e in action.get("unresolvedEvents", [])):
                pending = [s for s in action["segments"] if s["id"] == "unresolved-bullet-effects"]
                self.assertEqual(len(pending), 1)
                self.assertIsNone(pending[0]["rates"])
                self.assertIsNone(pending[0]["flat"])
                self.assertFalse(action["completeDamage"])

    def test_six_preview_weapons_are_exactly_scoped(self):
        expected = {"1051": "19020000", "1177": "9040000", "112": "9080000",
                    "214": "9010500", "1017": "1070000", "1037": "1160000"}
        self.assertEqual(set(self.data["sixSkillCoverage"]), set(expected))
        for sid, wid in expected.items():
            records = [a for a in self.actions.values() if a.get("artId") == sid]
            self.assertTrue(records)
            self.assertTrue(all(a["weaponIds"] == [wid] for a in records))

    def test_ring_uses_actual_halo_scythe_not_swordarts_display_attack(self):
        action = self.actions["art-1051-native-chain"]
        attacks = [s["evidence"]["atkParamId"] for s in action["segments"]]
        self.assertNotIn(301604902, attacks)
        self.assertEqual(attacks, [301902900, 301902901, 301902910, 301902911, 301902920, 301902921])
        self.assertEqual(action["segments"][0]["rates"]["physical"], .55)
        projectile = action["segments"][1]
        self.assertEqual(projectile["manualChannels"], ["holy"])
        self.assertEqual(projectile["projectile"]["rawBaseComponents"]["holy"], 170)
        self.assertEqual(projectile["projectile"]["baseAtkRatesByReinforcement"]["0"]["baseAtkRate"], 1.5)
        self.assertFalse(projectile["evidence"]["hitBulletContinuation"]["countedAsAdditionalHits"])

    def test_manual_channels_only_exist_for_real_positive_projectile_components(self):
        for action in self.actions.values():
            for s in action["segments"]:
                if "manualChannels" not in s:
                    continue
                self.assertIn("projectile", s["tags"])
                self.assertIsNone(s["rates"])
                self.assertIsNone(s["flat"])
                expected = [ch for ch, value in s["projectile"]["rawBaseComponents"].items() if value > 0]
                self.assertEqual(s["manualChannels"], expected)

    def test_gold_blade_fp_release_excludes_no_fp_blade_contact(self):
        full = self.actions["art-1037-native-release"]
        empty = self.actions["art-1037-native-no-fp"]
        self.assertEqual(len(full["segments"]), 1)
        self.assertEqual(full["segments"][0]["manualChannels"], ["holy"])
        self.assertEqual(empty["segments"][0]["rates"]["physical"], 1.4)
        self.assertEqual(empty["segments"][0]["evidence"]["atkParamId"], 300116905)

    def test_glintstone_charge_and_followup_are_separate_real_segments(self):
        charged = self.actions["art-1017-native-charged-followup"]
        regular = self.actions["art-1017-native-release-followup"]
        self.assertEqual(charged["segments"][0]["projectile"]["rawBaseComponents"]["magic"], 190)
        self.assertEqual(regular["segments"][0]["projectile"]["rawBaseComponents"]["magic"], 155)
        self.assertEqual(charged["segments"][1]["rates"]["physical"], 1.7)
        self.assertEqual(charged["segments"][1]["physicalType"], "thrust")
        self.assertEqual(len(charged["nonDamageEvents"]), 2)

    def test_corpse_piler_windows_do_not_double_count_blade_and_blood(self):
        action = self.actions["art-1177-native-chain"]
        known = [s for s in action["segments"] if s["rates"] is not None]
        self.assertEqual([s["rates"]["physical"] for s in known], [.99, 1.02, .91, .93, 1.12, 1.62])
        self.assertTrue(all(s["hits"] == 1 and "攻击窗口" in s["name"] for s in known))
        self.assertTrue(all(s["evidence"]["weaponBehaviorVariationId"] == 906 for s in known))
        self.assertTrue(any(s["id"] == "corpse-piler-component-separation" for s in action["segments"]))
        self.assertFalse(action["completeDamage"])

    def test_flaming_strike_keeps_missing_bullet_and_enchantment_visible(self):
        action = self.actions["art-214-native-release-followup"]
        flame = next(s for s in action["segments"] if s.get("manualChannels"))
        self.assertEqual(flame["manualChannels"], ["fire"])
        self.assertEqual(flame["projectile"]["rawBaseComponents"]["fire"], 138)
        self.assertTrue(any(e.get("refId") == 2003 for e in action["unresolvedEvents"]))
        self.assertEqual({e["effectId"] for e in action["appliedWeaponEffects"]}, {1776, 1778})
        self.assertTrue(all(e["durationSeconds"] == 40 and e["additiveAttack"]["fire"] == 35 for e in action["appliedWeaponEffects"]))
        self.assertTrue(any(s["id"] == "flaming-strike-enchantment-addition" and s["rates"] is None for s in action["segments"]))
        self.assertFalse(action["completeDamage"])

    def test_stormcaller_native_bullet_chain_stays_unresolved_for_damage(self):
        action = self.actions["art-123-contact-300000640"]
        projectiles = [s for s in action["segments"] if s.get("calculationStatus") == "projectile-scaling-unresolved"]
        self.assertEqual(len(projectiles), 7)
        first = next(s for s in projectiles if s["evidence"]["atkParamId"] == 300000643)
        self.assertEqual(first["evidence"]["behaviorBulletReference"]["behaviorId"], 300000643)
        self.assertEqual(first["evidence"]["bullet"]["bulletId"], 2640)
        self.assertEqual(first["evidence"]["bullet"]["fields"]["atkId_Bullet"], 300000643)
        self.assertIsNone(first["rates"])
        self.assertIsNone(first["flat"])
        self.assertNotIn("weaponAttack", first["tags"])

    def test_weapon_attack_tag_requires_native_weapon_category_and_verified_attack(self):
        contact = self.actions["motion-23-variation-200-animation-30000"]["segments"][0]
        self.assertIn("weaponAttack", contact["tags"])
        for action in self.actions.values():
            for segment in action["segments"]:
                if "weaponAttack" in segment["tags"]:
                    self.assertIn(130, segment["evidence"]["subcategories"].values())
                    if "projectile" in segment["tags"]:
                        self.assertEqual(segment["calculationStatus"], "native-additive-projectile-estimate")
                        self.assertNotIn("melee", segment["tags"])
                    else:
                        self.assertIsNotNone(segment["rates"])

    def test_schema_and_unique_identities(self):
        self.assertEqual(len(self.actions), len(self.data["actions"]))
        for action in self.actions.values():
            self.assertEqual(len({s["id"] for s in action["segments"]}), len(action["segments"]))
            for segment in action["segments"]:
                self.assertIn(segment["physicalType"], (None, "normal", "slash", "strike", "thrust"))
                self.assertEqual(segment["hits"], 1)
                self.assertTrue(segment["source"])
                if segment["rates"] is not None:
                    self.assertEqual(set(segment["rates"]), {"physical", "magic", "fire", "lightning", "holy"})


if __name__ == "__main__":
    unittest.main()
