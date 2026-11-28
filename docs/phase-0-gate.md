# Phase 0 gate

**Gate:** the web app and the Blender model agree on pose and numbers, and it runs smoothly on your phone.

Checked on build v0.11 (the final Phase 0 build), 27 Nov 2026.

## 1. Pose: matches Blender ✅

`tests/compare_pose_with_blender.py` poses `blender/arm_twist_right.blend` and the web app with the same slider values and compares the hand and finger joints.

| Pose (raise, swing, turn, elbow, pronation) | Worst difference |
|---|---|
| -85, 0, 0, 90, 0 (start) | 0.06 mm |
| -85, 0, 0, 90, 80 (top of the lift) | 0.04 mm |
| -55, 30, 20, 60, -40 | 0.06 mm |
| 0, -30, 60, 120, 45 | 0.08 mm |

## 2. Drawings: match Blender ✅

`tests/compare_overlays_with_blender.py` compares where the twist axis, moment arm, tension and pull arrows sit, at elbow 90° and 60°: worst difference 0.05 mm, and the forearm tilt is +29.9° in both.

## 3. The lift: matches Blender frame by frame ✅

`tests/compare_lift_with_blender.py`, frames 1, 20, 28, 43, 70 and 109: the hand angle and the real plate rise are identical in both (top of the lift: 80° palm-down, 1.047 in real rise, drawn as 2.000 in).

## 4. Numbers: all correct ✅

- `npm run report`: 15 of 15 hand-checked cases match (0.7-physics-report.md has the full table). Example: 50 lb at 0.75 in gives 37.5 in·lb; a 30° forearm tilt gives 32.5 in·lb.
- `npm test`: 78 of 78 tests pass. CI runs both on every PR.

## 5. Compression kept the arm intact ✅

`web/scripts/check-compression.mjs` compares the original and the compressed model in the rest pose:

- same 21 bones, in the same order
- same 86,188 vertices
- skin moved at most 0.37 mm (about a hair's width), 0.03 mm on average

## 6. Phone: speed ✅ measured / smoothness ⏳ your check

| | v0.10 | v0.11 |
|---|---|---|
| Arm model download | 5.87 MB | **0.69 MB** (8.5× smaller) |
| On a 10 Mbit/s phone connection | about 4.7 s | **about 0.6 s** |
| App code (gzipped) | 161 KB | 168 KB (+ Meshopt decoder) |
| Redraws when nothing moves | 60 a second | **none** (render on demand) |
| Shadow map on phones | 2048² | 1024² (¼ of the work) |
| Arc drawing during the lift | rebuilt every frame | reused (the arm doesn't move it) |
| Live numbers card during the lift | rebuilt every frame | only when a shown value changes |

The cloud test machine has no GPU, so it can't measure frame rate. **The last box is yours:** open the private page on your phone, and the gate passes if:

1. the arm appears within about 3 seconds
2. dragging, zooming and the view buttons feel smooth
3. Play lift runs without stutter

## Known, for later phases (not gate blockers)

- On a narrow phone the Live numbers card overlaps the top of the arm in the start view. A collapsible card belongs with the Phase 1 layout work.
