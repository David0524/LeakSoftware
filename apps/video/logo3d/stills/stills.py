"""Still renders of the Sundeck Pro glass drop, alone on a transparent background (owner,
2026-10-24: "Let's do 1 and take a look at what 3 looks like"), and the glass layers of a
mockup of an iOS 26 Liquid Glass app icon.

Builds on ../blender/scene.py without changing it: the scene file is run up to its Render
section, so the drop's geometry (the SVG, bevel, remesh, swell and smooth), the glass, wave and
dot materials, the dot's glow light and halo, the light-linked studio lights, the coloured glow
discs and the AgX "Punchy" look are exactly the clip's. Then the sea, the camera move and the
bob are taken out, the film made transparent and each view framed.

    blender -b -P apps/video/logo3d/stills/stills.py -- --view V --out DIR [options]

      --view V        face, three-quarter, below or hero (the stills), or icon-<look>[-<drop>]
                      (the icon's glass layers, face-on, orthographic): look default, dark
                      or clear; drop omitted (clear glass), frost or pearl (white)
      --size N        long side in pixels (default 4096; the stills are 4:5 portrait,
                      the icon square)
      --samples N     Cycles samples (default 512, adaptive, denoised)
      --strip I/N     render only horizontal strip I of N (0 is the bottom), full-size with
                      the rest transparent, so post.py can join strips rendered in parallel
      --glass G       pass (default): where the glass would show only empty background it
                      is see-through (Cycles' transparent glass); solid: it shows the dark
                      studio there instead
      --backdrop B    on (default) or off. On: a card of the clip's colours (blue left,
                      orange right, a deep sea glow low down) seen only through the glass and
                      in it, never directly, so the drop keeps the clip's colour and reads on
                      dark and light backgrounds alike. Off, it's almost all see-through and
                      washes out on white.
      --pct P         resolution percentage, for quick tests (default 100)
      --border X0,X1,Y0,Y1   render only that part, cropped (fractions), for close checks
      --turn/--elev/--tilt/--lens   override the view's angles, for trying new ones

Writes DIR/<view>[-sI].png, RGBA, 16 bit, straight alpha. No bloom here: post.py adds it so the
glow survives on a transparent background (Blender's glare can't put light where alpha is 0).
"""

import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SCENE = os.path.join(HERE, "..", "blender", "scene.py")


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    o = {"view": "face", "out": "build/stills", "size": 4096, "samples": 512, "strip": None,
         "glass": "pass", "pct": 100, "backdrop": "on"}
    for i in range(0, len(argv), 2):
        o[argv[i].lstrip("-")] = argv[i + 1]
    for k in ("size", "samples", "pct"):
        o[k] = int(o[k])
    return o


S = args()

# ---------------------------------------------------------------------------------------------
# The clip's scene, up to its Render section (scene.py reads its own args after "--": give it
# none, so it builds its defaults).
# ---------------------------------------------------------------------------------------------

with open(SCENE) as f:
    src = f.read()
marker = "# " + "-" * 93 + "\n# Render\n"
assert marker in src, "scene.py's Render section has moved: update stills.py"
saved_argv = sys.argv
sys.argv = [sys.argv[0]]
ns = {"__file__": os.path.abspath(SCENE), "__name__": "scene"}
exec(compile(src.split(marker)[0], os.path.abspath(SCENE), "exec"), ns)
sys.argv = saved_argv

scene = bpy.context.scene
pin, drop, dot, wave_layers = ns["pin"], ns["drop"], ns["dot"], ns["wave_layers"]
PIN_Z = ns["PIN_Z"]
set_input = ns["set_input"]

# No sea, no camera move, no bob: a still object in a dark studio.
for name in ("Sea", "Camera", "Target"):
    ob = bpy.data.objects.get(name)
    if ob:
        bpy.data.objects.remove(ob)
pin.animation_data_clear()
pin.location = (0, 0, PIN_Z)
scene.render.use_motion_blur = False
scene.frame_set(1)

# The coloured glow discs behind stay in the glass (refracted and reflected) but are not seen
# directly, so the background can be transparent.
for name in ("Blue glow", "Orange glow", "Cyan glow"):
    bpy.data.objects[name].visible_camera = False

VIEW = S["view"]
ICON = VIEW.startswith("icon")


