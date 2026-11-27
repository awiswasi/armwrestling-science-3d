"""
Turn the left-arm file into an exact right-arm mirror.

Run it in Blender on your arm file (Scripting tab > open this file > Run Script),
then save under a new name. It mirrors:
  - the skin mesh (and fixes its normals and vertex group names),
  - the rig (every bone, its roll, the ".L" names become ".R"),
  - the joint limits (Limit Rotation constraints) and locked axes,
  - your current pose, finger by finger,
  - the camera and lights,
and then rebuilds the pronation lift on the right arm with pronation_lift.py
(if that script sits in the same folder as this one, or is already stored in
the .blend).

The mirror plane is the world X = 0 plane, which runs through the shoulder.
"""
import math
import os
import bpy

RIG_NAME, MESH_NAME = "Arm_Rig", "Arm"
LIFT_PREFIX = "Lift_"


def mirror_name(name):
    for a, b in ((".L", ".R"), ("_L", "_R"), (".l", ".r")):
        if name.endswith(a):
            return name[: -len(a)] + b
    return name


def main():
    ctx = bpy.context
    rig = bpy.data.objects[RIG_NAME]
    arm = bpy.data.objects[MESH_NAME]
    if any(b.name.endswith(".R") for b in rig.data.bones):
        raise RuntimeError("This rig already has right-side bones; nothing to do.")
    if ctx.object and ctx.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    # 0. remember what the lift panel and its collections looked like
    vis = {c.name: c.hide_viewport for c in bpy.data.collections if c.name.startswith(LIFT_PREFIX)}

    # 1. remove the generated lift objects and the left-arm lift keyframes
    for o in [o for o in bpy.data.objects if o.name.startswith(LIFT_PREFIX)]:
        bpy.data.objects.remove(o, do_unlink=True)
    if rig.animation_data and rig.animation_data.action:
        act = rig.animation_data.action
        rig.animation_data.action = None
        if act.users == 0:
            bpy.data.actions.remove(act)
    for a in [a for a in bpy.data.actions if a.users == 0]:
        bpy.data.actions.remove(a)

    # 2. record the left pose, joint limits and locks
    saved = {}
    for pb in rig.pose.bones:
        saved[pb.name] = {
            "mode": pb.rotation_mode,
            "euler": tuple(pb.rotation_euler),
            "quat": tuple(pb.rotation_quaternion),
            "loc": tuple(pb.location),
            "scale": tuple(pb.scale),
            "lock": tuple(pb.lock_rotation),
            "limits": [{k: getattr(c, k) for k in (
                "name", "owner_space", "use_limit_x", "use_limit_y", "use_limit_z",
                "min_x", "max_x", "min_y", "max_y", "min_z", "max_z", "use_transform_limit")}
                for c in pb.constraints if c.type == 'LIMIT_ROTATION'],
        }

    # 3. mirror the rig: Symmetrize builds the ".R" bones, then the ".L" ones go
    for o in ctx.view_layer.objects:
        o.select_set(False)
    rig.select_set(True)
    ctx.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    for b in eb:
        b.select = b.select_head = b.select_tail = True
    bpy.ops.armature.symmetrize(direction='NEGATIVE_X')
    left = [b.name for b in eb if b.name.endswith(".L")]
    for n in left:
        eb.remove(eb[n])
    bpy.ops.object.mode_set(mode='OBJECT')

    # 4. pose, limits and locks, mirrored (X kept, Y and Z flipped)
    for lname, d in saved.items():
        pb = rig.pose.bones.get(mirror_name(lname))
        if pb is None:
            continue
        for c in list(pb.constraints):
            pb.constraints.remove(c)
        pb.rotation_mode = d["mode"]
        x, y, z = d["euler"]
        pb.rotation_euler = (x, -y, -z)
        w, qx, qy, qz = d["quat"]
        pb.rotation_quaternion = (w, qx, -qy, -qz)
        lx, ly, lz = d["loc"]
        pb.location = (-lx, ly, lz)
        pb.scale = d["scale"]
        pb.lock_rotation = d["lock"]
        for lim in d["limits"]:
            c = pb.constraints.new('LIMIT_ROTATION')
            c.name = lim["name"]
            c.owner_space = lim["owner_space"]
            c.use_transform_limit = lim["use_transform_limit"]
            c.use_limit_x, c.use_limit_y, c.use_limit_z = lim["use_limit_x"], lim["use_limit_y"], lim["use_limit_z"]
            c.min_x, c.max_x = lim["min_x"], lim["max_x"]
            c.min_y, c.max_y = -lim["max_y"], -lim["min_y"]
            c.min_z, c.max_z = -lim["max_z"], -lim["min_z"]

    # 5. mirror the skin: flip X, turn faces the right way out, rename groups
    me = arm.data
    if me.users > 1:
        arm.data = me = me.copy()
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    for v in bm.verts:
        v.co.x = -v.co.x
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()
    for g in arm.vertex_groups:
        g.name = mirror_name(g.name)

    # 6. mirror the camera and lights across the same plane
    for o in bpy.data.objects:
        if o.type in {'CAMERA', 'LIGHT'} and o.parent is None:
            o.location.x = -o.location.x
            rx, ry, rz = o.rotation_euler
            o.rotation_euler = (rx, -ry, -rz)

    ctx.view_layer.update()

    # 7. rebuild the lift on the right arm
    here = os.path.dirname(bpy.path.abspath(__file__)) if os.path.isfile(__file__) else ""
    disk = os.path.join(here, "pronation_lift.py")
    txt = bpy.data.texts.get("pronation_lift.py")
    if os.path.isfile(disk):
        src = open(disk, encoding="utf-8").read()
        if txt is None:
            txt = bpy.data.texts.new("pronation_lift.py")
        txt.clear()
        txt.write(src)
        txt.use_module = True
    if txt is not None:
        g = {"__name__": "pronation_lift_module", "__file__": txt.name}
        exec(compile(txt.as_string(), txt.name, "exec"), g)
        g["build"]()
        props = ctx.scene.pronation_lift
        for name, hidden in vis.items():
            coll = bpy.data.collections.get(name)
            if coll:
                coll.hide_viewport = coll.hide_render = hidden
        props["show_forces"] = not vis.get("Lift_Forces", False)
        props["see_through"] = not vis.get("Lift_Skeleton", True)
        print("Right arm ready, pronation lift rebuilt.")
    else:
        print("Right arm ready. Run pronation_lift.py to rebuild the lift.")


main()
