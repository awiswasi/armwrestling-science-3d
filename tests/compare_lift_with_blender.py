"""
Compare the web app's pronation lift with the Blender lift, frame by frame.

1. Serve the built web app and, for each frame below, open
   http://127.0.0.1:8765/index.html?frame=N in headless Chrome with --dump-dom; save the JSON in
   <body data-lift="..."> to tests/out/lift_frame_N.json.
2. Run this file with Blender's Python. It reads the lift keyframes in blender/arm_twist_right.blend.

Increment 0.10 result: hand turn and real plate rise identical at every frame (to 0.001° and
0.0001 in); the drawn plate rises exactly 2.0 in at the top, in proportion with the real rise.
"""
import json, math, os
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, '..', 'blender', 'arm_twist_right.blend'))
s = bpy.context.scene
rig, pin = bpy.data.objects['Arm_Rig'], bpy.data.objects['Lift_LoadingPin']
s.frame_set(1)
z0 = pin.matrix_world.translation.z
web = {F: json.load(open(os.path.join(HERE, 'out', f'lift_frame_{F}.json'))) for F in (1, 20, 28, 43, 70, 109)}
for F, w in web.items():
    s.frame_set(F)
    hand_y = math.degrees(rig.pose.bones['hand.R'].rotation_euler[1])
    rise = (pin.matrix_world.translation.z - z0) / 0.0254
    drawn = (w['pinTop'] - web[1]['pinTop']) / 0.0254
    print(f"frame {F:3d}: hand Y {hand_y:7.2f} vs {w['handY']:7.2f} | real rise {rise:.3f} vs {w['realRiseIn']:.3f} in"
          f" | drawn {drawn:.3f} in (target {w['shownRiseIn']:.3f})")
