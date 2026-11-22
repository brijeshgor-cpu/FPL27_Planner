#!/usr/bin/env python3
"""Wrap site/index.html in a full HTML document.

Writes worker/public/ (committed; what Cloudflare serves) and dist/ (local preview).
"""
import os
import shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "site")
HEAD = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="robots" content="noindex">'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')

with open(os.path.join(SRC, "index.html")) as f:
    page = HEAD + f.read() + "</body></html>"

for out in ("worker/public", "dist"):
    d = os.path.join(ROOT, out)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "index.html"), "w") as f:
        f.write(page)
    shutil.copy(os.path.join(SRC, "data.json"), os.path.join(d, "data.json"))
    with open(os.path.join(d, "robots.txt"), "w") as f:
        f.write("User-agent: *\nDisallow: /\n")
print("built worker/public/ and dist/")
