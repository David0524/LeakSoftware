"""The Sundeck Pro mark in 3D: a glass pin over night pool water, for link previews (owner,
2026-10-23: "Make our logo 3D, have a moving camera ... be cool, not advertisers"; glass and
light after Apple's Liquid Glass icons and the iOS 26 Music icon). No text, screens or music.

Built from brand/logo/sundeck-mark-reverse.svg, so it stays exactly on brand:
  - the pin's outline is a drop of clear glass (or frosted white, --drop frost);
  - the wave lines are solid blue bands running through the drop, rippled and grained;
  - the dot is a glowing orange core that lights the glass and waves from within.
(Owner, 2026-10-23: "the droplet should either be clear or a frosted white drop. Orange dot.
Blue waves. Make the orange dot glow, and the waves 3D throughout the droplet and textured.")
The sea is an ocean surface at night, reflecting the sky glow, the light shapes and the pin.
The camera starts low over the water, cranes up and sweeps round, settles face-on, then comes
back to where it started, so the clip loops.

    blender -b -P apps/video/logo3d/blender/scene.py -- --out DIR [options]

      --frames A-B     frames to render (1-270: a 240-frame loop and a 30-frame tail)
      --samples N      Cycles samples (default 192)
      --engine E       CYCLES (default) or EEVEE (the fast fallback)
      --pct P          resolution percentage of 1920 x 1080 (default 100)
      --device D       METAL, CPU or AUTO (default AUTO: the GPU when Cycles finds one)
      --still F        render one frame to DIR/still.png
      --drop K         clear (default) or frost: clear glass or frosted white glass
      --blend PATH     also save the scene as a .blend

The workflow .github/workflows/logo-3d.yml renders it across 20 Linux runners and encodes it.
"""

import math
import os
import sys

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
SVG = os.path.join(ROOT, "brand", "logo", "sundeck-mark-reverse.svg")
FRAMES = 240  # one loop of the camera and the pin
# Rendered a second longer: the sea runs forward the whole time, and the encoder dissolves the
# last second into the first (card/../workflow), so the loop has no seam.
TAIL = 30
FPS = 30
PIN_Z = 1.75  # the pin's center above the water
PIN_H = 2.2  # its height


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    o = {"out": "build/logo3d", "frames": f"1-{FRAMES + TAIL}", "samples": 192, "engine": "CYCLES",
         "pct": 100, "device": "AUTO", "still": None, "blend": None, "drop": "clear"}
    i = 0
    while i < len(argv):
        k = argv[i].lstrip("-")
        o[k] = argv[i + 1]
        i += 2
    o["samples"] = int(o["samples"])
    o["pct"] = int(o["pct"])
    return o


A = args()


def set_input(node, names, value):
    """Sets the first of a node's inputs that this Blender version has (names differ by version)."""
    for n in names if isinstance(names, (list, tuple)) else [names]:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return True
    return False


