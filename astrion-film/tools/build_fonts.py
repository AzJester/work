"""Subset the brand fonts the film embeds.

Sources are the Google Fonts builds shipped by the @fontsource packages
(Archivo variable with width and weight axes, JetBrains Mono 500), both under
the SIL Open Font License. Usage:
    python3 tools/build_fonts.py <node_modules dir> <output dir>
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

nm, out = sys.argv[1], sys.argv[2]
ARCHIVO = f"{nm}/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2"
MONO = f"{nm}/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2"

UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,+&'-:/™·"
TEXT = "".join(chr(c) for c in range(0x20, 0x7F)) + "™’·"


def build(src, dst, text, limits=None):
    font = TTFont(src)
    if limits:
        font = instancer.instantiateVariableFont(font, limits)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk"]
    opts.name_IDs = [1, 2, 4, 6]
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    font.flavor = "woff2"
    font.save(dst)
    print(dst, len(open(dst, "rb").read()), "bytes")


# The site's .display rule: weight 800 at 78% width, always uppercase.
build(ARCHIVO, f"{out}/archivo-display-800-78.woff2", UPPER, {"wdth": 78, "wght": 800})
# Body copy and the watermark: normal width, weights 400 to 600.
build(ARCHIVO, f"{out}/archivo-text-400-600.woff2", TEXT, {"wdth": 100, "wght": (400, 600)})
# Labels: JetBrains Mono, uppercase.
build(MONO, f"{out}/jetbrains-mono-500.woff2", UPPER)
