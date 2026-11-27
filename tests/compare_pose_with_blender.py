"""
Check that the web app poses the arm exactly like the Blender rig.

1. Build and serve the web app (cd web && npm run build && python3 -m http.server -d dist 8765).
2. For each pose, open  http://127.0.0.1:8765/index.html?pose=RAISE,SWING,TURN,ELBOW,PRONATION
   (degrees, the same numbers as the sliders) in headless Chrome with --dump-dom and save the
   JSON in <body data-debug="..."> to tests/out/web_<pose>.json.
3. Run this file with Blender's Python (blender -b --python tests/compare_pose_with_blender.py,
   or python3 with the bpy module). It applies the same poses to blender/arm_twist_right.blend
   and prints the largest position difference per pose, in millimetres.

Increment 0.5 result: worst difference 0.08 mm across the four poses below.
"""
import json, math, os
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, '..', 'blender', 'arm_twist_right.blend')
POSES = ["-85,0,0,90,0", "-85,0,0,90,80", "-55,30,20,60,-40", "0,-30,60,120,45"]
POINTS = ('hand', 'index.01', 'index.03', 'thumb.03', 'pinky.01')

bpy.ops.wm.open_mainfile(filepath=BLEND)
rig = bpy.data.objects['Arm_Rig']
if rig.animation_data:
    rig.animation_data.action = None
M, R = rig.matrix_world, math.radians
for P in POSES:
    raise_, swing, turn, elbow, pron = map(float, P.split(','))
    rig.pose.bones['upper_arm.R'].rotation_euler = (R(raise_), R(swing), R(turn))
    rig.pose.bones['forearm.R'].rotation_euler = (0, 0, R(elbow))
    rig.pose.bones['hand.R'].rotation_euler = (0, R(-pron), 0)
    bpy.context.view_layer.update()
    origin = M @ rig.pose.bones['forearm.R'].head
    web = json.load(open(os.path.join(HERE, 'out', f'web_{P}.json')))
    worst = max(math.dist(tuple(M @ rig.pose.bones[n + '.R'].head - origin), web[n]) for n in POINTS)
    print(f'{P:20s} worst difference {worst * 1000:.2f} mm')
