"""The Sundeck Pro mark in 3D, by day: the glass mark over a pure infinity pool (owner,
2026-10-24: "Instead of an ocean abyss, we're thinking something daytime, tropical, and infinity
pool vibe. I also want to see a bit more of the edges."; picked from the backdrop concepts, "Just
do A").

Turquoise pool water with sunlight caustics runs out to a thin glinting lip, with no deck; beyond
it the open sea, turquoise toward the horizon and glittering on the sun's side; a bright tropical
sky with cumulus banks off to the sides; palm fronds only at the frame's top corners. The camera
sits at the height of the mark's waves, so the horizon runs through them and the orange dot
stands in the sky like a sun over the sea, as it does in the logo.

The mark is built by scene.py's own code, run here unchanged up to its lighting section, so the
glass, the waves and the dot are exactly those of the night clip, at the same exposure.

The move: the mark makes one full turn on its axis while the camera drifts a few degrees for
parallax. The turn eases to a stop face-on and holds there, the mark perfectly still for about a
second (owner: "When the camera and the droplet are directly face to face, the droplet should not
be turning/spinning"), then sweeps through an edge, the back and the other edge. The mark turns
rather than the camera, so the sea stays behind it the whole time (owner: "We don't have to do a
full 360 if that makes the infinity look odd. I do want to see >180°"). One continuous turn shows
the front, both edges and the back once each and loops with no seam; a swing that reverses would
have to reach +/-180 degrees to show the back, and would show it twice. Everything moves on that
one period, so the last frame runs into the first with no dissolve.

    blender -b -P apps/video/logo3d/blender/scene_day.py -- --out DIR [options]

      --frames A-B     frames to render (default: the whole loop, 1-360)
      --step N         render every Nth frame (for previews)
      --samples N      Cycles samples (default 160)
      --res WxH        output size (default 1920x1080)
      --still F[,F]    render single frames to DIR/still-F.png
      --format F       PNG (default) or JPEG
      --blend PATH     also save the scene as a .blend
"""

import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
NIGHT = os.path.join(HERE, "scene.py")

# ---------------------------------------------------------------------------------------------
# The mark: scene.py's own code, up to its lighting (the night world it sets up is replaced).
# ---------------------------------------------------------------------------------------------

_src = open(NIGHT).read()
_cut = _src.find("\n# ---------------------------------------------------------------------------------------------\n# Light\n")
if _cut < 0:
    raise SystemExit("scene_day.py: scene.py no longer has its '# Light' section; update the cut")
M = {"__file__": NIGHT, "__name__": "sundeck_mark"}
exec(compile(_src[:_cut], NIGHT, "exec"), M)

A = M["A"]
scene = M["scene"]
pin = M["pin"]
pin_parts = M["pin_parts"]
drop = M["drop"]
set_input = M["set_input"]
PIN_Z = M["PIN_Z"]

FPS = 30
SECONDS = 12
FRAMES = SECONDS * FPS  # one loop: frame FRAMES + 1 is frame 1
T = f"(frame-1)/{FRAMES}"  # 0..1 over the loop, for drivers
X = f"({T}*2*pi)"  # one turn per loop
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.fps = FPS
w, h = (int(v) for v in str(A.get("res", "1920x1080")).lower().split("x"))
scene.render.resolution_x, scene.render.resolution_y = w, h
scene.render.resolution_percentage = 100
# The night clip's exposure, so the dot and its glow come out the same orange as in that clip;
# the daylight is set bright enough for it instead.
scene.view_settings.exposure = float(A.get("exposure", -0.4))

# The turn, with x = one loop: x - 4/3 sin x + 1/6 sin 2x. Its speed, 2/3 (1 - cos x)^2, is never
# negative and rises from zero as x^4, so the mark holds face-on for about two seconds (under
# 0.1 degree of turn within a second either side of x = 0, under 0.6 within 1.5 s), then turns
# smoothly, 2.7 times the average speed round the back (owner: hold face-on about 2 s, turn faster
# to make up for it). Every term is a smooth sine, so there is no jerk into or out of the hold.
# The mark also rises and settles a few centimetres, again flat at the hold.
for path, idx in (("location", 2), ("rotation_euler", 2), ("rotation_euler", 1)):
    pin.driver_remove(path, idx)
pin.rotation_euler = (math.radians(90), 0, 0)
EASE = f"((1-cos({X}))/2)*((1-cos({X}))/2)"  # 0 face-on, flat there as x^4, 1 round the back
pin.driver_add("rotation_euler", 2).driver.expression = f"{X} - 4/3*sin({X}) + sin(2*{X})/6"
pin.driver_add("location", 2).driver.expression = f"{PIN_Z} + 0.04*{EASE}"

# The dot and the waves, smooth and clean (owner, at 1080p: grainy, "sandpaper"): scene.py grains
# them like fired clay and resin, a bump from noise and, on the dot, a glow that varies with it;
# in daylight at 1080p that reads as speckle. Here the bumps go, the dot glows evenly at the
# middle of its old range, and the waves lose their subsurface (noisy seen through the glass).
# scene.py and the night clip keep theirs.
_dot = bpy.data.materials["Dot"]
_db = _dot.node_tree.nodes["Principled BSDF"]
for _inp in ("Normal", "Emission Strength"):
    for _l in list(_db.inputs[_inp].links):
        _dot.node_tree.links.remove(_l)
_db.inputs["Emission Strength"].default_value = float(A.get("dotglow", 2.1))
_db.inputs["Roughness"].default_value = 0.6
for _m in bpy.data.materials:
    if _m.name.startswith("Waves"):
        _b = _m.node_tree.nodes["Principled BSDF"]
        for _l in list(_b.inputs["Normal"].links):
            _m.node_tree.links.remove(_l)
        set_input(_b, ["Subsurface Weight", "Subsurface"], 0.0)


def loop_vector(nt, coords, radius):
    """Loops a 4D texture over the clip: (x, y, z + r cos a) and w = r sin a, a = one turn per
    loop, so the texture drifts smoothly and the last frame meets the first. Returns (vec, w)."""
    a = f"{T}*2*pi"
    zc = nt.nodes.new("ShaderNodeValue")
    zc.outputs[0].driver_add("default_value").driver.expression = f"{radius}*cos({a})"
    wc = nt.nodes.new("ShaderNodeValue")
    wc.outputs[0].driver_add("default_value").driver.expression = f"{radius}*sin({a})"
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    comb.inputs["Z"].default_value = 0.0
    shift = nt.nodes.new("ShaderNodeVectorMath")
    shift.operation = "ADD"
    nt.links.new(coords, shift.inputs[0])
    nt.links.new(zc.outputs[0], comb.inputs["Z"])
    nt.links.new(comb.outputs[0], shift.inputs[1])
    return shift.outputs[0], wc.outputs[0]


