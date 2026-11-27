# Compares the web app's lift overlays with the ones Blender's pronation_lift.py draws.
# Needs tests/out/ov_<pose>.json from the web test mode (?pose=...), same as compare_pose_with_blender.py.
# Increment 0.8 result: worst difference 0.06 mm at elbow 90° and 60°.
import bpy, json, math, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'blender', 'arm_twist_right.blend'))
src = open(os.path.join(ROOT, 'blender', 'scripts', 'pronation_lift.py')).read()
g = {"__name__": "lift", "__file__": "pronation_lift.py"}
exec(compile(src, "pronation_lift.py", "exec"), g)
s = bpy.context.scene; r = bpy.data.objects['Arm_Rig']

def verts(name):
    o = bpy.data.objects[name]; dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg)
    return [ev.matrix_world @ v.co for v in ev.data.vertices]

def ends(name):
    vs = verts(name)
    a = max(vs, key=lambda v: (v - vs[0]).length); b = max(vs, key=lambda v: (v - a).length)
    d = (b - a).normalized(); pr = [v.dot(d) for v in vs]; lo, hi = min(pr), max(pr)
    low = [v for v, p in zip(vs, pr) if p < lo + 2e-4]; high = [v for v, p in zip(vs, pr) if p > hi - 2e-4]
    c = lambda L: sum(L, Vector()) / len(L)
    return c(low), c(high)

def compare(elbow_deg, P):
    s.pronation_lift.elbow_deg = elbow_deg          # rebuilds the lift in Blender
    s.frame_set(1); bpy.context.view_layer.update()
    origin = r.matrix_world @ r.pose.bones['forearm.R'].head
    web = json.load(open(os.path.join(OUT, f'ov_{P}.json')))
    W = lambda k: Vector(web[k])
    foot = bpy.data.objects['Lift_Strap'].location - Vector((0, 0, 0.012))
    pts = {'armEnd': foot}
    for obj, (k0, k1) in (('Lift_TwistAxis', ('axisStart', 'axisEnd')), ('Lift_TensionArrow', ('tensionStart', 'tensionEnd')),
                          ('Lift_PullArrow', ('pullStart', 'pullEnd'))):
        e0, e1 = ends(obj)
        # match each end to the nearer web point
        if (e0 - origin - W(k0)).length + (e1 - origin - W(k1)).length > (e1 - origin - W(k0)).length + (e0 - origin - W(k1)).length:
            e0, e1 = e1, e0
        pts[k0], pts[k1] = e0, e1
    worst = 0
    for k, p in pts.items():
        d = ((p - origin) - W(k)).length; worst = max(worst, d)
        print(f'  {k:13s} Blender {tuple(round(v,4) for v in (p - origin))}  web {tuple(web[k])}  diff {d*1000:.2f} mm')
    print(f'elbow {elbow_deg}: Blender tilt {s.pronation_lift.tilt_deg:+.1f}, web tilt {web["tilt"][0]:+.1f}; worst {worst*1000:.2f} mm')

compare(90, "-85,0,0,90,0")
compare(60, "-85,0,0,120,0")
