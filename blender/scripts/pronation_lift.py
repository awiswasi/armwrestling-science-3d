"""
Pronation lift animation + one-click UI for the Arm_Rig built by build_arm.py.
Works with a left arm (bones named ".L") or a right arm (".R").

How to use (Blender 4.2+ / 5.x):
  1. Open your .blend, go to the Scripting tab, open this file and press Run Script.
  2. In the 3D Viewport press N to open the sidebar and pick the "Pronation" tab.
  3. Press "Play lift". The arm starts thumb-up, pronates to palm-down while the
     strap winds onto the hand and lifts the plate, holds, then lowers it.

What the panel adds:
  - Forces: the twist axis (radial head -> ulnar head), the moment arm, strap tension,
    the part of the pull that crosses the forearm, and the pronation torque, with labels.
  - See-through skin: makes the skin transparent and shows humerus, ulna and radius.
    The radius rolls around the ulna as you pronate (the real mechanism).
  - Elbow angle slider: closes/opens the elbow so the forearm tilts; everything is
    rebuilt and the readouts show the torque drop (twisting pull = load x cos(tilt)).

The script is safe to re-run: it rebuilds its own objects (all named "Lift_...") and
animation each time. It also stores itself in the .blend as a text block set to
auto-register, so after saving, the panel comes back when the file is reopened (if
Blender is allowed to auto-run Python scripts; otherwise just Run Script again).

Physics (from our notes):
  pull across forearm = load x cos(forearm tilt)
  torque              = pull across forearm x moment arm   (wrapped strap: ~constant arm)
  plate rise          = turn angle (radians) x moment arm  (the hand acts like a winch drum)
"""
import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix

RIG_NAME = "Arm_Rig"
# Bone names are picked up from the rig, so the same script drives a left (".L")
# or right (".R") arm. _detect_side() refreshes them before every build.
UPPER, FOREARM, HAND = "upper_arm.L", "forearm.L", "hand.L"
PREFIX = "Lift_"
ACTION = "PronationLift"
TEXT_NAME = "pronation_lift.py"
COLL_PROPS, COLL_FORCES, COLL_SKEL = "Lift_Setup", "Lift_Forces", "Lift_Skeleton"

# Timeline (frames, ~4.5 s at 24 fps): start hold, palm-down reached, top hold ends,
# back at start, end of final hold.
KEY_FRAMES = (1, 13, 43, 61, 97, 109)
F_START, F_HOLD_END = KEY_FRAMES[0], KEY_FRAMES[-1]

TURN_DEG = 80.0          # thumb-up -> palm-down (normal pronation range ~80 deg)
FOREARM_SHARE = 0.7      # how much of the twist the forearm bone takes (rest goes to the hand)
INCH = 0.0254
ARROW_M_PER_LB = 0.0024  # arrow length per pound of force (50 lb -> 12 cm)
BONE_GAP = 0.011         # radius / ulna offset from the rig's forearm bone line (m)

_state = {"playing": False, "last": None}

UP = Vector((0, 0, 1))


# ---------------------------------------------------------------- small helpers
def rig():
    return bpy.data.objects.get(RIG_NAME)


def _detect_side():
    global UPPER, FOREARM, HAND
    r = rig()
    suffix = ".R" if (r and "forearm.R" in r.data.bones) else ".L"
    UPPER, FOREARM, HAND = "upper_arm" + suffix, "forearm" + suffix, "hand" + suffix


def side_sign():
    # Left arm: pronation is +Y twist on these bones. A mirrored right arm would be -Y.
    return 1.0 if FOREARM.endswith(".L") else -1.0


def material(name, color, metallic=0.0, rough=0.5, emit=0.0, alpha=1.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    if mat.node_tree:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*color, 1)
            bsdf.inputs["Metallic"].default_value = metallic
            bsdf.inputs["Roughness"].default_value = rough
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*color, 1)
                bsdf.inputs["Emission Strength"].default_value = emit
            bsdf.inputs["Alpha"].default_value = alpha
    mat.diffuse_color = (*color, alpha)
    return mat