def principled(name, **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    table = {
        "color": ["Base Color"],
        "rough": ["Roughness"],
        "ior": ["IOR"],
        "trans": ["Transmission Weight", "Transmission"],
        "coat": ["Coat Weight", "Clearcoat"],
        "coat_rough": ["Coat Roughness", "Clearcoat Roughness"],
        "film": ["Thin Film Thickness"],
        "film_ior": ["Thin Film IOR"],
        "disp": ["Dispersion"],
        "emit": ["Emission Color", "Emission"],
        "emit_s": ["Emission Strength"],
        "spec": ["Specular IOR Level", "Specular"],
    }
    for k, v in kw.items():
        set_input(b, table[k], v)
    return m


def emission(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    e.inputs["Strength"].default_value = strength
    nt.links.new(e.outputs[0], out.inputs[0])
    return m


# ---------------------------------------------------------------------------------------------
# The scene
# ---------------------------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, FRAMES
scene.render.fps = FPS
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.render.resolution_percentage = A["pct"]
scene.render.use_motion_blur = True
scene.render.motion_blur_shutter = 0.5
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Punchy"
except TypeError:
    pass
scene.view_settings.exposure = -0.4

# The world: a dark studio, faintly navy, so reflections come from the lights and light shapes.
world = bpy.data.worlds.new("Night")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Strength"].default_value = 1.0
# A night sky: near black overhead, a faint navy glow along the horizon, so the sea has
# something to reflect and fades into the distance.
wt = world.node_tree
wtc = wt.nodes.new("ShaderNodeTexCoord")
wsep = wt.nodes.new("ShaderNodeSeparateXYZ")
wramp = wt.nodes.new("ShaderNodeValToRGB")
el = wramp.color_ramp.elements
el[0].position, el[0].color = 0.0, (0.022, 0.05, 0.085, 1)
el[1].position, el[1].color = 0.35, (0.002, 0.005, 0.012, 1)
wt.links.new(wtc.outputs["Generated"], wsep.inputs[0])
wt.links.new(wsep.outputs["Z"], wramp.inputs["Fac"])
wt.links.new(wramp.outputs["Color"], bg.inputs["Color"])

# The mark, imported from the brand file.
try:
    bpy.ops.preferences.addon_enable(module="io_curve_svg")
except Exception:
    pass
before = set(bpy.data.objects)
bpy.ops.import_curve.svg(filepath=SVG)
curves = [o for o in bpy.data.objects if o not in before and o.type == "CURVE"]


def layer_of(obj):
    """Which layer of the mark a curve is, by its fill (the importer's material color)."""
    m = obj.data.materials[0] if obj.data.materials else None
    r, g, b = (m.diffuse_color[:3] if m else (1, 1, 1))
    if r > 0.5 and b < 0.3:
        return "dot"
    if b > r + 0.15:
        return "body"
    return "frost"


# Size and place: the mark's height to PIN_H, centered, standing upright facing -Y.
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in curves:
    for c in o.bound_box:
        p = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, p))
        hi = Vector(map(max, hi, p))
scale = PIN_H / (hi.y - lo.y)
center = (lo + hi) / 2
pin = bpy.data.objects.new("Pin", None)
scene.collection.objects.link(pin)
# The pin's parts, also gathered here: the studio lights light only these (light linking), so
# the water never shows the softboxes as big white streaks.
pin_parts = bpy.data.collections.new("Pin parts")

DROP = A["drop"].lower()
if DROP == "frost":
    # Frosted white: light goes through and scatters, so the waves and dot glow through softly.
    drop_mat = principled("Drop", color=(0.96, 0.975, 1.0, 1), rough=0.32, ior=1.5, trans=1.0,
                          coat=1.0, coat_rough=0.03, film=320.0, film_ior=1.38)
else:
    # Clear as water (owner: "more see through rather than absorbing the colored lights so
    # much"): untinted, a gentle lens, only a trace of dispersion and rainbow sheen at the edges.
    drop_mat = principled("Drop", color=(1.0, 1.0, 1.0, 1), rough=0.0, ior=1.45, trans=1.0,
                          coat=0.5, coat_rough=0.0, film=120.0, film_ior=1.33, disp=0.15)