def material(name, color, rough=0.5, **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    for k, v in kw.items():
        set_input(b, k, v)
    return m


def box(name, lo, hi, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=[(a + b) / 2 for a, b in zip(lo, hi)])
    o = bpy.context.active_object
    o.name = name
    o.scale = [b - a for a, b in zip(lo, hi)]
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    return o


def caustic_network(nt, coords, radius=0.9):
    """Pool caustics as a 0..~1.4 value: two drifting Voronoi networks (distance to cell edge, as
    thin lines), each warped by fine noise so the lines wobble; they add, so crossings flare into
    bright knots, and a broad noise makes some patches stronger than others. Looped on the clip."""
    vec, wv = loop_vector(nt, coords, radius)
    caus = None
    for scale_, gain, wscale, seed in ((2.4, 0.8, 3.0, 0.0), (3.7, 0.6, 4.5, 7.0)):
        off = nt.nodes.new("ShaderNodeVectorMath")
        off.operation = "ADD"
        off.inputs[1].default_value = (seed, seed * 0.6, 0.0)
        nt.links.new(vec, off.inputs[0])
        warp = nt.nodes.new("ShaderNodeTexNoise")
        warp.noise_dimensions = "4D"
        warp.inputs["Scale"].default_value = wscale
        warp.inputs["Detail"].default_value = 3.0
        nt.links.new(off.outputs[0], warp.inputs["Vector"])
        nt.links.new(wv, warp.inputs["W"])
        wmix = nt.nodes.new("ShaderNodeMix")
        wmix.data_type = "VECTOR"
        wmix.inputs["Factor"].default_value = 0.12
        nt.links.new(off.outputs[0], wmix.inputs[4])
        nt.links.new(warp.outputs["Color"], wmix.inputs[5])
        v = nt.nodes.new("ShaderNodeTexVoronoi")
        v.voronoi_dimensions = "4D"
        v.feature = "DISTANCE_TO_EDGE"
        v.inputs["Scale"].default_value = scale_
        nt.links.new(wmix.outputs[1], v.inputs["Vector"])
        nt.links.new(wv, v.inputs["W"])
        r = nt.nodes.new("ShaderNodeMapRange")
        r.interpolation_type = "SMOOTHSTEP"
        r.inputs["From Min"].default_value = 0.0
        r.inputs["From Max"].default_value = 0.04
        r.inputs["To Min"].default_value = gain
        r.inputs["To Max"].default_value = 0.0
        nt.links.new(v.outputs["Distance"], r.inputs["Value"])
        if caus is None:
            caus = r.outputs[0]
        else:
            add_ = nt.nodes.new("ShaderNodeMath")
            add_.operation = "ADD"
            nt.links.new(caus, add_.inputs[0])
            nt.links.new(r.outputs[0], add_.inputs[1])
            caus = add_.outputs[0]
    patch = nt.nodes.new("ShaderNodeTexNoise")
    patch.noise_dimensions = "4D"
    patch.inputs["Scale"].default_value = 0.35
    nt.links.new(vec, patch.inputs["Vector"])
    nt.links.new(wv, patch.inputs["W"])
    prange = nt.nodes.new("ShaderNodeMapRange")
    prange.inputs["From Min"].default_value = 0.35
    prange.inputs["From Max"].default_value = 0.65
    prange.inputs["To Min"].default_value = 0.35
    prange.inputs["To Max"].default_value = 1.2
    nt.links.new(patch.outputs["Fac"], prange.inputs["Value"])
    pm = nt.nodes.new("ShaderNodeMath")
    pm.operation = "MULTIPLY"
    nt.links.new(caus, pm.inputs[0])
    nt.links.new(prange.outputs["Result"], pm.inputs[1])
    return pm.outputs[0]


def caustic_albedo(nt, color, coords, strength):
    """Base color lifted where the caustic lines fall (so the light, and any shadow, still decide
    where they show)."""
    lift = nt.nodes.new("ShaderNodeMath")
    lift.operation = "MULTIPLY_ADD"
    lift.inputs[1].default_value = strength
    lift.inputs[2].default_value = 1.0
    nt.links.new(caustic_network(nt, coords), lift.inputs[0])
    tint = nt.nodes.new("ShaderNodeVectorMath")
    tint.operation = "SCALE"
    nt.links.new(color, tint.inputs[0])
    nt.links.new(lift.outputs[0], tint.inputs["Scale"])
    nt.links.new(tint.outputs[0], nt.nodes["Principled BSDF"].inputs["Base Color"])


# ---------------------------------------------------------------------------------------------
# Sky: a clear tropical day with cumulus banks over the sea
# ---------------------------------------------------------------------------------------------
SUN_EL = math.radians(36)
# Front-left: its glow just reaches the frame's top-left corner, it draws a bright line down
# the glass's left edge, and the sea glitters on that side.
SUN_AZ = math.radians(-55)
world = bpy.data.worlds.new("Day")
scene.world = world
world.use_nodes = True
wt = world.node_tree
bg = wt.nodes["Background"]
to_sun = Vector((math.sin(SUN_AZ) * math.cos(SUN_EL), math.cos(SUN_AZ) * math.cos(SUN_EL), math.sin(SUN_EL)))
# The sky: a clean gradient by height (pale aqua at the horizon, clear blue overhead, deeper at
# the zenith) with a warm glow round the sun; drawn here rather than from a physical sky model,
# whose dusty horizon band read as beige haze behind the mark.
tc = wt.nodes.new("ShaderNodeTexCoord")
sep = wt.nodes.new("ShaderNodeSeparateXYZ")
wt.links.new(tc.outputs["Generated"], sep.inputs[0])
ramp = wt.nodes.new("ShaderNodeValToRGB")
el = ramp.color_ramp.elements
el[0].position, el[0].color = 0.0, (0.2, 0.52, 0.96, 1)
el[1].position, el[1].color = 1.0, (0.012, 0.07, 0.38, 1)
for pos, col in ((0.04, (0.07, 0.3, 0.88, 1)), (0.2, (0.03, 0.16, 0.7, 1))):
    e = el.new(pos)
    e.color = col
ramp.color_ramp.interpolation = "B_SPLINE"
wt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
dot_ = wt.nodes.new("ShaderNodeVectorMath")
dot_.operation = "DOT_PRODUCT"
dot_.inputs[1].default_value = to_sun
wt.links.new(tc.outputs["Generated"], dot_.inputs[0])
halo_ = wt.nodes.new("ShaderNodeMapRange")
halo_.inputs["From Min"].default_value = 0.82
halo_.inputs["From Max"].default_value = 1.0
wt.links.new(dot_.outputs["Value"], halo_.inputs["Value"])
hp = wt.nodes.new("ShaderNodeMath")
hp.operation = "POWER"
hp.inputs[1].default_value = 4.0
wt.links.new(halo_.outputs["Result"], hp.inputs[0])
glow_ = wt.nodes.new("ShaderNodeMix")
glow_.data_type = "RGBA"
glow_.blend_type = "ADD"
glow_.inputs[7].default_value = (1.5, 1.25, 0.9, 1)
wt.links.new(hp.outputs[0], glow_.inputs["Factor"])
wt.links.new(ramp.outputs["Color"], glow_.inputs[6])
SKY = glow_.outputs[2]
# Clouds: a noise field on a flat cloud deck (the view direction over its height), soft-edged,
# thinning to nothing toward the horizon.
zc = wt.nodes.new("ShaderNodeMath")
zc.operation = "MAXIMUM"
zc.inputs[1].default_value = 0.02
wt.links.new(sep.outputs["Z"], zc.inputs[0])
ux = wt.nodes.new("ShaderNodeMath")
ux.operation = "DIVIDE"
uy = wt.nodes.new("ShaderNodeMath")
uy.operation = "DIVIDE"
wt.links.new(sep.outputs["X"], ux.inputs[0])
wt.links.new(zc.outputs[0], ux.inputs[1])
wt.links.new(sep.outputs["Y"], uy.inputs[0])
wt.links.new(zc.outputs[0], uy.inputs[1])
uv = wt.nodes.new("ShaderNodeCombineXYZ")
wt.links.new(ux.outputs[0], uv.inputs["X"])
wt.links.new(uy.outputs[0], uv.inputs["Y"])
cn = wt.nodes.new("ShaderNodeTexNoise")
cn.inputs["Scale"].default_value = 0.38
cn.inputs["Detail"].default_value = 8.0
cn.inputs["Roughness"].default_value = 0.58
wt.links.new(uv.outputs[0], cn.inputs["Vector"])
cmask = wt.nodes.new("ShaderNodeMapRange")
cmask.inputs["From Min"].default_value = 0.55
cmask.inputs["From Max"].default_value = 0.68
wt.links.new(cn.outputs["Fac"], cmask.inputs["Value"])
fade = wt.nodes.new("ShaderNodeMapRange")
fade.inputs["From Min"].default_value = 0.022
fade.inputs["From Max"].default_value = 0.09
wt.links.new(sep.outputs["Z"], fade.inputs["Value"])
cm = wt.nodes.new("ShaderNodeMath")
cm.operation = "MULTIPLY"
wt.links.new(cmask.outputs["Result"], cm.inputs[0])
wt.links.new(fade.outputs["Result"], cm.inputs[1])
# Cloud colour: sunlit white, a little greyer where they are thick, mixed over the sky.
grey = wt.nodes.new("ShaderNodeMapRange")
grey.inputs["From Min"].default_value = 0.55
grey.inputs["From Max"].default_value = 0.8
grey.inputs["To Min"].default_value = float(A.get("cloud", 2.4))
grey.inputs["To Max"].default_value = float(A.get("cloud", 2.4)) * 0.62
wt.links.new(cn.outputs["Fac"], grey.inputs["Value"])
ccol = wt.nodes.new("ShaderNodeCombineXYZ")
wt.links.new(grey.outputs["Result"], ccol.inputs["X"])
wt.links.new(grey.outputs["Result"], ccol.inputs["Y"])
gb = wt.nodes.new("ShaderNodeMath")
gb.operation = "MULTIPLY"
gb.inputs[1].default_value = 1.04
wt.links.new(grey.outputs["Result"], gb.inputs[0])
wt.links.new(gb.outputs[0], ccol.inputs["Z"])
cloud = wt.nodes.new("ShaderNodeMix")
cloud.data_type = "RGBA"
cloud.blend_type = "MIX"
cm2 = wt.nodes.new("ShaderNodeMath")
cm2.operation = "MULTIPLY"
cm2.inputs[1].default_value = 0.92
wt.links.new(cm.outputs[0], cm2.inputs[0])
wt.links.new(cm2.outputs[0], cloud.inputs["Factor"])
wt.links.new(SKY, cloud.inputs[6])
wt.links.new(ccol.outputs[0], cloud.inputs[7])
# Cumulus banks low over the sea: heaps whose height varies round the horizon (noise on the
# compass direction), with puffy edges (fine 3D noise), grey-blue at the base and sunlit at the
# top. Only a few azimuths carry them, so the sky stays mostly clear.
hz = wt.nodes.new("ShaderNodeCombineXYZ")
wt.links.new(sep.outputs["X"], hz.inputs["X"])
wt.links.new(sep.outputs["Y"], hz.inputs["Y"])
hn_ = wt.nodes.new("ShaderNodeVectorMath")
hn_.operation = "NORMALIZE"
wt.links.new(hz.outputs[0], hn_.inputs[0])
heap = wt.nodes.new("ShaderNodeTexNoise")
heap.inputs["Scale"].default_value = 1.7
heap.inputs["Detail"].default_value = 3.0
wt.links.new(hn_.outputs[0], heap.inputs["Vector"])
hh = wt.nodes.new("ShaderNodeMapRange")
hh.inputs["From Min"].default_value = 0.5
hh.inputs["From Max"].default_value = 0.72
hh.inputs["To Min"].default_value = 0.0
hh.inputs["To Max"].default_value = 0.1
wt.links.new(heap.outputs["Fac"], hh.inputs["Value"])
# Lower straight out to sea, behind the mark, so the glass has clear blue sky behind it; the
# banks stand off to the sides.
hsep = wt.nodes.new("ShaderNodeSeparateXYZ")
wt.links.new(hn_.outputs[0], hsep.inputs[0])
habs = wt.nodes.new("ShaderNodeMath")
habs.operation = "ABSOLUTE"
wt.links.new(hsep.outputs["X"], habs.inputs[0])
hside = wt.nodes.new("ShaderNodeMapRange")
hside.inputs["From Min"].default_value = 0.12
hside.inputs["From Max"].default_value = 0.5
hside.inputs["To Min"].default_value = 0.2
wt.links.new(habs.outputs[0], hside.inputs["Value"])
hw = wt.nodes.new("ShaderNodeMath")
hw.operation = "MULTIPLY"
wt.links.new(hh.outputs["Result"], hw.inputs[0])
wt.links.new(hside.outputs["Result"], hw.inputs[1])
HH = hw.outputs[0]
puff = wt.nodes.new("ShaderNodeTexNoise")
puff.inputs["Scale"].default_value = 16.0
puff.inputs["Detail"].default_value = 6.0
puff.inputs["Roughness"].default_value = 0.6
wt.links.new(tc.outputs["Generated"], puff.inputs["Vector"])
pc = wt.nodes.new("ShaderNodeMath")
pc.operation = "MULTIPLY_ADD"
pc.inputs[1].default_value = 0.05
pc.inputs[2].default_value = -0.025
wt.links.new(puff.outputs["Fac"], pc.inputs[0])
edge_ = wt.nodes.new("ShaderNodeMath")
edge_.operation = "SUBTRACT"
wt.links.new(HH, edge_.inputs[0])
wt.links.new(sep.outputs["Z"], edge_.inputs[1])
edge2 = wt.nodes.new("ShaderNodeMath")
edge2.operation = "ADD"
wt.links.new(edge_.outputs[0], edge2.inputs[0])
wt.links.new(pc.outputs[0], edge2.inputs[1])
cmask2 = wt.nodes.new("ShaderNodeMapRange")
cmask2.inputs["From Min"].default_value = 0.0
cmask2.inputs["From Max"].default_value = 0.01
cmask2.inputs["To Max"].default_value = 0.95
wt.links.new(edge2.outputs[0], cmask2.inputs["Value"])
# A heap's opacity grows with its height, so banks thin out softly at their ends instead of
# stopping (their reflection on the sea would show the cut).
hsoft = wt.nodes.new("ShaderNodeMapRange")
hsoft.inputs["From Min"].default_value = 0.0
hsoft.inputs["From Max"].default_value = 0.05
wt.links.new(HH, hsoft.inputs["Value"])
cm3 = wt.nodes.new("ShaderNodeMath")
cm3.operation = "MULTIPLY"
wt.links.new(cmask2.outputs["Result"], cm3.inputs[0])
wt.links.new(hsoft.outputs["Result"], cm3.inputs[1])
# Shade: height within the heap (0 at the sea, 1 at its top).
hgt_ = wt.nodes.new("ShaderNodeMath")
hgt_.operation = "DIVIDE"
hmax = wt.nodes.new("ShaderNodeMath")
hmax.operation = "MAXIMUM"
hmax.inputs[1].default_value = 0.005
wt.links.new(HH, hmax.inputs[0])
wt.links.new(sep.outputs["Z"], hgt_.inputs[0])
wt.links.new(hmax.outputs[0], hgt_.inputs[1])
shade = wt.nodes.new("ShaderNodeValToRGB")
shade.color_ramp.elements[0].color = (0.42, 0.66, 0.95, 1)  # the base, close to the horizon sky
shade.color_ramp.elements[1].position = 0.7
shade.color_ramp.elements[1].color = (2.5, 2.4, 2.25, 1)
wt.links.new(hgt_.outputs[0], shade.inputs["Fac"])
bank = wt.nodes.new("ShaderNodeMix")
bank.data_type = "RGBA"
wt.links.new(cm3.outputs[0], bank.inputs["Factor"])
wt.links.new(cloud.outputs[2], bank.inputs[6])
wt.links.new(shade.outputs["Color"], bank.inputs[7])
wt.links.new(bank.outputs[2], bg.inputs["Color"])
bg.inputs["Strength"].default_value = float(A.get("sky", 1.32))

sun = bpy.data.lights.new("Sun", "SUN")
sun.energy = float(A.get("sunpower", 6.5))
sun.angle = math.radians(0.8)
sun.color = (1.0, 0.91, 0.78)  # warm
so = bpy.data.objects.new("Sun", sun)
scene.collection.objects.link(so)
# A sun lamp shines down its -Z: point it from the sun's place in the sky toward the scene.
so.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()
halo_.inputs["From Min"].default_value = 0.78

# Two soft strips that light only the mark (light linking, as in scene.py): its rounded edge
# carries a bright line against the water, so clear glass never melts into a bright day.
# Wide and soft enough that, crossing the face as the mark turns, they read as a gentle glint,
# not a white bar over the dot (owner).
for name, power, loc, sz in (("Edge left", 150, (-5.0, -3.5, 4.2), (1.2, 5.0)),
                             ("Edge right", 90, (5.2, 2.0, 3.4), (1.2, 5.0))):
    l = bpy.data.lights.new(name, "AREA")
    l.shape = "RECTANGLE"
    l.size, l.size_y = sz
    l.energy = power
    l.color = (1.0, 0.98, 0.95)
    o = bpy.data.objects.new(name, l)
    o.location = loc
    o.rotation_euler = (Vector((0, 0, PIN_Z)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(o)
    if hasattr(o, "light_linking"):
        o.light_linking.receiver_collection = pin_parts
    o.visible_transmission = False

# ---------------------------------------------------------------------------------------------
# The pool: one infinity edge, the water running out to it on every side of the frame
# ---------------------------------------------------------------------------------------------
X0, X1, Y0, Y1 = -60.0, 60.0, -30.0, 12.0
DEPTH = 1.5
tiles = material("Pool tiles", (0.02, 0.22, 0.28), 0.35)
tn = tiles.node_tree
ttc = tn.nodes.new("ShaderNodeTexCoord")
brick = tn.nodes.new("ShaderNodeTexBrick")  # a fine deep-teal mosaic
brick.offset = 0.0
brick.inputs["Scale"].default_value = 1.0
brick.inputs["Brick Width"].default_value = 0.15
brick.inputs["Row Height"].default_value = 0.15
brick.inputs["Mortar Size"].default_value = 0.006
brick.inputs["Mortar Smooth"].default_value = 0.3
brick.inputs["Color1"].default_value = (0.018, 0.22, 0.28, 1)
brick.inputs["Color2"].default_value = (0.024, 0.26, 0.32, 1)
brick.inputs["Mortar"].default_value = (0.14, 0.38, 0.4, 1)
brick.inputs["Bias"].default_value = 0.0
tn.links.new(ttc.outputs["Object"], brick.inputs["Vector"])
caustic_albedo(tn, brick.outputs["Color"], ttc.outputs["Object"], float(A.get("caustics", 3.0)))
box("Pool floor", (X0, Y0, -DEPTH - 0.2), (X1, Y1 + 0.3, -DEPTH), tiles)
# The infinity edge: a pale stone lip just under the water, the water rolling over it in a
# rounded sheet whose crest catches a thin line of sky and sun; beyond it the sea, deeper
# blue and well below.
box("Weir", (X0, Y1 - 0.5, -DEPTH), (X1, Y1, -0.06), tiles)
box("Lip", (X0, Y1 - 0.3, -0.06), (X1, Y1, -0.008), material("Lip", (0.92, 0.9, 0.84), 0.2))
wmat = bpy.data.materials.new("Pool water")
wmat.use_nodes = True
wn = wmat.node_tree
wb = wn.nodes["Principled BSDF"]
wb.inputs["Base Color"].default_value = (1, 1, 1, 1)
wb.inputs["Roughness"].default_value = 0.015
wb.inputs["IOR"].default_value = 1.333
set_input(wb, ["Transmission Weight", "Transmission"], 1.0)
wtc = wn.nodes.new("ShaderNodeTexCoord")
vec, wv = loop_vector(wn, wtc.outputs["Object"], 0.55)
rip = wn.nodes.new("ShaderNodeTexNoise")
rip.noise_dimensions = "4D"
rip.inputs["Scale"].default_value = 1.4
rip.inputs["Detail"].default_value = 6.0
rip.inputs["Roughness"].default_value = 0.5
wn.links.new(vec, rip.inputs["Vector"])
wn.links.new(wv, rip.inputs["W"])
wbump = wn.nodes.new("ShaderNodeBump")
wbump.inputs["Strength"].default_value = 0.22
wbump.inputs["Distance"].default_value = 0.03
wn.links.new(rip.outputs["Fac"], wbump.inputs["Height"])
wn.links.new(wbump.outputs["Normal"], wb.inputs["Normal"])
absorb = wn.nodes.new("ShaderNodeVolumeAbsorption")
absorb.inputs["Color"].default_value = (0.45, 0.9, 0.86, 1)
absorb.inputs["Density"].default_value = 0.22
wn.links.new(absorb.outputs[0], wn.nodes["Material Output"].inputs["Volume"])
water = box("Pool water", (X0 + 0.001, Y0 + 0.001, -DEPTH + 0.001), (X1 - 0.001, Y1 - 0.001, 0.0), wmat)
# Sunlight reaches the floor through the water (the caustics above stand in for the focusing).
water.visible_shadow = False
spill = bpy.data.materials.new("Spill")
spill.use_nodes = True
spn = spill.node_tree
spb = spn.nodes["Principled BSDF"]
spb.inputs["Base Color"].default_value = (0.75, 0.95, 0.95, 1)
spb.inputs["Roughness"].default_value = 0.04
spb.inputs["IOR"].default_value = 1.333
set_input(spb, ["Transmission Weight", "Transmission"], 1.0)
spz = spn.nodes.new("ShaderNodeTexNoise")
spz.inputs["Scale"].default_value = 30.0
spz.inputs["Detail"].default_value = 4.0
spt = spn.nodes.new("ShaderNodeTexCoord")
spm = spn.nodes.new("ShaderNodeMapping")
spm.inputs["Scale"].default_value = (1.0, 1.0, 0.15)  # streaks running down
spn.links.new(spt.outputs["Object"], spm.inputs["Vector"])
spn.links.new(spm.outputs["Vector"], spz.inputs["Vector"])
spbump = spn.nodes.new("ShaderNodeBump")
spbump.inputs["Strength"].default_value = 0.4
spn.links.new(spz.outputs["Fac"], spbump.inputs["Height"])
spn.links.new(spbump.outputs["Normal"], spb.inputs["Normal"])
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.055, depth=X1 - X0, location=(0, Y1, -0.055),
                                    rotation=(0, math.pi / 2, 0))
curl = bpy.context.active_object
curl.name = "Curl"
curl.data.polygons.foreach_set("use_smooth", [True] * len(curl.data.polygons))
curl.data.materials.append(spill)
curl.visible_shadow = False
sp = box("Spill", (X0, Y1, -0.76), (X1, Y1 + 0.035, -0.004), spill)
bv = sp.modifiers.new("Lip", "BEVEL")
bv.width = 0.016
bv.segments = 4
sp.visible_shadow = False
# The sea far below the edge, out to the horizon.
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -36))
sea = bpy.context.active_object
sea.name = "Sea"
sea.scale = (40000, 40000, 1)
smat = bpy.data.materials.new("Sea")
smat.use_nodes = True
sn = smat.node_tree
sb = sn.nodes["Principled BSDF"]
# Saturated turquoise toward the horizon, deepening to sapphire nearer the pool, and much
# less of a mirror than the pool, so it reads as tropical water rather than reflected haze.
set_input(sb, ["Specular IOR Level", "Specular"], 0.14)  # replaced by the ramp below
sgeo = sn.nodes.new("ShaderNodeNewGeometry")
sxy = sn.nodes.new("ShaderNodeVectorMath")
sxy.operation = "MULTIPLY"
sxy.inputs[1].default_value = (1.0, 1.0, 0.0)
sn.links.new(sgeo.outputs["Position"], sxy.inputs[0])
sdist = sn.nodes.new("ShaderNodeVectorMath")
sdist.operation = "LENGTH"
sn.links.new(sxy.outputs[0], sdist.inputs[0])
sfar = sn.nodes.new("ShaderNodeMapRange")
sfar.inputs["From Min"].default_value = 150.0
sfar.inputs["From Max"].default_value = 2500.0
sn.links.new(sdist.outputs["Value"], sfar.inputs["Value"])
scol = sn.nodes.new("ShaderNodeValToRGB")
scol.color_ramp.elements[0].color = (0.002, 0.05, 0.2, 1)  # sapphire
scol.color_ramp.elements[1].color = (0.0, 0.55, 0.45, 1)  # turquoise
sn.links.new(sfar.outputs["Result"], scol.inputs["Fac"])
sn.links.new(scol.outputs["Color"], sb.inputs["Base Color"])
# Far out, where a real sea reflects mostly sky, let its colour win instead.
sspec = sn.nodes.new("ShaderNodeMapRange")
sspec.inputs["From Min"].default_value = 150.0
sspec.inputs["From Max"].default_value = 4000.0
sspec.inputs["To Min"].default_value = 0.2
sspec.inputs["To Max"].default_value = 0.015
sn.links.new(sdist.outputs["Value"], sspec.inputs["Value"])
sn.links.new(sspec.outputs["Result"], sb.inputs["Specular IOR Level"])
# Sun glitter: tiny points of sunlight on the swell, densest toward the sun's side and the
# horizon, twinkling on the clip's period (drawn, since a real sun this high glints below the
# pool's edge, out of sight).
# Points fixed in the view direction from the pool (about 0.14 degrees apart, a few pixels), only
# one cell in six lit, each a sub-pixel point. Each flashes on its own phase, nine times per loop,
# brief and bright (a sine to the 8th power): a smooth twinkle that loops, never a new random
# field each frame.
gview = sn.nodes.new("ShaderNodeVectorMath")
gview.operation = "NORMALIZE"
sn.links.new(sgeo.outputs["Position"], gview.inputs[0])
gv = sn.nodes.new("ShaderNodeTexVoronoi")
gv.voronoi_dimensions = "3D"
gv.inputs["Scale"].default_value = 420.0
sn.links.new(gview.outputs[0], gv.inputs["Vector"])
gpt = sn.nodes.new("ShaderNodeMapRange")
gpt.inputs["From Min"].default_value = 0.0
gpt.inputs["From Max"].default_value = 0.07
gpt.inputs["To Min"].default_value = 1.0
gpt.inputs["To Max"].default_value = 0.0
sn.links.new(gv.outputs["Distance"], gpt.inputs["Value"])
grnd = sn.nodes.new("ShaderNodeSeparateColor")  # per point: which are lit, and their phase
sn.links.new(gv.outputs["Color"], grnd.inputs[0])
glit = sn.nodes.new("ShaderNodeMapRange")
glit.inputs["From Min"].default_value = 0.83
glit.inputs["From Max"].default_value = 0.85
sn.links.new(grnd.outputs[0], glit.inputs["Value"])
gclock = sn.nodes.new("ShaderNodeValue")
gclock.outputs[0].driver_add("default_value").driver.expression = f"{T}*2*pi*9"
gph = sn.nodes.new("ShaderNodeMath")
gph.operation = "MULTIPLY_ADD"
gph.inputs[1].default_value = 2 * math.pi
sn.links.new(grnd.outputs[1], gph.inputs[0])
sn.links.new(gclock.outputs[0], gph.inputs[2])
gsin = sn.nodes.new("ShaderNodeMath")
gsin.operation = "SINE"
sn.links.new(gph.outputs[0], gsin.inputs[0])
gpos = sn.nodes.new("ShaderNodeMath")
gpos.operation = "MAXIMUM"
gpos.inputs[1].default_value = 0.0
sn.links.new(gsin.outputs[0], gpos.inputs[0])
gflash = sn.nodes.new("ShaderNodeMath")
gflash.operation = "POWER"
gflash.inputs[1].default_value = 8.0
sn.links.new(gpos.outputs[0], gflash.inputs[0])
gdir = sn.nodes.new("ShaderNodeVectorMath")
gdir.operation = "NORMALIZE"
sn.links.new(sxy.outputs[0], gdir.inputs[0])
gsun = sn.nodes.new("ShaderNodeVectorMath")
gsun.operation = "DOT_PRODUCT"
gsun.inputs[1].default_value = (math.sin(SUN_AZ), math.cos(SUN_AZ), 0.0)
sn.links.new(gdir.outputs[0], gsun.inputs[0])
gside = sn.nodes.new("ShaderNodeMapRange")  # more toward the sun's side
gside.inputs["From Min"].default_value = 0.2
gside.inputs["From Max"].default_value = 1.0
gside.inputs["To Min"].default_value = 0.25
sn.links.new(gsun.outputs["Value"], gside.inputs["Value"])
gs = sn.nodes.new("ShaderNodeMath")
gs.operation = "MULTIPLY"
gs.inputs[1].default_value = float(A.get("glitter", 2500.0))
prev = gpt.outputs["Result"]
for f_ in (glit.outputs["Result"], gflash.outputs[0], gside.outputs["Result"], sfar.outputs["Result"]):
    gm = sn.nodes.new("ShaderNodeMath")
    gm.operation = "MULTIPLY"
    sn.links.new(prev, gm.inputs[0])
    sn.links.new(f_, gm.inputs[1])
    prev = gm.outputs[0]
