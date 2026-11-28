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
| `web/` | The web app: Three.js + TypeScript, built with Vite |

## Versions

| Version | Increment | What changed |
| --- | --- | --- |
| v0.1 | 0.1 | Right arm exported to `models/arm_right.glb` (skin, 18-bone rig, weights, fist start pose) |
| v0.2 (in review) | 0.2 | Three forearm twist bones (`forearm_twist.01-03`) at 33%, 66%, 95% of the forearm, taking that share of the hand's twist; `blender/arm_twist_right.blend`; `models/arm_right.glb` now has 21 bones |
| v0.3 | 0.3 | First web page: empty Three.js scene with floor, grid and lights, sized to any screen ([private link](https://claude.ai/artifact/4mwZcCaWTDndTWqE9m7pLi)) |
| v0.4 | 0.4 | Right arm loaded on the stage at table height (elbow 0.72 m), shadows on, orbit controls: drag to rotate, pinch or scroll to zoom, two fingers or right-drag to pan |
| v0.5 | 0.5 | Pose sliders using the Blender rig's channels and limits (shoulder X/Y/Z, elbow, forearm turn with twist bones); web and Blender agree within 0.08 mm (`tests/compare_pose_with_blender.py`). Fixes 0.4's elbow height: bones are now found by their Blender names |
| v0.6 | 0.6 | Camera buttons: Start view, Your eyes (behind your shoulder, down the forearm), Fingertips (end-on), Side; each follows the current pose; smooth glide (off with reduced motion); double-tap or double-click resets to Start view |
| v0.7 | 0.7 | Physics engine `web/src/physics.ts` (torque about an axis, moment arm, forearm tilt, pull across the forearm, strap modes, plate rise, strap tension, joint torque) with 58 automated tests against our notes; report in `docs/increments/0.7-physics-report.md`; tests run on every pull request |
| v0.8 | 0.8 | Lift overlays on the arm (no text yet): purple twist axis (radial head to ulnar head), amber moment arm, red strap tension, orange pull across the forearm, teal torque arc. Built by `web/src/liftGeometry.ts` from the bones and the physics engine; within 0.06 mm of Blender's at elbow 90° and 60° (`tests/compare_overlays_with_blender.py`) |
| v0.9 | 0.9 | Labels on the drawings (twist axis, moment arm, tension, pull across forearm, torque) and a Live numbers card (elbow angle, forearm tilt, load, pull across forearm, moment arm, torque in in·lb and lb·ft). Matches Blender's readouts at elbow 90° and 60° (37.5 in·lb; 43.35 lb and 32.51 in·lb). Views now frame the arrows too |
| v0.10 (in review) | 0.10 | Strap loop (rides on the hand), strap, loading pin and plate, and the pronation lift with a Play lift button: same timeline as the Blender lift (4.5 s: hold, turn 80° palm-down, hold, lower, hold). Plate drawn rising 2 in at the top (×1.9 the real 1.05 in, so it's easy to see); every number stays real. Matches Blender frame by frame (`tests/compare_lift_with_blender.py`) |

### Twist rule for the web app

Pronation or supination is set on the hand bone's Y rotation. Each twist bone gets the same Y rotation times its share: `forearm_twist.01` 0.33, `.02` 0.66, `.03` 0.95. The forearm bone itself does not twist. Blender does this with drivers; glTF does not export drivers, so the app applies the rule in code.

## Running the web app

```bash
cd web
npm install
npm run dev      # local preview at http://localhost:5173
npm run build    # static files in web/dist, ready to host
npm test         # physics tests (vitest)
npm run report   # physics numbers next to our notes, as a Markdown table
```

`npm run dev` and `npm run build` first copy `models/*.glb` into `web/public/models/` (generated, not committed).

### Publishing to the claude.ai page

claude.ai pages can't serve `.glb` files as page files, so the model is uploaded to the page as an asset and the build is pointed at it:

```bash
VITE_ARM_URL=/_blob/<asset id> npm run build
```

Then publish `dist/index.html` and `dist/assets/*` (not `dist/models/`). Current asset id for `arm_right.glb`: `471f1b05c6d31d46aa8c897b76c342db`. A changed model needs a new upload and a new id.
