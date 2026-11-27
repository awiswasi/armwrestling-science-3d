# Armwrestling Science 3D

A browser-based 3D teaching tool that shows how armwrestling works and the science behind every move and training lift.

Project plan and increment tracker live in two Claude docs (Project Plan, Development Phases). Each approved increment is saved here as a numbered version tag (`v0.1`, `v0.2`, ...).

## Layout

| Folder | What's in it |
| --- | --- |
| `blender/` | Source `.blend` files (the arm model and rig) |
| `blender/scripts/` | Blender scripts: `build_arm.py` (original arm builder), `pronation_lift.py` (lift animation + sidebar panel, works for left or right arm), `make_right_arm.py` (mirrors a left-arm file into a right arm) |
| `models/` | Exported `.glb` files used by the web app |

## Versions

| Version | Increment | What changed |
| --- | --- | --- |
| v0.1 | 0.1 | Right arm exported to `models/arm_right.glb` (skin, 18-bone rig, weights, fist start pose) |