def collection(name, hidden=False):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    coll.hide_viewport = hidden
    coll.hide_render = hidden
    return coll


def remove_old():
    for o in [o for o in bpy.data.objects if o.name.startswith(PREFIX)]:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in [m for m in bpy.data.meshes if m.name.startswith(PREFIX) and m.users == 0]:
        bpy.data.meshes.remove(m)
    for c in [c for c in bpy.data.curves if c.name.startswith(PREFIX) and c.users == 0]:
        bpy.data.curves.remove(c)
    for a in [a for a in bpy.data.actions
              if a.name == ACTION or (a.name.startswith(PREFIX) and a.users == 0)]:
        bpy.data.actions.remove(a)


def finish(name, bm, coll, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if mat:
        me.materials.append(mat)
    return ob


def _frame(t):
    t = t.normalized()
    ref = UP if abs(t.dot(UP)) < 0.9 else Vector((1, 0, 0))
    n = ref.cross(t).normalized()
    return n, t.cross(n)


def tube_into(bm, points, radii, segs=14, caps=True):
    """Tube through points; radii is one value or one per point."""
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * len(points)
    rings = []
    for i, p in enumerate(points):
        a = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
        n, b = _frame(a)
        rings.append([bm.verts.new(p + (n * math.cos(2 * math.pi * k / segs)
                                        + b * math.sin(2 * math.pi * k / segs)) * radii[i])
                      for k in range(segs)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(segs):
            bm.faces.new((r0[k], r0[(k + 1) % segs], r1[(k + 1) % segs], r1[k]))
    if caps:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def cone_into(bm, base, tip, radius, segs=16):
    n, b = _frame(tip - base)
    ring = [bm.verts.new(base + (n * math.cos(2 * math.pi * k / segs)
                                 + b * math.sin(2 * math.pi * k / segs)) * radius)
            for k in range(segs)]
    t = bm.verts.new(tip)
    for k in range(segs):
        bm.faces.new((ring[k], ring[(k + 1) % segs], t))
    bm.faces.new(list(reversed(ring)))


def sphere_into(bm, center, radius):
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=radius,
                              matrix=Matrix.Translation(center))


def arrow(name, start, end, coll, mat, radius=0.0022):
    bm = bmesh.new()
    d = end - start
    head = min(0.022, d.length * 0.45)
    neck = end - d.normalized() * head
    tube_into(bm, [start, neck], radius)
    cone_into(bm, neck, end, radius * 2.8)
    return finish(name, bm, coll, mat)


def arc_arrow(name, center, u, v, radius, a0, a1, coll, mat, tube=0.0022):
    bm = bmesh.new()
    head_ang = 0.022 / radius
    pts = [center + (u * math.cos(t) + v * math.sin(t)) * radius
           for t in [a0 + (a1 - head_ang - a0) * i / 24 for i in range(25)]]
    tube_into(bm, pts, tube)
    tip = center + (u * math.cos(a1) + v * math.sin(a1)) * radius
    cone_into(bm, pts[-1], tip, tube * 2.8)
    return finish(name, bm, coll, mat)


def label(name, body, loc, coll, mat, size=0.013):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.align_x = 'LEFT' if side_sign() > 0 else 'RIGHT'   # text grows away from the arm
    ob = bpy.data.objects.new(name, cu)
    coll.objects.link(ob)
    ob.location = loc
    ob.data.materials.append(mat)
    cam = bpy.context.scene.camera
    if cam:
        con = ob.constraints.new('TRACK_TO')
        con.target = cam
        con.track_axis, con.up_axis = 'TRACK_Z', 'UP_Y'
    else:
        ob.rotation_euler = (math.radians(90), 0, 0)
    return ob


def cylinder(name, radius, depth, coll, mat, verts=48):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=radius,
                          radius2=radius, depth=depth)
    ob = finish(name, bm, coll, mat, smooth=False)
    for p in ob.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    return ob


def box(name, sx, sy, sz, coll, mat):
    """Box with its origin at the top face, so scaling Z shortens it from the bottom."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z = v.co.z * sz - sz / 2
    return finish(name, bm, coll, mat, smooth=False)


def band(name, half_thick, half_width, coll, mat, tube=0.0035, segs=48, ring=10):
    """Flattened loop (the strap wrapped around the hand), in local X (thickness) / Z (width)."""
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        t = 2 * math.pi * i / segs
        c, s = math.cos(t), math.sin(t)
        px = half_thick * math.copysign(abs(c) ** 0.6, c)
        pz = half_width * math.copysign(abs(s) ** 0.6, s)
        ctr = Vector((px, 0, pz))
        normal = Vector((px / max(half_thick, 1e-6), 0, pz / max(half_width, 1e-6))).normalized()
        rings.append([bm.verts.new(ctr + normal * (tube * 0.35 * math.cos(2 * math.pi * k / ring))
                                   + Vector((0, 0.019 * math.sin(2 * math.pi * k / ring), 0)))
                      for k in range(ring)])
    for i in range(segs):
        r0, r1 = rings[i], rings[(i + 1) % segs]
        for k in range(ring):
            bm.faces.new((r0[k], r0[(k + 1) % ring], r1[(k + 1) % ring], r1[k]))
    return finish(name, bm, coll, mat)


def parent_keep_world(ob, parent, bone=None):
    mw = ob.matrix_world.copy()
    ob.parent = parent
    if bone:
        ob.parent_type = 'BONE'
        ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = mw


# ---------------------------------------------------------------- build
def build(context=None):
    scene = bpy.context.scene
    r = rig()
    if r is None:
        raise RuntimeError(f"Couldn't find the armature '{RIG_NAME}'")
    _detect_side()
    props = scene.pronation_lift
    arm_m = props.moment_arm_in * INCH
    load = props.load_lb

    remove_old()
    c_props = collection(COLL_PROPS)
    c_forces = collection(COLL_FORCES, hidden=not props.show_forces)
    c_skel = collection(COLL_SKEL, hidden=not props.see_through)

    # Forearm needs to be able to twist (pronation/supination). The rig shipped with
    # that axis locked, so open it to a realistic range.
    fpb, hpb = r.pose.bones[FOREARM], r.pose.bones[HAND]
    fpb.lock_rotation[1] = False
    for c in fpb.constraints:
        if c.type == 'LIMIT_ROTATION':
            c.min_y, c.max_y = math.radians(-85), math.radians(85)
    # Elbow slider: 180 = straight arm, 90 = forearm level (with the upper arm hanging).
    fpb.rotation_euler[2] = -math.radians(180.0 - props.elbow_deg) * side_sign()
    fpb.rotation_euler[1] = 0.0
    hpb.rotation_euler[1] = 0.0
    scene.frame_set(F_START)
    bpy.context.view_layer.update()

    # ---- start-position geometry, read from the rig so it follows the pose
    M = r.matrix_world
    upb = r.pose.bones[UPPER]
    shoulder = M @ upb.head
    elbow = M @ fpb.head
    wrist = M @ fpb.tail
    axis_dir = (wrist - elbow).normalized()
    hmat = M @ hpb.matrix
    back = Vector(hmat.col[2][:3])
    back = (back - back.dot(axis_dir) * axis_dir).normalized()   # back of hand
    thumb = axis_dir.cross(back).normalized() * side_sign()       # thumb (radius) side
    pinky = -thumb
    lateral = Vector((back.x, back.y, 0))
    lateral = lateral.normalized() if lateral.length > 1e-6 else Vector((1, 0, 0))

    horiz = math.hypot(axis_dir.x, axis_dir.y)
    tilt_deg = math.degrees(math.atan2(axis_dir.z, horiz))       # + = forearm points up
    cos_phi = max(0.0, horiz)
    pull = load * cos_phi
    torque = pull * props.moment_arm_in
    props.tilt_deg, props.pull_lb, props.torque_inlb = tilt_deg, pull, torque

    # Real pronation axis: radial head (elbow, thumb side) -> ulnar head (wrist, pinky side)
    radial_head = elbow + thumb * BONE_GAP
    ulnar_head = wrist + pinky * BONE_GAP
    pax = (ulnar_head - radial_head).normalized()

    def on_axis(p):                      # closest point on the pronation axis to p
        return radial_head + pax * (p - radial_head).dot(pax)

    strap_at = wrist + axis_dir * 0.03                            # across the palm, near the thumb web
    axis_pt = on_axis(strap_at)
    foot = axis_pt + lateral * arm_m                              # end of the moment arm (on the strap line)
    top = foot + UP * 0.012                                       # strap leaves the back of the hand here

    strap_len = 0.17
    pin_len = 0.24
    pin_top = top.z - strap_len

    # ---- materials
    mat_strap = material("Lift_Strap", (0.008, 0.008, 0.008), rough=0.9)
    mat_pin = material("Lift_Pin", (0.35, 0.35, 0.37), metallic=1.0, rough=0.35)
    mat_plate = material("Lift_Plate", (0.30, 0.30, 0.32), metallic=0.6, rough=0.5)
    mat_axis = material("Lift_Axis", (0.33, 0.29, 0.72), emit=2.0)       # purple
    mat_marm = material("Lift_MomentArm", (0.95, 0.75, 0.10), emit=2.0)  # amber
    mat_tens = material("Lift_Tension", (0.85, 0.20, 0.15), emit=2.0)    # red
    mat_pull = material("Lift_Pull", (0.95, 0.45, 0.12), emit=2.0)       # orange
    mat_torq = material("Lift_Torque", (0.08, 0.62, 0.46), emit=2.0)     # teal
    mat_text = material("Lift_Text", (0.92, 0.92, 0.92), emit=1.5)
    mat_bone = material("Lift_Bone", (0.90, 0.86, 0.74), rough=0.6)
    mat_radius = material("Lift_RadiusBone", (0.95, 0.66, 0.30), rough=0.6)

    # ---- strap, loading pin, plate
    loop = band(PREFIX + "StrapLoop", half_thick=arm_m, half_width=0.044, coll=c_props, mat=mat_strap)
    loop.matrix_world = (Matrix.Translation(strap_at)
                         @ Matrix((back, axis_dir, back.cross(axis_dir))).transposed().to_4x4())
    parent_keep_world(loop, r, HAND)

    strap = box(PREFIX + "Strap", 0.003, 0.038, strap_len, c_props, mat_strap)
    strap.location = top
    pin = cylinder(PREFIX + "LoadingPin", 0.014, pin_len, c_props, mat_pin)
    pin.location = Vector((top.x, top.y, pin_top - pin_len / 2))
    plate = cylinder(PREFIX + "Plate", 0.115, 0.026, c_props, mat_plate, verts=64)
    plate.parent = pin                                            # rides on the pin
    plate.location = Vector((0, 0, -pin_len / 2 + 0.035))

    # ---- forces and axis
    ax0, ax1 = radial_head - pax * 0.06, ulnar_head + pax * 0.16
    bm = bmesh.new()
    tube_into(bm, [ax0, ax1], 0.0022)
    finish(PREFIX + "TwistAxis", bm, c_forces, mat_axis)
    bm = bmesh.new()
    tube_into(bm, [axis_pt, foot], 0.0018)
    sphere_into(bm, axis_pt, 0.004)
    finish(PREFIX + "MomentArm", bm, c_forces, mat_marm)

    t_len = min(0.30, max(0.01, load * ARROW_M_PER_LB))
    t0 = foot + lateral * 0.035
    arrow(PREFIX + "TensionArrow", t0, t0 - UP * t_len, c_forces, mat_tens)
    down_perp = -UP - (-UP).dot(axis_dir) * axis_dir               # part of "down" across the forearm
    p_len = min(0.30, max(0.01, pull * ARROW_M_PER_LB))
    p0 = foot + lateral * 0.075
    if down_perp.length > 1e-6:
        arrow(PREFIX + "PullArrow", p0, p0 + down_perp.normalized() * p_len, c_forces, mat_pull)
    tq_c = on_axis(wrist - axis_dir * 0.035)
    arc_arrow(PREFIX + "TorqueArrow", tq_c, back, thumb,          # back of hand turns toward the thumb side
              0.06, math.radians(25), math.radians(150), c_forces, mat_torq)

    marm_lab = foot + lateral * 0.115 + UP * 0.035
    bm = bmesh.new()                                              # leader from the moment arm to its label
    tube_into(bm, [foot + lateral * 0.004 + UP * 0.002, marm_lab - UP * 0.002], 0.0006)
    finish(PREFIX + "MomentArmLeader", bm, c_forces, mat_marm)
    lab = [
        ("Twist axis", ax1 + pax * 0.01 + UP * 0.02),
        (f"Moment arm {props.moment_arm_in:.2f} in", marm_lab),
        (f"Tension {load:.0f} lb", t0 - UP * (t_len + 0.022) - lateral * 0.02),
        (f"Pull across forearm {pull:.0f} lb", p0 + down_perp.normalized() * p_len
         - UP * 0.040 - lateral * 0.02),
        (f"Torque {torque:.0f} in·lb", tq_c + lateral * 0.01 + UP * 0.075),
    ]
    for i, (text, loc) in enumerate(lab):
        label(f"{PREFIX}Label{i}", text, loc, c_forces, mat_text)
    hud_at = elbow.copy()
    hud_at.z = max(elbow.z, wrist.z) + 0.16
    hud = label(PREFIX + "HUD", "", hud_at + lateral * 0.06, c_forces, mat_text, size=0.016)
    hud["lift_hud"] = True
    for ob in c_forces.objects:
        ob.show_in_front = True

    # ---- skeleton (shown with see-through skin)
    bm = bmesh.new()
    tube_into(bm, [shoulder, elbow], [0.012, 0.010])
    sphere_into(bm, shoulder, 0.024)
    sphere_into(bm, elbow, 0.017)
    finish(PREFIX + "Humerus", bm, c_skel, mat_bone)

    bm = bmesh.new()                                              # ulna: does not rotate
    u0, u1 = elbow + pinky * BONE_GAP - axis_dir * 0.012, ulnar_head
    tube_into(bm, [u0, u0.lerp(u1, 0.5), u1], [0.009, 0.007, 0.005])
    sphere_into(bm, u0, 0.012)
    sphere_into(bm, u1, 0.0075)
    finish(PREFIX + "Ulna", bm, c_skel, mat_bone)

    # radius: spins at the elbow and swings around the ulna at the wrist
    x_p = (thumb - thumb.dot(pax) * pax).normalized()
    W = Matrix((x_p, pax, x_p.cross(pax))).transposed().to_4x4()
    W.translation = radial_head
    pivot = bpy.data.objects.new(PREFIX + "RadiusPivot", None)
    pivot.empty_display_size = 0.01
    pivot.hide_viewport = True
    c_skel.objects.link(pivot)
    pivot.matrix_world = W
    bm = bmesh.new()
    rd0, rd1 = radial_head + axis_dir * 0.004, wrist + thumb * BONE_GAP - axis_dir * 0.004
    tube_into(bm, [rd0, rd0.lerp(rd1, 0.5), rd1], [0.006, 0.0075, 0.010])
    sphere_into(bm, rd0, 0.0095)
    sphere_into(bm, rd1, 0.0115)
    bm.transform(W.inverted())
    radius_ob = finish(PREFIX + "Radius", bm, c_skel, mat_radius)
    radius_ob.parent = pivot
    radius_ob.matrix_parent_inverse.identity()
    radius_ob.matrix_basis = Matrix.Identity(4)
    drv = radius_ob.driver_add("rotation_euler", 1).driver
    drv.type = 'SCRIPTED'
    for vname, bone in (("fa", FOREARM), ("ha", HAND)):
        var = drv.variables.new()
        var.name, var.type = vname, 'SINGLE_PROP'
        var.targets[0].id = r
        var.targets[0].data_path = f'pose.bones["{bone}"].rotation_euler[1]'
    drv.expression = "fa + ha"

    for ob in c_skel.objects:
        ob.show_in_front = True
    set_skin_alpha(props.see_through)

    # ---- animation
    turn = math.radians(TURN_DEG) * side_sign()
    rise = math.radians(TURN_DEG) * arm_m                       # winch: arc length
    # (frame, fraction of the turn): hold, turn palm-down, hold at the top, lower slowly, hold
    keys = [(KEY_FRAMES[0], 0.0), (KEY_FRAMES[1], 0.0), (KEY_FRAMES[2], 1.0),
            (KEY_FRAMES[3], 1.0), (KEY_FRAMES[4], 0.0), (KEY_FRAMES[5], 0.0)]
    pin_z0 = pin.location.z
    # With twist bones (add_twist_bones.py) the hand carries the whole turn and the
    # twist bones spread it along the forearm; without them, split it as before.
    share = 0.0 if r.data.bones.get("forearm_twist.01" + FOREARM[-2:]) else FOREARM_SHARE
    for f, k in keys:
        fpb.rotation_euler[1] = turn * k * share
        hpb.rotation_euler[1] = turn * k * (1 - share)
        fpb.keyframe_insert("rotation_euler", index=1, frame=f, group="Pronation")
        hpb.keyframe_insert("rotation_euler", index=1, frame=f, group="Pronation")
        pin.location.z = pin_z0 + rise * k
        pin.keyframe_insert("location", index=2, frame=f)
        strap.scale.z = (strap_len - rise * k) / strap_len
        strap.keyframe_insert("scale", index=2, frame=f)
    if r.animation_data and r.animation_data.action:
        r.animation_data.action.name = ACTION

    end = keys[-1][0]
    scene.frame_start, scene.frame_end = F_START, end
    props.end_frame = end
    scene.frame_set(F_START)
    _hud(scene)
    return {"rise_in": rise / INCH, "torque": torque, "tilt": tilt_deg}


def set_skin_alpha(see_through):
    mat = bpy.data.materials.get("Skin")
    if not mat:
        return
    a = 0.22 if see_through else 1.0
    c = mat.diffuse_color
    mat.diffuse_color = (c[0], c[1], c[2], a)
    if mat.node_tree:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Alpha"].default_value = a
    for attr, val in (("surface_render_method", 'BLENDED' if see_through else 'DITHERED'),
                      ("blend_method", 'BLEND' if see_through else 'OPAQUE')):
        if hasattr(mat, attr):
            try:
                setattr(mat, attr, val)
            except Exception:
                pass


# ---------------------------------------------------------------- live readout + playback
def turned_deg():
    r = rig()
    if not r:
        return 0.0
    return math.degrees(r.pose.bones[FOREARM].rotation_euler[1]
                        + r.pose.bones[HAND].rotation_euler[1]) * side_sign()


def _hud(scene, depsgraph=None):
    ob = bpy.data.objects.get(PREFIX + "HUD")
    if not ob or not hasattr(scene, "pronation_lift"):
        return
    p = scene.pronation_lift
    ang = turned_deg()
    body = (f"Hand turned {ang:3.0f}°  (0 = thumb up)\n"
            f"Plate up {math.radians(max(ang, 0)) * p.moment_arm_in:4.2f} in\n"
            f"Elbow {p.elbow_deg:.0f}°, forearm tilt {p.tilt_deg:+.0f}°")
    if ob.data.body != body:
        ob.data.body = body


def _cancel_playback():
    for w in bpy.context.window_manager.windows:
        if w.screen and w.screen.is_animation_playing:
            with bpy.context.temp_override(window=w, screen=w.screen):
                bpy.ops.screen.animation_cancel(restore_frame=False)
            return


def _play_once_handler(scene, depsgraph=None):
    if not _state["playing"]:
        return
    end = scene.pronation_lift.end_frame
    f = scene.frame_current
    wrapped = _state["last"] is not None and f < _state["last"]
    _state["last"] = f
    if f >= end or wrapped:
        _state["playing"] = False
        _cancel_playback()
        scene.frame_set(end if wrapped else f)


def _redraw(*_):
    wm = bpy.context.window_manager
    if not wm:
        return
    for w in wm.windows:
        for a in w.screen.areas:
            if a.type == 'VIEW_3D':
                a.tag_redraw()


# ---------------------------------------------------------------- UI
def _rebuild(self, context):
    try:
        build()
    except Exception as e:
        print("Pronation lift rebuild failed:", e)


def _visibility(self, context):
    for name, hidden in ((COLL_FORCES, not self.show_forces), (COLL_SKEL, not self.see_through)):
        coll = bpy.data.collections.get(name)
        if coll:
            coll.hide_viewport = coll.hide_render = hidden
    set_skin_alpha(self.see_through)
    if self.see_through and context and context.screen:
        for a in context.screen.areas:              # transparency needs Material Preview in Eevee,
            if a.type == 'VIEW_3D':                 # Solid mode shows it too
                for s in a.spaces:
                    if s.type == 'VIEW_3D' and s.shading.type == 'SOLID':
                        s.shading.color_type = 'MATERIAL'


class PronationLiftProps(bpy.types.PropertyGroup):
    load_lb: bpy.props.FloatProperty(name="Load (lb)", default=50.0, min=0.0, max=500.0,
                                     update=_rebuild)
    moment_arm_in: bpy.props.FloatProperty(name="Moment arm (in)", default=0.75, min=0.1,
                                           max=6.0, update=_rebuild)
    elbow_deg: bpy.props.FloatProperty(name="Elbow angle (°)", default=90.0, min=40.0, max=150.0,
                                       description="90 = forearm level. Smaller closes the elbow "
                                                   "(forearm points up), larger opens it",
                                       update=_rebuild)
    show_forces: bpy.props.BoolProperty(name="Show forces", default=True, update=_visibility)
    see_through: bpy.props.BoolProperty(name="See-through skin + bones", default=False,
                                        update=_visibility)
    end_frame: bpy.props.IntProperty(default=F_HOLD_END)
    tilt_deg: bpy.props.FloatProperty(default=0.0)
    pull_lb: bpy.props.FloatProperty(default=50.0)
    torque_inlb: bpy.props.FloatProperty(default=37.5)


class LIFT_OT_play(bpy.types.Operator):
    bl_idname = "pronation_lift.play"
    bl_label = "Play lift"
    bl_description = "Play the pronation lift once from the start position"

    def execute(self, context):
        if not bpy.data.objects.get(PREFIX + "LoadingPin"):
            build()
        scene = context.scene
        if context.screen and context.screen.is_animation_playing:
            bpy.ops.screen.animation_cancel(restore_frame=False)
        scene.frame_set(scene.frame_start)
        _state["playing"], _state["last"] = True, scene.frame_start
        bpy.ops.screen.animation_play()
        return {'FINISHED'}


class LIFT_OT_reset(bpy.types.Operator):
    bl_idname = "pronation_lift.reset"
    bl_label = "Reset"
    bl_description = "Stop and go back to the start position"

    def execute(self, context):
        _state["playing"] = False
        if context.screen and context.screen.is_animation_playing:
            bpy.ops.screen.animation_cancel(restore_frame=False)
        context.scene.frame_set(context.scene.frame_start)
        return {'FINISHED'}


class LIFT_OT_rebuild(bpy.types.Operator):
    bl_idname = "pronation_lift.rebuild"
    bl_label = "Rebuild animation"
    bl_description = "Recreate the strap, loading pin, forces, bones and keyframes from the arm pose"

    def execute(self, context):
        build()
        return {'FINISHED'}


class LIFT_PT_panel(bpy.types.Panel):
    bl_label = "Pronation lift"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Pronation"

    def draw(self, context):
        lay = self.layout
        p = context.scene.pronation_lift
        row = lay.row(align=True)
        row.scale_y = 1.6
        row.operator("pronation_lift.play", icon='PLAY')
        row.operator("pronation_lift.reset", icon='LOOP_BACK', text="")

        col = lay.column(align=True)
        col.prop(p, "load_lb")
        col.prop(p, "moment_arm_in")
        col.prop(p, "elbow_deg", slider=True)

        col = lay.column(align=True)
        col.prop(p, "show_forces", icon='FORCE_FORCE')
        col.prop(p, "see_through", icon='BONE_DATA')

        ang = turned_deg()
        box_ = lay.box()
        box_.label(text=f"Forearm tilt: {p.tilt_deg:+.0f}°  ({'level' if abs(p.tilt_deg) < 1 else 'up' if p.tilt_deg > 0 else 'down'})")
        box_.label(text=f"Pull across forearm: {p.pull_lb:.1f} lb")
        box_.label(text=f"Torque: {p.torque_inlb:.0f} in·lb  ({p.torque_inlb / 12:.1f} lb·ft)")
        box_.separator()
        box_.label(text=f"Hand turned: {ang:4.0f}°  (0° = thumb up)")
        box_.label(text=f"Plate lifted: {math.radians(max(ang, 0)) * p.moment_arm_in:4.2f} in")
        lay.label(text="Purple axis · amber moment arm", icon='INFO')
        lay.label(text="Red tension · orange cross pull · teal torque")
        lay.operator("pronation_lift.rebuild", icon='FILE_REFRESH')


CLASSES = (PronationLiftProps, LIFT_OT_play, LIFT_OT_reset, LIFT_OT_rebuild, LIFT_PT_panel)
HANDLER_NAMES = ("_play_once_handler", "_redraw", "_hud")


def _clear_handlers():
    lst = bpy.app.handlers.frame_change_post
    for h in [h for h in lst if getattr(h, "__name__", "") in HANDLER_NAMES]:
        lst.remove(h)


def register():
    for c in reversed(CLASSES):
        try:
            bpy.utils.unregister_class(c)
        except Exception:
            pass
    for c in CLASSES:
        bpy.utils.register_class(c)
    bpy.types.Scene.pronation_lift = bpy.props.PointerProperty(type=PronationLiftProps)
    _detect_side()
    _clear_handlers()
    bpy.app.handlers.frame_change_post.append(_hud)
    bpy.app.handlers.frame_change_post.append(_play_once_handler)
    bpy.app.handlers.frame_change_post.append(_redraw)


def store_in_blend():
    """Keep exactly one copy of this script inside the .blend, set to register on load."""
    src = None
    try:
        if __file__ and os.path.isfile(__file__):
            src = open(__file__, encoding="utf-8").read()
    except Exception:
        pass
    if src is None:                                   # running from the Text Editor
        running = bpy.data.texts.get(os.path.basename(__file__ or ""))
        src = running.as_string() if running else None
    txt = bpy.data.texts.get(TEXT_NAME) or bpy.data.texts.new(TEXT_NAME)
    if src and txt.as_string() != src:
        txt.clear()
        txt.write(src)
    txt.use_module = True
    for t in bpy.data.texts:                          # older copies must not auto-run
        if t is not txt and t.name.startswith("pronation_lift"):
            t.use_module = False


def _run_by_user():
    """True when run on purpose (Run Script, or --python file). False when Blender
    auto-runs the stored text block while opening the .blend; building then would
    read the arm before its pose is evaluated."""
    f = globals().get("__file__") or ""
    if os.path.isfile(f):
        return True
    area = getattr(bpy.context, "area", None)
    return bool(area and area.type == 'TEXT_EDITOR')


register()
if __name__ == "__main__" and _run_by_user():
    store_in_blend()
    info = build()
    print(f"Pronation lift ready: plate rises {info['rise_in']:.2f} in, "
          f"torque {info['torque']:.0f} in·lb at {info['tilt']:+.0f}° forearm tilt. "
          "Open the N sidebar > Pronation tab and press Play lift.")
