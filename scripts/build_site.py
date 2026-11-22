#!/usr/bin/env python3
"""Wrap site/index.html in a full HTML document and copy data.json into dist/ for GitHub Pages."""
import os
import shutil

ROOT = os.path.join(os.path.dirname(__file__), "..")
SRC, DIST = os.path.join(ROOT, "site"), os.path.join(ROOT, "dist")
HEAD = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="robots" content="noindex">'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')

os.makedirs(DIST, exist_ok=True)
with open(os.path.join(SRC, "index.html")) as f:
    body = f.read()
with open(os.path.join(DIST, "index.html"), "w") as f:
    f.write(HEAD + body + "</body></html>")
shutil.copy(os.path.join(SRC, "data.json"), os.path.join(DIST, "data.json"))
open(os.path.join(DIST, ".nojekyll"), "w").close()
print("built dist/")