sn.links.new(prev, gs.inputs[0])
sb.inputs["Emission Color"].default_value = (1.0, 0.93, 0.8, 1)
sn.links.new(gs.outputs[0], sb.inputs["Emission Strength"])
sb.inputs["Roughness"].default_value = 0.02
stc = sn.nodes.new("ShaderNodeTexCoord")
# The loop's circle is in object space, before the plane's huge Scale: divide by it, or the
# swell is redrawn almost from scratch every frame and the sea flickers (owner: "The ocean is
# spazzing"). This way the swell drifts about 2.5 noise cells over the whole loop.
vec, wv = loop_vector(sn, stc.outputs["Object"], 0.4 / (40000 / 30))
swave = sn.nodes.new("ShaderNodeTexNoise")
swave.noise_dimensions = "4D"
swave.inputs["Scale"].default_value = 40000 / 30  # object space is the scaled plane: ~30 m swells
swave.inputs["Detail"].default_value = 12.0
sn.links.new(vec, swave.inputs["Vector"])
sn.links.new(wv, swave.inputs["W"])
sbump = sn.nodes.new("ShaderNodeBump")
sbump.inputs["Strength"].default_value = 1.0
sbump.inputs["Distance"].default_value = 6.0  # facets steep enough to glitter
sn.links.new(swave.outputs["Fac"], sbump.inputs["Height"])
sn.links.new(sbump.outputs["Normal"], sb.inputs["Normal"])
sea.data.materials.append(smat)