def glow_material(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = "SPHERICAL"
    curve = nt.nodes.new("ShaderNodeMath")
    curve.operation = "POWER"
    curve.inputs[1].default_value = 3.0
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = strength
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (*color, 1)
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(tc.outputs["Object"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], curve.inputs[0])
    nt.links.new(curve.outputs[0], mul.inputs[0])
    nt.links.new(mul.outputs[0], e.inputs["Strength"])
    nt.links.new(e.outputs[0], add.inputs[0])
    nt.links.new(clear.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs[0])
    if hasattr(m, "blend_method"):
        m.blend_method = "BLEND"
    return m


def wave_material(name, color, glow):
    """A layer of the waves: light blue, half translucent like tinted resin, its faces rippled
    and finely grained (bump from a wave texture and noise), with a soft blue glow of its own."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = 0.3
    set_input(b, ["Transmission Weight", "Transmission"], 0.55)
    set_input(b, ["Subsurface Weight", "Subsurface"], 0.25)
    if "Subsurface Radius" in b.inputs:
        b.inputs["Subsurface Radius"].default_value = (0.1, 0.4, 1.0)
    set_input(b, ["Coat Weight", "Clearcoat"], 0.6)
    b.inputs["Emission Color"].default_value = (*color, 1)
    # Brighter where the surface turns away (its edges and the tops of the waves), so each
    # band reads as a solid, lit shape even face-on.
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    edge = nt.nodes.new("ShaderNodeMath")
    edge.operation = "MULTIPLY_ADD"
    edge.inputs[1].default_value = glow * 3.0
    edge.inputs[2].default_value = glow
    nt.links.new(lw.outputs["Facing"], edge.inputs[0])
    nt.links.new(edge.outputs[0], b.inputs["Emission Strength"])
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 14.0
    wave.inputs["Distortion"].default_value = 6.0
    wave.inputs["Detail"].default_value = 4.0
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 90.0
    noise.inputs["Detail"].default_value = 8.0
    mix = nt.nodes.new("ShaderNodeMath")
    mix.operation = "ADD"
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.004
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], mix.inputs[0])
    nt.links.new(noise.outputs["Fac"], mix.inputs[1])
    nt.links.new(mix.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m




def micro_surface(m, amount):
    """Real glass is never perfect: faint polish marks vary its roughness across the surface."""
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    base = b.inputs["Roughness"].default_value
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18.0
    noise.inputs["Detail"].default_value = 10.0
    rng = nt.nodes.new("ShaderNodeMapRange")
    rng.inputs["From Min"].default_value = 0.35
    rng.inputs["From Max"].default_value = 0.75
    rng.inputs["To Min"].default_value = base
    rng.inputs["To Max"].default_value = base + amount
    nt.links.new(noise.outputs["Fac"], rng.inputs["Value"])
    nt.links.new(rng.outputs["Result"], b.inputs["Roughness"])
    if "Coat Roughness" in b.inputs:
        nt.links.new(rng.outputs["Result"], b.inputs["Coat Roughness"])


micro_surface(drop_mat, 0.04)


def dot_material():
    """The dot: dark orange, matte and grained like fired clay, glowing from within unevenly,
    brighter in its pores (emission and bump from the same noise)."""
    m = bpy.data.materials.new("Dot")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.42, 0.06, 0.0, 1)
    b.inputs["Roughness"].default_value = 0.85
    b.inputs["Emission Color"].default_value = (1.0, 0.07, 0.0, 1)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 60.0
    noise.inputs["Detail"].default_value = 12.0
    noise.inputs["Roughness"].default_value = 0.7
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = 140.0
    mix = nt.nodes.new("ShaderNodeMath")
    mix.operation = "MULTIPLY_ADD"
    mix.inputs[1].default_value = 0.6
    glow = nt.nodes.new("ShaderNodeMapRange")
    glow.inputs["From Min"].default_value = 0.35
    glow.inputs["From Max"].default_value = 1.0
    glow.inputs["To Min"].default_value = 0.9
    glow.inputs["To Max"].default_value = 2.6
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 0.006
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], mix.inputs[0])
    nt.links.new(vor.outputs["Distance"], mix.inputs[2])
    nt.links.new(mix.outputs[0], glow.inputs["Value"])
    nt.links.new(glow.outputs["Result"], b.inputs["Emission Strength"])
    nt.links.new(mix.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


core = dot_material()

# Place every curve: the mark's height to PIN_H, centered.
for o in curves:
    o.location = (o.location - center) * scale
    o.scale = (scale, scale, scale)
    o.data.resolution_u = 48
    o.data.fill_mode = "BOTH"
    o.data.bevel_resolution = 8
body = next(o for o in curves if layer_of(o) == "body")
whites = [o for o in curves if layer_of(o) == "frost"]
dots = [o for o in curves if layer_of(o) == "dot"]


def to_mesh(curve, name, extrude, bevel=0.0, offset=0.0):
    """A copy of a curve extruded (half-thickness), beveled and offset, as a mesh object."""
    c = curve.copy()
    c.data = curve.data.copy()
    c.data.extrude = extrude / scale
    c.data.bevel_depth = bevel / scale
    c.data.offset = offset / scale
    c.data.materials.clear()
    scene.collection.objects.link(c)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(c.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    # The curve's placement baked into the mesh, so sizes below are in world units.
    me.transform(c.matrix_world)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    bpy.data.objects.remove(c)
    return ob


# The drop: shaped like water, not cut glass (owner: "thick or rounded like a real water
# drop"): a fully round edge (the bevel is the whole thickness), and faces that swell toward
# the middle like a lens, so it bends what's behind it.
drop = to_mesh(body, "Drop", 0.0, 0.12)
rm = drop.modifiers.new("Remesh", "REMESH")
rm.mode = "VOXEL"
rm.voxel_size = 0.008
bpy.context.view_layer.update()
me = bpy.data.meshes.new_from_object(drop.evaluated_get(bpy.context.evaluated_depsgraph_get()))
drop.modifiers.clear()
drop.data = me
outline = to_mesh(body, "Outline", 0.0, 0.0)
tree = KDTree(len(outline.data.vertices))
for i, v in enumerate(outline.data.vertices):
    tree.insert((v.co.x, v.co.y, 0.0), i)
tree.balance()
bpy.data.objects.remove(outline)
for v in drop.data.vertices:
    _, _, dist = tree.find((v.co.x, v.co.y, 0.0))
    swell = min(dist / 0.45, 1.0) ** 0.6
    v.co.z *= 1.0 + 0.45 * swell
# Smooth the swell (depth only), so the faces curve evenly, with no ridge down the middle.
sm = drop.modifiers.new("Even out", "SMOOTH")
sm.use_x = sm.use_y = False
sm.factor = 1.0
sm.iterations = 60
bpy.context.view_layer.update()
me = bpy.data.meshes.new_from_object(drop.evaluated_get(bpy.context.evaluated_depsgraph_get()))
drop.modifiers.clear()
drop.data = me
drop.data.materials.append(drop_mat)
# The waves: set into the glass as five thin layers, one behind another, so they show their
# depth as the drop turns (owner: "I want to see depth layers in the waves as the droplet
# spins"). Each is the outline less the white shapes and the dot's ring, kept in from the
# glass's edge; its edges and faces roughened (remeshed and displaced by noise), so the lines
# are real textured things, never a perfect curve. Lightest at the front, deepest at the back.
cutters = [to_mesh(w, "Cut", 0.4) for w in whites] + [to_mesh(d, "Cut", 0.4, 0.0, 0.02) for d in dots]
LAYERS = [
    (0.1, (0.03, 0.4, 1.0), 0.55),
    (0.05, (0.012, 0.26, 0.95), 0.35),
    (0.0, (0.008, 0.2, 0.9), 0.28),
    (-0.05, (0.005, 0.15, 0.85), 0.22),
    (-0.1, (0.003, 0.11, 0.8), 0.18),
]
grain = bpy.data.textures.new("Wave grain", "CLOUDS")
grain.noise_scale = 0.035
grain.noise_depth = 4
wave_layers = []
for n, (z, color, glow_s) in enumerate(LAYERS):
    layer = to_mesh(body, f"Waves {n + 1}", 0.008, 0.0, -0.05)
    layer.location.z += z
    for i, cut in enumerate(cutters):
        mod = layer.modifiers.new(f"Cut {i}", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = cut
    rm = layer.modifiers.new("Remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = 0.0035
    disp = layer.modifiers.new("Grain", "DISPLACE")
    disp.texture = grain
    disp.texture_coords = "GLOBAL"
    disp.strength = 0.018
    disp.mid_level = 0.5
    sm = layer.modifiers.new("Settle", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 2
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(layer.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    layer.modifiers.clear()
    layer.data = me
    layer.data.materials.append(wave_material(f"Waves {n + 1}", color, glow_s))
    wave_layers.append(layer)
for cut in cutters:
    bpy.data.objects.remove(cut)
# The dot: a glowing orange lozenge in the glass, and a small light in it so its glow falls on
# the waves and the inside of the drop.
dot = to_mesh(dots[0], "Dot", 0.06, 0.05)
dot.data.materials.append(core)
for ob in (drop, dot, *wave_layers):
    for poly in ob.data.polygons:
        poly.use_smooth = True
    ob.parent = pin
    pin_parts.objects.link(ob)
for o in curves:
    bpy.data.objects.remove(o)
dc = sum((Vector(v.co) for v in dot.data.vertices), Vector()) / len(dot.data.vertices)
glow = bpy.data.lights.new("Dot glow", "POINT")
glow.color = (1.0, 0.32, 0.05)
glow.energy = 45
glow.shadow_soft_size = 0.12
go = bpy.data.objects.new("Dot glow", glow)
go.location = dot.matrix_world @ dc
go.parent = pin
scene.collection.objects.link(go)
for k in ("visible_camera", "visible_glossy", "visible_transmission"):
    setattr(go, k, False)
# A soft orange halo in the glass around the dot, as a glowing core would show (seen, lighting
# nothing; glow_material, the same falloff as the light shapes behind).
dr = max((Vector(v.co) - dc).length for v in dot.data.vertices)
# A flat disc through the dot's middle (the drop's face plane, before the pin stands up), so
# the falloff runs from the dot out to nothing.
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.0, fill_type="NGON", location=dot.matrix_world @ dc)
halo = bpy.context.active_object
halo.name = "Dot halo"
halo.scale = (dr * 2.2, dr * 2.2, 1.0)
halo.data.materials.append(glow_material("Dot halo", (1.0, 0.24, 0.02), 5.0))
halo.visible_shadow = False
halo.visible_diffuse = False
halo.parent = pin
pin.rotation_euler = (math.radians(90), 0, 0)  # SVG lies in XY: stand it up, facing -Y

# The pin bobs on the water's breath and turns a little (simple-expression drivers, no Python).
for idx, expr in ((2, f"{PIN_Z} + 0.06*sin(frame/{FRAMES}*2*pi*2)"),):
    d = pin.driver_add("location", idx).driver
    d.expression = expr
d = pin.driver_add("rotation_euler", 2).driver
d.expression = f"0.55*sin(frame/{FRAMES}*2*pi)"
d = pin.driver_add("rotation_euler", 1).driver
d.expression = f"0.04*sin(frame/{FRAMES}*2*pi*2+1)"

# ---------------------------------------------------------------------------------------------
# Light
# ---------------------------------------------------------------------------------------------


def area(name, color, power, size, loc, look_at=(0, 0, PIN_Z), shape="RECTANGLE", size_y=None):
    l = bpy.data.lights.new(name, "AREA")
    l.color, l.energy, l.shape = color, power, shape
    l.size = size
    if size_y:
        l.size_y = size_y
    o = bpy.data.objects.new(name, l)
    o.location = loc
    scene.collection.objects.link(o)
    d = Vector(look_at) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if hasattr(o, "light_linking"):
        o.light_linking.receiver_collection = pin_parts
    # Seen as highlights on the glass, never as a lamp shape straight through it.
    o.visible_transmission = False
    return o


# Long soft strips, so the glass edges carry bright lines as in Apple's glass.
area("Key", (0.85, 0.92, 1.0), 380, 6.0, (-4.5, -5.0, 6.0), size_y=0.3)
area("Kick", (1.0, 0.52, 0.2), 300, 1.6, (5.0, -2.5, 2.4), size_y=5.0)
area("Rim", (0.3, 0.88, 1.0), 700, 1.4, (-2.5, 4.5, 4.0), size_y=6.0)
area("Top", (1.0, 1.0, 1.0), 110, 6.0, (0, 0, 7.5), size_y=0.25)

# Big soft shapes of blue and orange light behind the pin, which the glass bends and the lens
# blurs: discs whose light falls off from the middle to nothing at the edge, seen but lighting
# nothing.


for name, color, strength, loc, r in (
    ("Blue glow", (0.12, 0.45, 1.0), 3.0, (-6.0, 34, 5.0), 13.0),
    ("Orange glow", (1.0, 0.4, 0.1), 2.6, (8.0, 38, 3.5), 10.0),
    ("Cyan glow", (0.2, 0.9, 1.0), 1.6, (1.0, 42, 13.0), 9.0),
):
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1, fill_type="NGON", location=loc,
                                      rotation=(math.radians(90), 0, 0))
    disc = bpy.context.active_object
    disc.name = name
    disc.scale = (r, r, r)
    disc.data.materials.append(glow_material(name, color, strength))
    disc.visible_shadow = False
    disc.visible_diffuse = False
    disc.visible_glossy = True

# ---------------------------------------------------------------------------------------------
# The sea at night (owner: "make sure the ground looks like real ocean")
# ---------------------------------------------------------------------------------------------

# An ocean surface out to the horizon: long swells with fine wind ripples on them.
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
water = bpy.context.active_object
water.name = "Sea"
ocean = water.modifiers.new("Ocean", "OCEAN")
ocean.geometry_mode = "GENERATE"
ocean.size = 1.0
ocean.spatial_size = 60
ocean.resolution = 20
ocean.repeat_x = ocean.repeat_y = 3
ocean.wave_scale = 0.95
ocean.choppiness = 1.35
ocean.wind_velocity = 10.0
ocean.wave_alignment = 0.4
ocean.wave_direction = 0.6
ocean.wave_scale_min = 0.0
# Real time: the swells roll forward the whole clip (the loop is made in the encoder).
d = ocean.driver_add("time").driver
d.expression = f"frame/{FPS}*1.2"
water.location = (-90, -90, 0)
water.data.polygons.foreach_set("use_smooth", [True] * len(water.data.polygons))
# Deep night water: almost black, a mirror at grazing angles (Fresnel), faintly rough so the
# reflections of the glows and the pin break into long shimmering streaks.
wmat = bpy.data.materials.new("Sea")
wmat.use_nodes = True
wn = wmat.node_tree
wb = wn.nodes["Principled BSDF"]
wb.inputs["Base Color"].default_value = (0.0, 0.006, 0.01, 1)
wb.inputs["Roughness"].default_value = 0.035
wb.inputs["IOR"].default_value = 1.333
set_input(wb, ["Specular IOR Level", "Specular"], 0.5)
set_input(wb, ["Subsurface Weight", "Subsurface"], 0.0)
# Fine ripples too small for the mesh, as a bump.
wtc2 = wn.nodes.new("ShaderNodeTexCoord")
wnoise = wn.nodes.new("ShaderNodeTexNoise")
wnoise.inputs["Scale"].default_value = 6.0
wnoise.inputs["Detail"].default_value = 10.0
wnoise.inputs["Roughness"].default_value = 0.55
wnoise.noise_dimensions = "4D"
wd = wnoise.inputs[1].driver_add("default_value").driver  # W, the fourth dimension
wd.expression = f"frame/{FPS}*0.25"
wbump = wn.nodes.new("ShaderNodeBump")
wbump.inputs["Strength"].default_value = 0.25
wbump.inputs["Distance"].default_value = 0.02
wn.links.new(wtc2.outputs["Object"], wnoise.inputs["Vector"])
wn.links.new(wnoise.outputs["Fac"], wbump.inputs["Height"])
wn.links.new(wbump.outputs["Normal"], wb.inputs["Normal"])
water.data.materials.append(wmat)

# ---------------------------------------------------------------------------------------------
# Camera
# ---------------------------------------------------------------------------------------------

cam_data = bpy.data.cameras.new("Camera")
cam_data.lens = 50
cam_data.dof.use_dof = True
cam_data.dof.aperture_fstop = 1.2
cam = bpy.data.objects.new("Camera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
target = bpy.data.objects.new("Target", None)
target.location = (0, 0, PIN_Z)
scene.collection.objects.link(target)
track = cam.constraints.new("TRACK_TO")
track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"

# (frame, angle in degrees round the pin, distance, height, where the target sits, focus offset)
keys = [
    (1, -38, 10.5, 0.95, 1.45, -2.0),  # low over the swells, focus in front: rack to the pin
    (40, -30, 9.4, 1.1, 1.6, 0.0),
    (95, 24, 8.6, 2.3, 1.8, 0.0),  # cranes up and sweeps round
    (135, 0, 7.6, 1.95, 1.8, 0.0),  # settles face-on
    (175, -4, 7.8, 1.7, 1.75, 0.0),
    (241, -38, 10.5, 0.95, 1.45, -2.0),  # back where it began (frame 241 = frame 1)
]
for f, ang, r, h, tz, df in keys:
    a = math.radians(ang)
    cam.location = (r * math.sin(a), -r * math.cos(a), h)
    cam.keyframe_insert("location", frame=f)
    target.location = (0, 0, tz)
    target.keyframe_insert("location", frame=f)
    cam_data.dof.focus_distance = max(1.0, math.dist(cam.location, (0, 0, tz)) + df)
    cam_data.dof.keyframe_insert("focus_distance", frame=f)
for ob in (cam, target, cam_data):
    ad = ob.animation_data
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"
                kp.easing = "AUTO"
                kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
            # Past frame 241 the move repeats, for the tail the encoder dissolves into frame 1.
            fc.modifiers.new("CYCLES")

# ---------------------------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------------------------

if A["engine"].upper() == "EEVEE":
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [
        e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
    ] else "BLENDER_EEVEE"
    ee = scene.eevee
    for k, v in (("use_raytracing", True), ("taa_render_samples", 64),
                 ("use_ssr", True), ("use_ssr_refraction", True), ("use_bloom", True)):
        if hasattr(ee, k):
            setattr(ee, k, v)
    for m in (drop_mat, wmat):
        for k in ("use_screen_refraction", "use_raytrace_refraction"):
            if hasattr(m, k):
                setattr(m, k, True)
        if hasattr(m, "blend_method"):
            m.blend_method = "BLEND"
else:
    scene.render.engine = "CYCLES"
    cy = scene.cycles
    cy.samples = A["samples"]
    cy.use_denoising = True
    cy.denoiser = "OPENIMAGEDENOISE"
    cy.max_bounces = 16
    cy.transmission_bounces = 16
    cy.glossy_bounces = 8
    cy.transparent_max_bounces = 16
    cy.blur_glossy = 0.5
    cy.use_adaptive_sampling = True
    if A["device"].upper() != "CPU":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for kind in (["METAL"] if A["device"].upper() in ("AUTO", "METAL") else []) + ["CUDA", "OPTIX", "HIP"]:
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type != "CPU"]
                if gpus:
                    for d in prefs.devices:
                        d.use = d.type != "CPU"
                    cy.device = "GPU"
                    print(f"Cycles on {kind}: {[d.name for d in gpus]}")
                    break
            except TypeError:
                continue
    print(f"Cycles device: {cy.device}, samples {cy.samples}")

# A soft bloom around the brightest light (the dot), as a lens would show it.
scene.use_nodes = True
ct = scene.node_tree
ct.nodes.clear()
rl = ct.nodes.new("CompositorNodeRLayers")
glare = ct.nodes.new("CompositorNodeGlare")
glare.glare_type = "FOG_GLOW"
glare.quality = "HIGH"
glare.threshold = 0.55
glare.size = 9
glare.mix = -0.1
comp = ct.nodes.new("CompositorNodeComposite")
ct.links.new(rl.outputs["Image"], glare.inputs["Image"])
ct.links.new(glare.outputs["Image"], comp.inputs["Image"])

out = os.path.abspath(A["out"])
os.makedirs(out, exist_ok=True)
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
if A["blend"]:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(A["blend"]))
if A["still"]:
    scene.frame_set(int(A["still"]))
    scene.render.filepath = os.path.join(out, "still.png")
    bpy.ops.render.render(write_still=True)
else:
    a, b = (int(x) for x in A["frames"].split("-"))
    scene.frame_start, scene.frame_end = a, b
    scene.render.filepath = os.path.join(out, "f")  # f0001.png ...
    bpy.ops.render.render(animation=True)
