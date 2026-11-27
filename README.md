# Armwrestling Science 3D

A browser-based 3D teaching tool that shows how armwrestling works and the science behind every move and training lift.

Project plan and increment tracker live in two Claude docs (Project Plan, Development Phases). Each increment arrives as its own pull request; merging it means the increment is approved, and the version table below records it (`v0.1`, `v0.2`, ...).

## Layout

| Folder | What's in it |
| --- | --- |
| `blender/` | Source `.blend` files (the arm model and rig) |
| `blender/scripts/` | Blender scripts: `build_arm.py` (original arm builder), `pronation_lift.py` (lift animation + sidebar panel, works for left or right arm, with or without twist bones), `make_right_arm.py` (mirrors a left-arm file into a right arm), `add_twist_bones.py` (adds forearm twist bones and re-weights the skin) |
| `docs/increments/` | Review images for each increment |
| `models/` | Exported `.glb` files used by the web app |

## Versions

| Version | Increment | What changed |
| --- | --- | --- |
| v0.1 | 0.1 | Right arm exported to `models/arm_right.glb` (skin, 18-bone rig, weights, fist start pose) |
| v0.2 (in review) | 0.2 | Three forearm twist bones (`forearm_twist.01-03`) at 33%, 66%, 95% of the forearm, taking that share of the hand's twist; `blender/arm_twist_right.blend`; `models/arm_right.glb` now has 21 bones |

### Twist rule for the web app

Pronation or supination is set on the hand bone's Y rotation. Each twist bone gets the same Y rotation times its share: `forearm_twist.01` 0.33, `.02` 0.66, `.03` 0.95. The forearm bone itself does not twist. Blender does this with drivers; glTF does not export drivers, so the app applies the rule in code.