# ---------------------------------------------------------------------------------------------
# Palms, off the frame's sides: only their frond tips reach in at the top corners, soft in
# the depth of field, and one throws its shadow across the pool floor.
# ---------------------------------------------------------------------------------------------
# Leaflets: two greens varied leaflet by leaflet, drying to straw at the tips, and translucent,
# so the sun glows through the fronds when they stand against it.
leaf = bpy.data.materials.new("Palm leaf")
leaf.use_nodes = True
ln = leaf.node_tree
lb = ln.nodes["Principled BSDF"]
lb.inputs["Roughness"].default_value = 0.38
set_input(lb, ["Subsurface Weight", "Subsurface"], 0.0)
lgeo = ln.nodes.new("ShaderNodeNewGeometry")
lramp = ln.nodes.new("ShaderNodeValToRGB")
lramp.color_ramp.elements[0].color = (0.1, 0.24, 0.045, 1)
lramp.color_ramp.elements[1].color = (0.2, 0.38, 0.08, 1)
ln.links.new(lgeo.outputs["Random Per Island"], lramp.inputs["Fac"])
luv = ln.nodes.new("ShaderNodeTexCoord")
lsep = ln.nodes.new("ShaderNodeSeparateXYZ")
ln.links.new(luv.outputs["UV"], lsep.inputs[0])
ltip = ln.nodes.new("ShaderNodeMapRange")
ltip.inputs["From Min"].default_value = 0.78
ltip.inputs["From Max"].default_value = 1.0
ltip.inputs["To Max"].default_value = 0.75
ln.links.new(lsep.outputs["X"], ltip.inputs["Value"])
ldry = ln.nodes.new("ShaderNodeMix")
ldry.data_type = "RGBA"
ldry.inputs[7].default_value = (0.32, 0.26, 0.09, 1)
ln.links.new(ltip.outputs["Result"], ldry.inputs["Factor"])
ln.links.new(lramp.outputs["Color"], ldry.inputs[6])
ln.links.new(ldry.outputs[2], lb.inputs["Base Color"])
lglow = ln.nodes.new("ShaderNodeMix")  # what the sun shows through: a warmer, lighter green
lglow.data_type = "RGBA"
lglow.blend_type = "MULTIPLY"
lglow.inputs["Factor"].default_value = 1.0
lglow.inputs[7].default_value = (3.6, 3.3, 1.8, 1)
ln.links.new(ldry.outputs[2], lglow.inputs[6])
transl = ln.nodes.new("ShaderNodeBsdfTranslucent")
ln.links.new(lglow.outputs[2], transl.inputs["Color"])
lmix = ln.nodes.new("ShaderNodeMixShader")
lmix.inputs["Fac"].default_value = 0.7
ln.links.new(lb.outputs[0], lmix.inputs[1])
ln.links.new(transl.outputs[0], lmix.inputs[2])
ln.links.new(lmix.outputs[0], ln.nodes["Material Output"].inputs["Surface"])
# Trunk: grey-brown with the saw-tooth rings of old leaf scars, fine vertical fibres, darker
# and smoother toward the base.
bark = material("Palm bark", (0.4, 0.35, 0.29), 0.85)
bkn = bark.node_tree
bkb_ = bkn.nodes["Principled BSDF"]
bkt = bkn.nodes.new("ShaderNodeTexCoord")
bkw = bkn.nodes.new("ShaderNodeTexWave")
bkw.bands_direction = "Z"
bkw.wave_profile = "SAW"
bkw.inputs["Scale"].default_value = 1.2
bkw.inputs["Distortion"].default_value = 1.2
bkw.inputs["Detail"].default_value = 2.0
bkn.links.new(bkt.outputs["Object"], bkw.inputs["Vector"])
bkm = bkn.nodes.new("ShaderNodeMapping")
bkm.inputs["Scale"].default_value = (1.0, 1.0, 0.06)
bkn.links.new(bkt.outputs["Object"], bkm.inputs["Vector"])
bkf = bkn.nodes.new("ShaderNodeTexNoise")
bkf.inputs["Scale"].default_value = 30.0
bkf.inputs["Detail"].default_value = 8.0
bkn.links.new(bkm.outputs["Vector"], bkf.inputs["Vector"])
bka = bkn.nodes.new("ShaderNodeMath")
bka.operation = "MULTIPLY_ADD"
bka.inputs[1].default_value = 0.6
bkn.links.new(bkw.outputs["Fac"], bka.inputs[0])
bkn.links.new(bkf.outputs["Fac"], bka.inputs[2])
bkc = bkn.nodes.new("ShaderNodeValToRGB")
bkc.color_ramp.elements[0].position = 0.35
bkc.color_ramp.elements[0].color = (0.13, 0.11, 0.09, 1)
bkc.color_ramp.elements[1].position = 1.2 / 1.6
bkc.color_ramp.elements[1].color = (0.5, 0.45, 0.38, 1)
bkd = bkn.nodes.new("ShaderNodeMath")
bkd.operation = "MULTIPLY"
bkd.inputs[1].default_value = 0.62
bkn.links.new(bka.outputs[0], bkd.inputs[0])
bkn.links.new(bkd.outputs[0], bkc.inputs["Fac"])
bkn.links.new(bkc.outputs["Color"], bkb_.inputs["Base Color"])
bkb = bkn.nodes.new("ShaderNodeBump")
bkb.inputs["Strength"].default_value = 0.8
bkb.inputs["Distance"].default_value = 0.02
bkn.links.new(bka.outputs[0], bkb.inputs["Height"])
bkn.links.new(bkb.outputs["Normal"], bkb_.inputs["Normal"])


