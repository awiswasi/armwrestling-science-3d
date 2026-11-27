"""
Add forearm twist bones so the skin twists evenly from elbow to wrist.

Why: in a real forearm, pronation and supination roll the radius around the ulna
along the whole forearm, so the skin twists gradually: hardly at all near the
elbow and fully at the wrist. A single forearm bone can't do that; the twist
bunches up at one spot and the wrist pinches.

What it does (on the open .blend; works for a left ".L" or right ".R" arm):
  1. Adds three twist bones along the forearm, children of the forearm bone,
     lined up on its axis at 33%, 66% and 95% of its length.
  2. Splits the forearm's skin weights between the forearm bone and the twist
     bones by how far each vertex is from the elbow, so the twist fades in
     smoothly along the arm.
  3. Drives each twist bone from the hand's twist (the hand bone's Y rotation):
     33%, 66% and 95% of it. Turning the hand now twists the forearm the right
     amount at every point. (glTF does not export drivers; the web app sets
     these three rotations itself with the same fractions.)

After running it, the pronation lift should put the whole turn on the hand bone;
pronation_lift.py detects twist bones and does that automatically.
Run it once per file; it refuses to add twist bones twice.
"""
import bpy
from mathutils import Vector

RIG_NAME, MESH_NAME = "Arm_Rig", "Arm"
STATIONS = (0.33, 0.66, 0.95)      # position along the forearm = share of the twist


def main():
    ctx = bpy.context
    rig = bpy.data.objects[RIG_NAME]
    arm = bpy.data.objects[MESH_NAME]
    suf = ".R" if "forearm.R" in rig.data.bones else ".L"
    fore, hand = "forearm" + suf, "hand" + suf
    names = [f"forearm_twist.0{i + 1}{suf}" for i in range(len(STATIONS))]
    if names[0] in rig.data.bones:
        raise RuntimeError("Twist bones already exist in this rig.")
    if ctx.object and ctx.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')

    # 1. twist bones on the forearm's axis
    for o in ctx.view_layer.objects:
        o.select_set(False)
    rig.select_set(True)
    ctx.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    fb = eb[fore]
    h, t = fb.head.copy(), fb.tail.copy()
    for name, s in zip(names, STATIONS):
        b = eb.new(name)
        b.head = h.lerp(t, s)
        b.tail = b.head + (t - h) * 0.12
        b.roll = fb.roll
        b.parent = fb
        b.use_connect = False
        b.use_deform = True
    bpy.ops.object.mode_set(mode='OBJECT')

    # 2. share the forearm's weights out along its length (rest positions, world space)
    bone = rig.data.bones[fore]
    H = rig.matrix_world @ bone.head_local
    T = rig.matrix_world @ bone.tail_local
    axis = T - H
    L2 = axis.length_squared
    nodes = [(0.0, fore)] + list(zip(STATIONS, names))
    groups = {n: (arm.vertex_groups.get(n) or arm.vertex_groups.new(name=n)) for _, n in nodes}
    gi = groups[fore].index
    mw = arm.matrix_world
    moved = 0
    for v in arm.data.vertices:
        w = next((g.weight for g in v.groups if g.group == gi), 0.0)
        if w <= 0.0:
            continue
        s = max(0.0, min(1.0, (mw @ v.co - H).dot(axis) / L2))
        shares = {}
        if s >= nodes[-1][0]:
            shares[nodes[-1][1]] = w
        else:
            for (s0, n0), (s1, n1) in zip(nodes, nodes[1:]):
                if s0 <= s <= s1:
                    a = (s - s0) / (s1 - s0)
                    shares[n0], shares[n1] = w * (1 - a), w * a
                    break
        groups[fore].remove([v.index])
        for n, sw in shares.items():
            if sw > 1e-5:
                groups[n].add([v.index], sw, 'ADD')
        moved += 1

    # 3. each twist bone follows a share of the hand's twist
    for name, s in zip(names, STATIONS):
        pb = rig.pose.bones[name]
        pb.rotation_mode = 'XYZ'
        pb.lock_rotation = (True, False, True)
        drv = pb.driver_add("rotation_euler", 1).driver
        drv.type = 'SCRIPTED'
        var = drv.variables.new()
        var.name, var.type = "h", 'SINGLE_PROP'
        var.targets[0].id = rig
        var.targets[0].data_path = f'pose.bones["{hand}"].rotation_euler[1]'
        drv.expression = f"h * {s}"

    ctx.view_layer.update()
    print(f"Added {len(names)} twist bones; re-weighted {moved} forearm vertices.")


main()