def smooth_tip(ob, reach=0.3, iterations=40):
    """The drop's point: the bevel folds over itself at the sharp tip and the remesh turns that
    into a small knot, a sparkle in the clip but a visible flaw at 4096 px. Smoothed out here,
    fading from the tip over `reach` (world units), so the rest of the drop is untouched."""
    ys = [vv.co.y for vv in ob.data.vertices]
    tip = min(ys)
    vg = ob.vertex_groups.new(name="Tip")
    for vv in ob.data.vertices:
        d = vv.co.y - tip
        if d < reach:
            vg.add([vv.index], (1 - d / reach) ** 1.5, "REPLACE")
    sm = ob.modifiers.new("Tip", "SMOOTH")
    sm.factor = 1.0
    sm.iterations = iterations
    sm.vertex_group = "Tip"
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    ob.modifiers.clear()
    mats = list(ob.data.materials)
    ob.data = me
    if not me.materials:
        for m in mats:
            me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True


smooth_tip(drop, reach=0.45, iterations=150)

def backdrop():
    """What the clip's glass shows through it, without the sea behind: a wide card of the clip's
    colours (blue light on the left, orange on the right, a deep navy sea glow low down), seen
    only through the glass and in its reflections, never directly. The drop keeps the clip's
    colours on any background; where the glass would show nothing, it stays see-through."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 14, PIN_Z), rotation=(math.radians(90), 0, 0))
    card = bpy.context.active_object
    card.name = "Backdrop"
    card.scale = (60, 40, 1)
    m = bpy.data.materials.new("Backdrop")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    across = nt.nodes.new("ShaderNodeValToRGB")
    el = across.color_ramp.elements
    el[0].position, el[0].color = 0.36, (0.10, 0.36, 0.95, 1)
    el[1].position, el[1].color = 0.64, (1.0, 0.38, 0.09, 1)
    mid = el.new(0.5)
    mid.color = (0.05, 0.10, 0.22, 1)
    up = nt.nodes.new("ShaderNodeValToRGB")
    eu = up.color_ramp.elements
    eu[0].position, eu[0].color = 0.40, (0.18, 0.18, 0.18, 1)
    eu[1].position, eu[1].color = 0.58, (1, 1, 1, 1)
    mul = nt.nodes.new("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Strength"].default_value = 1.6
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["X"], across.inputs["Fac"])
    nt.links.new(sep.outputs["Y"], up.inputs["Fac"])
    nt.links.new(across.outputs["Color"], mul.inputs["A"])
    nt.links.new(up.outputs["Color"], mul.inputs["B"])
    nt.links.new(mul.outputs["Result"], e.inputs["Color"])
    nt.links.new(e.outputs[0], out.inputs[0])
    card.data.materials.append(m)
    card.visible_camera = False
    card.visible_shadow = False
    card.visible_diffuse = False
    return card

# ---------------------------------------------------------------------------------------------
# Views. (turn: the drop turned about its upright axis, degrees, as the clip turns it, so the
# studio lights keep their places relative to the camera; elev: the camera above (+) or below
# (-) the drop's middle, degrees; tilt: the drop leaned back, degrees.)
# ---------------------------------------------------------------------------------------------

VIEWS = {
    "face": dict(turn=0, elev=0, tilt=0, lens=105),
    "three-quarter": dict(turn=-32, elev=3, tilt=0, lens=105),
    "below": dict(turn=-14, elev=-17, tilt=0, lens=85),
    # The pick: from above, turned a little, so the glass goes deep and dark below the waves,
    # the dot glows hardest, the wave layers stand apart and the rim catches the orange kick.
    "hero": dict(turn=22, elev=22, tilt=0, lens=105),
}

if not ICON:
    v = dict(VIEWS.get(VIEW, VIEWS["face"]))
    for k in ("turn", "elev", "tilt", "lens"):  # overrides, for trying angles
        if k in S:
            v[k] = float(S[k])
    pin.rotation_euler = (math.radians(90 + v["tilt"]), 0, math.radians(v["turn"]))
    W = round(S["size"] * 4 / 5)
    H = S["size"]
else:
    v = dict(elev=0, lens=None)
    W = H = S["size"]

if S["backdrop"] == "on" and not ICON:
    backdrop()

scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = S["pct"]
scene.render.film_transparent = True

# ---------------------------------------------------------------------------------------------
# The icon's glass layers (Liquid Glass mockup): the same drop, waves and dot, but pressed
# flatter, as the raised glass layers of an icon are, seen face-on through an orthographic
# lens, with a shadow on the (transparent) background plate for post.py to composite.
# ---------------------------------------------------------------------------------------------

ICON_BG = {
    # The icon's background layer, as Icon Composer would fill it (a gradient, top to bottom):
    # default from the brand Water to Navy, dark from Navy to near black. Clear has none: the
    # wallpaper shows through, frosted (drawn in the mockup page).
    "default": ("#1F6FAE", "#12263A"),
    "dark": ("#12263A", "#03070C"),
}


def srgb_to_linear(h):
    h = h.lstrip("#")
    c = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def icon_plate(top, bottom, lift):
    """The background layer, behind the glass: seen only through it (refracted), never
    directly, since the mockup draws the exact brand gradient itself."""
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0.2, PIN_Z), rotation=(math.radians(90), 0, 0))
    plate = bpy.context.active_object
    plate.name = "Icon background"
    m = bpy.data.materials.new("Icon background")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.3, (*srgb_to_linear(bottom), 1)
    el[1].position, el[1].color = 0.7, (*srgb_to_linear(top), 1)
    e = nt.nodes.new("ShaderNodeEmission")
    # Brighter than the background drawn around it, as Liquid Glass lifts what it covers.
    e.inputs["Strength"].default_value = lift
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], e.inputs["Color"])
    nt.links.new(e.outputs[0], out.inputs[0])
    plate.data.materials.append(m)
    plate.visible_camera = False
    plate.visible_shadow = False
    plate.visible_diffuse = False


def clear_drop(look):
    """The first mockup's drop: clear Liquid Glass, a little frosted (a tenth of it a white
    diffuse the lights shade from the top), so it reads as a lighter layer over the background."""
    nt = bpy.data.materials["Drop"].node_tree
    outn = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    bsdf = nt.nodes["Principled BSDF"]
    frost = nt.nodes.new("ShaderNodeBsdfDiffuse")
    frost.inputs["Color"].default_value = {
        "default": (0.55, 0.78, 1.0, 1), "dark": (0.6, 0.7, 0.85, 1), "clear": (0.9, 0.94, 1.0, 1)}[look]
    mixs = nt.nodes.new("ShaderNodeMixShader")
    mixs.inputs["Fac"].default_value = {"default": 0.06, "dark": 0.05, "clear": 0.16}[look]
    nt.links.new(bsdf.outputs[0], mixs.inputs[1])
    nt.links.new(frost.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], outn.inputs["Surface"])


def white_drop(kind, look):
    """A white drop, keeping the glass's depth, edge highlights and shadow.
    frost: frosted white glass, translucent, the background faintly through it (part white
    base, part rough transmission; in Clear the transmission stays smooth enough for Cycles to
    pass the wallpaper through, so the frost is see-through there as on a real Home Screen).
    pearl: nearly solid white, a pearly, lightly frosted surface: mostly white base under a
    clear coat, with a faint thin-film sheen."""
    m = bpy.data.materials["Drop"]
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.94, 0.955, 0.975, 1)
    # (In Clear the frost's transmission stays under Cycles' transparent-glass roughness
    # threshold, 0.1, everywhere, or the polish marks would flip patches opaque.)
    rough = {"frost": 0.03 if look == "clear" else 0.3, "pearl": 0.22}[kind]
    trans = {"frost": 0.72 if look == "clear" else 0.5, "pearl": 0.12}[kind]
    set_input(b, ["Transmission Weight", "Transmission"], trans)
    set_input(b, ["Coat Weight", "Clearcoat"], 1.0)
    set_input(b, ["Thin Film Thickness"], {"frost": 0.0, "pearl": 260.0}[kind])
    set_input(b, ["Thin Film IOR"], 1.45)
    set_input(b, ["Dispersion"], 0.0)
    if "Subsurface Weight" in b.inputs and kind == "pearl":
        b.inputs["Subsurface Weight"].default_value = 0.35
        b.inputs["Subsurface Radius"].default_value = (0.3, 0.32, 0.38)
        b.inputs["Subsurface Scale"].default_value = 0.05
    # micro_surface (scene.py) drives the roughness through a Map Range: move its range.
    rng = next(n for n in nt.nodes if n.type == "MAP_RANGE")
    rng.inputs["To Min"].default_value = rough
    rng.inputs["To Max"].default_value = rough + (0.03 if rough < 0.1 else 0.05)
    if "Coat Roughness" in b.inputs:
        for lk in list(b.inputs["Coat Roughness"].links):
            nt.links.remove(lk)
        b.inputs["Coat Roughness"].default_value = 0.03


if ICON:
    # icon-<look>[-<drop>]: look default, dark or clear; drop glass (clear Liquid Glass, the
    # first mockup), frost or pearl (white, owner 2026-10-24: "the droplet should be white.
    # Frosted maybe but white").
    parts = VIEW.split("-")
    look = parts[1]
    white = parts[2] if len(parts) > 2 else None
    pin.rotation_euler = (math.radians(90), 0, 0)
    # Flatter: a raised glass layer on the icon, not a gem.
    pin.scale = (1.0, 1.0, 0.38)
    for name in ("Blue glow", "Orange glow", "Cyan glow", "Dot halo"):
        bpy.data.objects[name].hide_render = True
    # Layers, as Icon Composer stacks them: the drop is the back glass layer and the waves and
    # dot sit on it as raised layers of their own (in the clip they're set inside the glass).
    for n, layer in enumerate(wave_layers):
        layer.location.z = 0.2 + 0.008 * (len(wave_layers) - n)
    dot.location.z = 0.22
    bpy.data.objects["Dot glow"].location.z += 0.1  # under the dot, lighting the glass
    # The system draws its own glass light: soft white light from above. The clip's coloured
    # studio lights are kept, quieter, so the edges still carry a little cyan and orange.
    for name, k in (("Key", 0.6), ("Kick", 0.2), ("Rim", 0.4), ("Top", 1.0)):
        bpy.data.lights[name].energy *= k
    if look == "clear":
        # Clear: colour leaves the layers; the glass is clear, the waves and dot frosted white,
        # so the wallpaper (blurred by the system) is what colours the icon.
        for layer in wave_layers:
            wb = layer.data.materials[0].node_tree.nodes["Principled BSDF"]
            wb.inputs["Base Color"].default_value = (0.92, 0.95, 1.0, 1)
            wb.inputs["Emission Color"].default_value = (0.6, 0.65, 0.72, 1)
        db = bpy.data.materials["Dot"].node_tree.nodes["Principled BSDF"]
        db.inputs["Base Color"].default_value = (0.95, 0.95, 0.95, 1)
        db.inputs["Emission Color"].default_value = (0.5, 0.5, 0.5, 1)
        bpy.data.lights["Dot glow"].color = (1.0, 1.0, 1.0)
        bpy.data.lights["Dot glow"].energy = 6
        if white == "pearl":
            # White on a white drop would vanish: in Clear the waves and dot become a cool
            # grey (still colourless), so the mark reads as one tone set on the white.
            for layer in wave_layers:
                wb = layer.data.materials[0].node_tree.nodes["Principled BSDF"]
                wb.inputs["Base Color"].default_value = (0.32, 0.37, 0.45, 1)
                wb.inputs["Emission Color"].default_value = (0.05, 0.06, 0.08, 1)
                set_input(wb, ["Transmission Weight", "Transmission"], 0.0)
            db.inputs["Base Color"].default_value = (0.32, 0.37, 0.45, 1)
            db.inputs["Emission Color"].default_value = (0.0, 0.0, 0.0, 1)
            bpy.data.lights["Dot glow"].energy = 0
    else:
        # Default and dark keep the colours; the dot's glow is kept faint, since the HIG asks
        # for no baked glows (the system lights the layers itself).
        bpy.data.lights["Dot glow"].energy = 18 if look == "default" else 12
        icon_plate(*ICON_BG[look], lift=1.25 if look == "default" else 1.6)
    if white:
        white_drop(white, look)
    else:
        clear_drop(look)
    # What the glass reflects at grazing angles: the icon's own surroundings, not black.
    wbg = scene.world.node_tree.nodes["Background"]
    for lk in list(wbg.inputs["Color"].links):
        scene.world.node_tree.links.remove(lk)
    wbg.inputs["Color"].default_value = {
        "default": (0.03, 0.09, 0.2, 1), "dark": (0.01, 0.015, 0.025, 1), "clear": (0.25, 0.27, 0.3, 1)}[look]
    # A plate just behind the glass for the shadow the layer casts on the background (shadow
    # catcher: only the shadow lands in the alpha); transmission passes it, to the background.
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0.14, PIN_Z), rotation=(math.radians(90), 0, 0))
    catcher = bpy.context.active_object
    catcher.name = "Shadow"
    catcher.is_shadow_catcher = True
    catcher.visible_transmission = False
    catcher.visible_glossy = False
    # Standard colour, not AgX: AgX greys mid blues, so what the glass shows of the background
    # would drift from the exact brand gradient drawn around it.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.2 if not white else 0.25
    # A soft light from above and in front.
    l = bpy.data.lights.new("Icon key", "AREA")
    # (Stronger on a white drop, so it reads white, not grey.)
    l.energy, l.size, l.color = 140 if not white else 300, 3.0, (1, 1, 1)
    lo = bpy.data.objects.new("Icon key", l)
    lo.location = (0, -4.0, PIN_Z + 4.5)
    lo.rotation_euler = (Vector((0, 0, PIN_Z)) - lo.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(lo)
    lo.visible_camera = False

# ---------------------------------------------------------------------------------------------
# Camera: aimed at the drop, its distance and lens shift found so the drop fills the frame with
# a margin (glow and halo included).
# ---------------------------------------------------------------------------------------------

cam_data = bpy.data.cameras.new("Still")
cam = bpy.data.objects.new("Still", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
bpy.context.view_layer.update()


def drop_points():
    deps = bpy.context.evaluated_depsgraph_get()
    pts = []
    ob = drop.evaluated_get(deps)
    mw = ob.matrix_world
    me = ob.data
    for vtx in list(me.vertices)[:: max(1, len(me.vertices) // 4000)]:
        pts.append(mw @ vtx.co)
    return pts


pts = drop_points()
mid = sum(pts, Vector()) / len(pts)
if ICON:
    cam_data.type = "ORTHO"
    cam.location = (0, -12, mid.z)
    cam.rotation_euler = (math.radians(90), 0, 0)
    # The drop's height on the 1024 canvas as the brand icon (sundeck-app-icon.svg) sets it:
    # 146.3 * 4.34 = 635 of 1024. Wider than the pin, so height decides.
    zs = [p.z for p in pts]
    hgt = max(zs) - min(zs)
    cam_data.ortho_scale = hgt / (635 / 1024)
    # The mark's top sits where the SVG puts it: 401.3 - 50 * 4.34 = 184 px from the top.
    top = max(zs)
    cam.location.z = top - cam_data.ortho_scale * (0.5 - 184 / 1024)
    cam_data.clip_end = 100
else:
    cam_data.lens = v["lens"]
    cam_data.dof.use_dof = False
    e = math.radians(v["elev"])
    direction = Vector((0, -math.cos(e), math.sin(e)))
    dist = 9.0
    FILL = 0.80  # of the binding side
    for _ in range(8):
        cam.location = mid + direction * dist
        cam.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        ndc = [world_to_camera_view(scene, cam, p) for p in pts]
        xs = [c.x for c in ndc]
        ys = [c.y for c in ndc]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        cam_data.shift_x += (cx - 0.5) * W / max(W, H)
        cam_data.shift_y += (cy - 0.5) * H / max(W, H)
        span = max((max(xs) - min(xs)), (max(ys) - min(ys)))
        dist *= span / FILL
    print(f"View {VIEW}: distance {dist:.2f}, lens {v['lens']} mm")

# ---------------------------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------------------------

scene.render.engine = "CYCLES"
cy = scene.cycles
cy.device = "CPU"
cy.samples = S["samples"]
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.005
cy.use_denoising = True
cy.denoiser = "OPENIMAGEDENOISE"
if hasattr(cy, "denoising_prefilter"):
    cy.denoising_prefilter = "ACCURATE"
if hasattr(cy, "denoising_quality"):
    cy.denoising_quality = "HIGH"
cy.max_bounces = 32
cy.transmission_bounces = 32
cy.glossy_bounces = 8
cy.transparent_max_bounces = 16
cy.blur_glossy = 0.5
cy.film_transparent_glass = S["glass"] == "pass"
cy.film_transparent_roughness = 0.1
cy.use_auto_tile = True
cy.tile_size = 1024
scene.use_nodes = False  # bloom in post.py

if S.get("border"):  # x0,x1,y0,y1 fractions, cropped: for close checks of a detail
    x0, x1, y0, y1 = (float(t) for t in S["border"].split(","))
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    scene.render.border_min_x, scene.render.border_max_x = x0, x1
    scene.render.border_min_y, scene.render.border_max_y = y0, y1
    name = f"{VIEW}-detail.png"
elif S["strip"]:
    i, n = (int(x) for x in S["strip"].split("/"))
    scene.render.use_border = True
    scene.render.use_crop_to_border = False
    scene.render.border_min_x, scene.render.border_max_x = 0.0, 1.0
    scene.render.border_min_y, scene.render.border_max_y = i / n, (i + 1) / n
    name = f"{VIEW}-s{i}.png"
else:
    name = f"{VIEW}.png"

st = scene.render.image_settings
st.file_format = "PNG"
st.color_mode = "RGBA"
st.color_depth = "16"
st.compression = 30
out = os.path.abspath(S["out"])
os.makedirs(out, exist_ok=True)
scene.render.filepath = os.path.join(out, name)
print(f"Rendering {name}: {W} x {H} at {S['pct']}%, {S['samples']} samples, glass {S['glass']}")
bpy.ops.render.render(write_still=True)
