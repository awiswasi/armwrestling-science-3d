"""
Builds a human left arm (upper arm, elbow, forearm, hand with 5 fingers) in Blender,
plus an armature rigged with automatic weights so it can be posed.

Run inside Blender (Scripting tab > Run Script) or headless:
  blender -b arm.blend --python build_arm.py

Units are metres. The arm points along +X (T-pose), shoulder at the origin,
palm facing down (-Z), thumb pointing forward (-Y).
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

VOXEL = 0.0018      # remesh voxel size (smaller = finer, heavier mesh)
SEGS = 40           # vertices around each tube cross-section
SAMPLES = 10        # samples per control-point span along a tube


# ---------------------------------------------------------------- helpers
def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                  + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


def sample_curve(ctrl):
    """ctrl: list of (pos Vector, a, b, n). Returns dense list of same, smoothly interpolated."""
    pts = [c[0] for c in ctrl]
    vals = [Vector((c[1], c[2], c[3])) for c in ctrl]
    # phantom end points
    pts = [2 * pts[0] - pts[1]] + pts + [2 * pts[-1] - pts[-2]]
    vals = [2 * vals[0] - vals[1]] + vals + [2 * vals[-1] - vals[-2]]
    out = []
    for i in range(1, len(pts) - 2):
        for s in range(SAMPLES):
            t = s / SAMPLES
            p = catmull(pts[i - 1], pts[i], pts[i + 1], pts[i + 2], t)
            v = catmull(vals[i - 1], vals[i], vals[i + 1], vals[i + 2], t)
            out.append((p, v.x, v.y, max(v.z, 2.0)))
    v = vals[-2]
    out.append((pts[-2], v.x, v.y, v.z))
    return out


def superellipse(theta, a, b, n):
    c, s = math.cos(theta), math.sin(theta)
    x = a * math.copysign(abs(c) ** (2.0 / n), c)
    y = b * math.copysign(abs(s) ** (2.0 / n), s)
    return x, y


def loft(bm, ctrl, up=Vector((0, 0, 1)), cap_rings=8):
    """Closed tube along a smooth path with superellipse cross-sections and domed end caps.
    a = half-width (side axis), b = half-thickness (up axis)."""
    samples = sample_curve(ctrl)
    n = len(samples)
    frames = []
    for i, (p, a, b, e) in enumerate(samples):
        t = (samples[min(i + 1, n - 1)][0] - samples[max(i - 1, 0)][0]).normalized()
        u = (up - up.dot(t) * t).normalized()
        side = t.cross(u).normalized()
        frames.append((p, t, u, side, a, b, e))

    rings = []

    def ring(p, u, side, a, b, e):
        vs = []
        for k in range(SEGS):
            th = 2 * math.pi * k / SEGS
            x, y = superellipse(th, a, b, e)
            vs.append(bm.verts.new(p + side * x + u * y))
        return vs

    # start cap (dome going backwards)
    p, t, u, side, a, b, e = frames[0]
    depth = min(a, b)
    start_tip = None
    for k in range(cap_rings, 0, -1):
        th = (k / cap_rings) * (math.pi / 2)
        if k == cap_rings:
            start_tip = bm.verts.new(p - t * depth)
            continue
        rings.append(ring(p - t * depth * math.sin(th), u, side,
                          a * math.cos(th), b * math.cos(th), e))
    for (p, t, u, side, a, b, e) in frames:
        rings.append(ring(p, u, side, a, b, e))
    p, t, u, side, a, b, e = frames[-1]
    depth = min(a, b)
    end_tip = None
    for k in range(1, cap_rings + 1):
        th = (k / cap_rings) * (math.pi / 2)
        if k == cap_rings:
            end_tip = bm.verts.new(p + t * depth)
            continue
        rings.append(ring(p + t * depth * math.sin(th), u, side,
                          a * math.cos(th), b * math.cos(th), e))

    for r0, r1 in zip(rings[:-1], rings[1:]):
        for k in range(SEGS):
            bm.faces.new((r0[k], r0[(k + 1) % SEGS], r1[(k + 1) % SEGS], r1[k]))
    first, last = rings[0], rings[-1]
    for k in range(SEGS):
        bm.faces.new((start_tip, first[(k + 1) % SEGS], first[k]))
        bm.faces.new((end_tip, last[k], last[(k + 1) % SEGS]))


def V(x, y, z=0.0):
    return Vector((x, y, z))


# ---------------------------------------------------------------- anatomy
# Arm + palm: one tube along X. (pos, half-width Y, half-thickness Z, squareness)
ARM = [
    (V(-0.020, 0, 0.000), 0.054, 0.056, 2.0),   # shoulder (domed cut)
    (V(0.020, 0, 0.002), 0.056, 0.054, 2.0),   # deltoid
    (V(0.080, 0, 0.000), 0.050, 0.047, 2.0),
    (V(0.150, 0, 0.000), 0.047, 0.043, 2.0),   # biceps / triceps
    (V(0.230, 0, 0.000), 0.041, 0.039, 2.0),
    (V(0.295, 0, 0.002), 0.037, 0.039, 2.0),   # elbow
    (V(0.340, 0, 0.002), 0.043, 0.040, 2.0),   # forearm muscles
    (V(0.410, 0, 0.000), 0.040, 0.035, 2.0),
    (V(0.490, 0, 0.000), 0.032, 0.025, 2.2),
    (V(0.555, 0, 0.000), 0.028, 0.0185, 2.5),  # wrist
    (V(0.585, 0, -0.001), 0.034, 0.0175, 3.0),  # heel of palm
    (V(0.620, 0, 0.000), 0.040, 0.0160, 3.3),
    (V(0.646, 0, 0.001), 0.037, 0.0125, 3.0),  # just behind the knuckles
]
WRIST = Vector((0.555, 0, 0))

# Fingers: knuckle position, spread angle (deg, + toward +Y), segment lengths,
# radii at (base, MCP, PIP, DIP, tip), curl per joint (deg)
FINGERS = {
    "index":  dict(k=V(0.655, -0.0275, 0.002), spread=-8,  L=(0.046, 0.027, 0.019),
                   r=(0.0100, 0.0092, 0.0084, 0.0076, 0.0068), curl=(6, 12, 8)),
    "middle": dict(k=V(0.659, -0.0090, 0.002), spread=-2,  L=(0.050, 0.031, 0.020),
                   r=(0.0102, 0.0094, 0.0086, 0.0078, 0.0070), curl=(6, 12, 8)),
    "ring":   dict(k=V(0.655, 0.0090, 0.002),  spread=4,   L=(0.047, 0.029, 0.019),
                   r=(0.0098, 0.0089, 0.0081, 0.0074, 0.0066), curl=(7, 14, 9)),
    "pinky":  dict(k=V(0.645, 0.0260, 0.001),  spread=11,  L=(0.037, 0.022, 0.017),
                   r=(0.0088, 0.0079, 0.0072, 0.0066, 0.0060), curl=(8, 16, 10)),
}
# Thumb: explicit joint chain CMC -> MCP -> IP -> tip
THUMB_PTS = [V(0.580, -0.021, -0.006), V(0.611, -0.041, -0.019),
             V(0.640, -0.051, -0.025), V(0.666, -0.056, -0.028)]
THUMB_R = [(0.0165, 0.0135), (0.0118, 0.0108), (0.0108, 0.0100), (0.0098, 0.0090), (0.0090, 0.0082)]


def finger_joints(f):
    d0 = Matrix.Rotation(math.radians(f["spread"]), 3, 'Z') @ Vector((1, 0, 0))
    side = Vector((0, 0, 1)).cross(d0).normalized()
    pts = [f["k"].copy()]
    d = d0.copy()
    for L, c in zip(f["L"], f["curl"]):
        d = Matrix.Rotation(math.radians(c), 3, side) @ d
        pts.append(pts[-1] + d * L)
    return pts, d0


# ---------------------------------------------------------------- build mesh
def build_mesh():
    bm = bmesh.new()
    loft(bm, ARM)

    joints = {}
    for name, f in FINGERS.items():
        pts, d0 = finger_joints(f)
        joints[name] = pts
        base = pts[0] - d0 * 0.018           # root buried inside the palm
        r = f["r"]
        ctrl = [(base, r[0] * 1.05, r[0] * 0.95, 2.0)]
        mids = [pts[0].lerp(pts[1], 0.5), pts[1].lerp(pts[2], 0.5), pts[2].lerp(pts[3], 0.45)]
        ctrl.append((pts[0], r[1] * 1.05, r[1] * 0.98, 2.0))              # MCP knuckle
        ctrl.append((mids[0], r[1] * 0.93, r[1] * 0.88, 2.1))
        ctrl.append((pts[1], r[2] * 1.03, r[2] * 0.95, 2.0))              # PIP
        ctrl.append((mids[1], r[2] * 0.92, r[2] * 0.86, 2.1))
        ctrl.append((pts[2], r[3] * 1.02, r[3] * 0.92, 2.0))              # DIP
        ctrl.append((mids[2], r[4] * 1.02, r[4] * 0.88, 2.1))
        tip = pts[3] - (pts[3] - pts[2]).normalized() * r[4] * 0.8
        ctrl.append((tip, r[4], r[4] * 0.82, 2.2))                        # pad / nail
        loft(bm, ctrl)

    # thumb
    tp = THUMB_PTS
    tdir = (tp[1] - tp[0]).normalized()
    ctrl = [(tp[0] - tdir * 0.012, THUMB_R[0][0], THUMB_R[0][1], 2.0),
            (tp[0].lerp(tp[1], 0.45), THUMB_R[0][0] * 0.95, THUMB_R[0][1] * 0.95, 2.0),
            (tp[1], THUMB_R[1][0], THUMB_R[1][1], 2.0),
            (tp[1].lerp(tp[2], 0.5), THUMB_R[2][0], THUMB_R[2][1], 2.0),
            (tp[2], THUMB_R[3][0], THUMB_R[3][1], 2.0),
            (tp[3] - (tp[3] - tp[2]).normalized() * 0.007, THUMB_R[4][0], THUMB_R[4][1], 2.2)]
    loft(bm, ctrl, up=Vector((0, 0.5, 1)).normalized())
    joints["thumb"] = tp

    me = bpy.data.meshes.new("Arm_parts")
    bm.to_mesh(me)
    bm.free()
    return me, joints


def remesh_object(obj):
    mod = obj.modifiers.new("Remesh", 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = VOXEL
    mod.adaptivity = 0.0
    sm = obj.modifiers.new("Smooth", 'SMOOTH')
    sm.factor = 0.5
    sm.iterations = 4
    dg = bpy.context.evaluated_depsgraph_get()
    new_me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = new_me
    bpy.data.meshes.remove(old)
    new_me.name = "Arm"
    for p in new_me.polygons:
        p.use_smooth = True


def skin_material():
    mat = bpy.data.materials.get("Skin") or bpy.data.materials.new("Skin")
    try:
        mat.use_nodes = True
    except Exception:
        pass
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.80, 0.56, 0.45, 1)
        bsdf.inputs["Roughness"].default_value = 0.45
        for key in ("Subsurface Weight", "Subsurface"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = 0.15
                break
        if "Subsurface Radius" in bsdf.inputs:
            bsdf.inputs["Subsurface Radius"].default_value = (0.012, 0.004, 0.0025)
    mat.diffuse_color = (0.80, 0.56, 0.45, 1)
    return mat


# ---------------------------------------------------------------- armature
def build_armature(joints):
    arm_data = bpy.data.armatures.new("Arm_Rig")
    rig = bpy.data.objects.new("Arm_Rig", arm_data)
    bpy.context.collection.objects.link(rig)
    rig.show_in_front = True
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    zup = Vector((0, 0, 1))

    def bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head, b.tail = head, tail
        b.align_roll(zup)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    bone("upper_arm.L", V(0, 0, 0), V(0.295, 0, 0.002))
    bone("forearm.L", V(0.295, 0, 0.002), WRIST.copy(), "upper_arm.L", True)
    bone("hand.L", WRIST.copy(), V(0.625, 0, 0), "forearm.L", True)
    for name in ("thumb", "index", "middle", "ring", "pinky"):
        pts = joints[name]
        prev = "hand.L"
        for i in range(3):
            bn = f"{name}.{i + 1:02d}.L"
            bone(bn, pts[i], pts[i + 1], prev, i > 0)
            prev = bn
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


# ---------------------------------------------------------------- joint limits
# Degrees, in each bone's own (local) axes. None = axis locked (can't rotate).
#   upper_arm X: + raise / - lower      Z: - forward / + back     Y: twist
#   forearm   Z: - bends elbow (natural direction only)
#   hand      X: + back of hand up / - toward palm   Z: - thumb side / + pinky side   Y: twist
#   fingers   X: - curls toward palm    (.01 also spreads on Z)
#   thumb     X: - moves under palm     Z: + toward index finger
FINGER_LIMITS = {
    1: dict(x=(-90, 20), y=None, z=(-20, 20)),
    2: dict(x=(-105, 0), y=None, z=None),
    3: dict(x=(-80, 5), y=None, z=None),
}
LIMITS = {
    "upper_arm.L": dict(x=(-85, 95), y=(-80, 80), z=(-100, 40)),
    "forearm.L":   dict(x=None, y=None, z=(-150, 0)),
    "hand.L":      dict(x=(-75, 70), y=(-80, 80), z=(-20, 35)),
    "thumb.01.L":  dict(x=(-40, 20), y=(-30, 30), z=(-20, 50)),
    "thumb.02.L":  dict(x=(-60, 10), y=None, z=None),
    "thumb.03.L":  dict(x=(-80, 15), y=None, z=None),
}
for _f in ("index", "middle", "ring", "pinky"):
    for _i, _lim in FINGER_LIMITS.items():
        LIMITS[f"{_f}.{_i:02d}.L"] = _lim


def add_limits(rig):
    """XYZ Euler rotation on every bone, locked location, locked unused axes,
    and a Limit Rotation constraint that also clamps the rotate tool / N-panel."""
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
        pb.lock_location = (True, True, True)
        lim = LIMITS.get(pb.name)
        if not lim:
            continue
        for c in [c for c in pb.constraints if c.type == 'LIMIT_ROTATION']:
            pb.constraints.remove(c)
        con = pb.constraints.new('LIMIT_ROTATION')
        con.name = "Joint limits"
        con.owner_space = 'LOCAL'
        con.use_transform_limit = True     # "Affect Transform": clamps while you rotate
        lock = []
        for ax in "xyz":
            rng = lim[ax] or (0, 0)
            setattr(con, f"use_limit_{ax}", True)
            setattr(con, f"min_{ax}", math.radians(rng[0]))
            setattr(con, f"max_{ax}", math.radians(rng[1]))
            lock.append(lim[ax] is None)
        pb.lock_rotation = lock


# ---------------------------------------------------------------- main
def main():
    for name in ("Arm", "Arm_Rig"):
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)

    me, joints = build_mesh()
    obj = bpy.data.objects.new("Arm", me)
    bpy.context.collection.objects.link(obj)
    remesh_object(obj)
    obj.data.materials.append(skin_material())

    rig = build_armature(joints)

    # automatic weights
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    add_limits(rig)
    print("ARM verts:", len(obj.data.vertices), "faces:", len(obj.data.polygons),
          "vgroups:", len(obj.vertex_groups))


if __name__ == "__main__":
    main()