def frond_mesh(name, length, seed, leaflets=46):
    """A palm frond along +X: a drooping rachis with folded, tapering leaflets on both sides,
    each a separate strip (so each takes its own shade), angled forward and hanging lower toward
    the tip, with the odd one missing."""
    import random
    rnd = random.Random(seed)
    verts, faces, uvs = [], [], []

    def spine(t):
        return Vector((t * length, 0.0, 0.55 * length * t - 0.95 * length * t * t))

    for i in range(1, leaflets):
        t = i / leaflets
        p = spine(t)
        q = spine(min(t + 0.02, 1.0))
        along = (q - p).normalized()
        span = (0.95 * math.sin(math.pi * min(t * 1.15, 1.0)) ** 0.7 + 0.15) * 0.75 * rnd.uniform(0.85, 1.1)
        for side in (-1, 1):
            if rnd.random() < 0.05:
                continue
            out_ = Vector((0.3 * along.x, side * 1.0, 0.0)).normalized()
            d = (out_ + Vector((0, 0, -0.35 - 0.3 * t + rnd.uniform(-0.1, 0.1))) + along * 0.4).normalized()
            across = d.cross(Vector((0, 0, 1)))
            across = across.normalized() if across.length > 1e-6 else along
            up = across.cross(d).normalized()
            if up.z < 0:
                up = -up
            w0 = 0.04 + 0.022 * (1 - t)
            base = len(verts)
            us = (0.0, 0.2, 0.45, 0.7, 0.9, 1.0)
            for u in us:
                c = p + d * span * u + Vector((0, 0, -0.14 * span * u * u))
                w = w0 * (1 - u) ** 0.55 * (0.55 if u == 0 else 1.0)
                fold = 0.45 * w  # a V along the midrib: the edges sit lower
                verts += [c + across * w - up * fold, c, c - across * w - up * fold]
                uvs += [(u, 0.0), (u, 0.5), (u, 1.0)]
            for r_i in range(len(us) - 1):
                a_ = base + 3 * r_i
                b_ = a_ + 3
                faces += [(a_, b_, b_ + 1, a_ + 1), (a_ + 1, b_ + 1, b_ + 2, a_ + 2)]
    # The rachis, a thin ribbon.
    base = len(verts)
    n = 30
    for i in range(n + 1):
        p = spine(i / n)
        w = 0.035 * (1 - 0.7 * i / n)
        verts += [p + Vector((0, w, 0)), p - Vector((0, w, 0))]
        uvs += [(0.3, 0.0), (0.3, 1.0)]
    for i in range(n):
        a_ = base + 2 * i
        faces.append((a_, a_ + 1, a_ + 3, a_ + 2))
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    uv = me.uv_layers.new()
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = uvs[me.loops[li].vertex_index]
    me.materials.append(leaf)
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    return me


