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
| v0.5 (in review) | 0.5 | Pose sliders using the Blender rig's channels and limits (shoulder X/Y/Z, elbow, forearm turn with twist bones); web and Blender agree within 0.08 mm (`tests/compare_pose_with_blender.py`). Fixes 0.4's elbow height: bones are now found by their Blender names |

### Twist rule for the web app

Pronation or supination is set on the hand bone's Y rotation. Each twist bone gets the same Y rotation times its share: `forearm_twist.01` 0.33, `.02` 0.66, `.03` 0.95. The forearm bone itself does not twist. Blender does this with drivers; glTF does not export drivers, so the app applies the rule in code.

## Running the web app

```bash
cd web
npm install
npm run dev      # local preview at http://localhost:5173
npm run build    # static files in web/dist, ready to host
```

`npm run dev` and `npm run build` first copy `models/*.glb` into `web/public/models/` (generated, not committed).

### Publishing to the claude.ai page

claude.ai pages can't serve `.glb` files as page files, so the model is uploaded to the page as an asset and the build is pointed at it:

```bash
VITE_ARM_URL=/_blob/<asset id> npm run build
```

Then publish `dist/index.html` and `dist/assets/*` (not `dist/models/`). Current asset id for `arm_right.glb`: `471f1b05c6d31d46aa8c897b76c342db`. A changed model needs a new upload and a new id.