FROND_MESHES = [frond_mesh(f"Frond {k}", 3.8 + 0.4 * k, k) for k in range(3)]


def palm(name, base, height, lean, seed):
    """A curved trunk leaning by `lean` (x, y metres at the top), and a crown of swaying fronds."""
    import random
    rnd = random.Random(seed)
    rings, seg = 24, 16
    verts, faces = [], []
    top = None
    for i in range(rings + 1):
        t = i / rings
        # A gentle S: out with the lean, then the top curving back up toward the light.
        bend = t * t - 0.35 * t ** 4
        c = Vector(base) + Vector((lean[0] * bend, lean[1] * bend, height * t))
        r = 0.27 * (1 - 0.3 * t) + 0.1 * max(0, 0.15 - t) / 0.15
        for j in range(seg):
            a = 2 * math.pi * j / seg
            verts.append(tuple(c + Vector((r * math.cos(a), r * math.sin(a), 0))))
        top = c
    for i in range(rings):
        for j in range(seg):
            a, b = i * seg + j, i * seg + (j + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    me = bpy.data.meshes.new(name + " trunk")
    me.from_pydata(verts, [], faces)
    me.materials.append(bark)
    for p in me.polygons:
        p.use_smooth = True
    trunk = bpy.data.objects.new(name + " trunk", me)
    scene.collection.objects.link(trunk)
    crown = bpy.data.objects.new(name + " crown", None)
    crown.location = top
    scene.collection.objects.link(crown)
    # The boot of old leaf bases under the crown.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.42, location=top)
    boot = bpy.context.active_object
    boot.name = name + " boot"
    boot.scale = (1.0, 1.0, 1.3)
    boot.data.materials.append(bark)
    boot.data.polygons.foreach_set("use_smooth", [True] * len(boot.data.polygons))
    # The whole crown leans a little with the breeze (two periods per loop).
    for ax, amp, ph in ((0, 0.035, 0.0), (1, 0.03, 1.3)):
        crown.driver_add("rotation_euler", ax).driver.expression = \
            f"{amp}*sin({T}*2*pi*2+{seed}+{ph})"
    count = 22
    for k in range(count):
        f = bpy.data.objects.new(f"{name} frond {k}", FROND_MESHES[k % 3])
        scene.collection.objects.link(f)
        f.parent = crown
        yaw = 2 * math.pi * k / count + rnd.uniform(-0.15, 0.15)
        pitch = (0.5 if k % 2 else -0.15) + rnd.uniform(-0.2, 0.2)  # young fronds lift, old droop
        s = rnd.uniform(0.85, 1.1)
        f.scale = (s, s, s)
        f.rotation_mode = "ZYX"
        f.rotation_euler = (rnd.uniform(-0.3, 0.3), -pitch, yaw)
        # Each frond flutters on its own (four periods per loop, so it all loops).
        f.driver_add("rotation_euler", 1).driver.expression = \
            f"{-pitch:.3f} + 0.05*sin({T}*2*pi*4+{k * 1.7 + seed:.2f})"
        f.driver_add("rotation_euler", 0).driver.expression = \
            f"{f.rotation_euler[0]:.3f} + 0.06*sin({T}*2*pi*3+{k * 2.3 + seed:.2f})"
    return trunk

palm("Palm left", (-11.0, 3.2, -DEPTH), 7.3, (4.0, 1.2), 21)
palm("Palm right", (11.8, 5.4, -DEPTH), 7.7, (-4.2, 0.9), 22)

# ---------------------------------------------------------------------------------------------
# Camera: face-on, drifting a few degrees each way while the mark turns, still face-on
# ---------------------------------------------------------------------------------------------

cam_data = bpy.data.cameras.new("Camera")
cam_data.lens = 42
cam_data.dof.use_dof = True
# f/2: the clouds and fronds still soft, the sea's far glints small points rather than discs of
# bokeh (owner: "specks or snow" at f/1.2).
cam_data.dof.aperture_fstop = float(A.get("fstop", 2.0))
cam = bpy.data.objects.new("Camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
target = bpy.data.objects.new("Target", None)
# The lens at the height of the mark's waves, so the horizon runs through them.
target.location = (0, 0, 1.88)
scene.collection.objects.link(target)
track = cam.constraints.new("TRACK_TO")
track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"
cam_data.dof.focus_object = target
R, H = 7.6, 2.0
# Still at the hold (it rises from zero as x^5), out to about 5.5 degrees either side.
drift = f"radians(10.5)*sin({X})*{EASE}"
cam.driver_add("location", 0).driver.expression = f"{R}*sin({drift})"
cam.driver_add("location", 1).driver.expression = f"-{R}*cos({drift})"
cam.driver_add("location", 2).driver.expression = f"{H} + 0.12*{EASE}"
for ob in (cam, pin):
    for fc in ob.animation_data.drivers:
        if not fc.driver.is_simple_expression:
            raise SystemExit(f"driver is not a simple expression: {fc.driver.expression}")
# A soft reflector riding above and behind the lens, lighting only the mark: the glass always has
# something bright to reflect, so it stays clear at every angle of the turn.
rf = bpy.data.lights.new("Reflector", "AREA")
rf.shape = "RECTANGLE"
rf.size, rf.size_y = 5.0, 2.5
# Gentle: over the bright sea, more of it would turn the glass milky.
rf.energy = float(A.get("reflector", 60))
rf.color = (1.0, 0.98, 0.95)
rfo = bpy.data.objects.new("Reflector", rf)
scene.collection.objects.link(rfo)
rfo.parent = cam
rfo.location = (0.0, 1.2, 3.0)  # camera space: above and behind the lens, facing the mark
rfo.rotation_euler = (math.radians(-12), 0, 0)
if hasattr(rfo, "light_linking"):
    rfo.light_linking.receiver_collection = pin_parts
rfo.visible_camera = False
rfo.visible_transmission = False
rfo.visible_glossy = False  # its rectangle reflected as a hard-edged step across the dot

# ---------------------------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------------------------

scene.render.engine = "CYCLES"
cy = scene.cycles
cy.samples = int(A.get("samples", 160))
cy.use_denoising = True
cy.denoiser = "OPENIMAGEDENOISE"
cy.max_bounces = 16
cy.transmission_bounces = 16
cy.glossy_bounces = 8
cy.transparent_max_bounces = 16
cy.volume_bounces = 2
cy.blur_glossy = 0.5
cy.sample_clamp_indirect = 8.0
cy.use_adaptive_sampling = True
cy.device = "CPU"
print(f"Cycles device: {cy.device}, samples {cy.samples}, {FRAMES} frames")

# A soft bloom only around the brightest light (the dot and sun glints on the water).
scene.use_nodes = True
ct = scene.node_tree
ct.nodes.clear()
rl = ct.nodes.new("CompositorNodeRLayers")
glare = ct.nodes.new("CompositorNodeGlare")
glare.glare_type = "FOG_GLOW"
glare.quality = "HIGH"
glare.threshold = 1.2
glare.size = 8
glare.mix = -0.2
comp = ct.nodes.new("CompositorNodeComposite")
ct.links.new(rl.outputs["Image"], glare.inputs["Image"])
ct.links.new(glare.outputs["Image"], comp.inputs["Image"])

out = os.path.abspath(A["out"])
os.makedirs(out, exist_ok=True)
scene.render.image_settings.file_format = str(A.get("format", "PNG")).upper()
scene.render.image_settings.color_mode = "RGB"
if scene.render.image_settings.file_format == "JPEG":
    scene.render.image_settings.quality = 92
if A["blend"]:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(A["blend"]))
if A["still"]:
    for f in str(A["still"]).split(","):
        scene.frame_set(int(f))
        scene.render.filepath = os.path.join(out, f"still-{int(f):04d}")
        bpy.ops.render.render(write_still=True)
else:
    span = A["frames"] if A["frames"] != "1-270" else f"1-{FRAMES}"  # scene.py's default range
    a, b = (int(x) for x in str(span).split("-"))
    scene.frame_start, scene.frame_end = a, b
    scene.frame_step = int(A.get("step", 1))
    scene.render.filepath = os.path.join(out, "f")  # f0001.png ...
    bpy.ops.render.render(animation=True)

