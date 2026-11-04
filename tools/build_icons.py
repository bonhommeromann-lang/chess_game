#!/usr/bin/env python3
"""Genere les icones PNG a partir de assets/logo.svg. Requiert : pip install playwright (et Edge)."""
import pathlib
import re

from playwright.sync_api import sync_playwright

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"
LOGO = (ASSETS / "logo.svg").read_text(encoding="utf8")
INNER = re.search(r"<svg[^>]*>(.*)</svg>", LOGO, re.S)[1]
BACKGROUND = re.search(r'<rect[^>]*fill="(#[0-9a-f]+)"', LOGO)[1]
DRAWING = re.sub(r"<rect[^>]*/>", "", INNER)


def page_html(svg, size):
    return f'<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent;width:{size}px;height:{size}px">{svg}</body></html>'


def plain(size):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}" style="display:block">{INNER}</svg>'


def maskable(size):
    # Android découpe l'icône : fond sans arrondi, dessin réduit pour rester dans la zone sûre.
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}" style="display:block">'
            f'<rect width="512" height="512" fill="{BACKGROUND}"/><g transform="translate(51.2 51.2) scale(.8)">{DRAWING}</g></svg>')


def touch(size):
    # iOS arrondit lui-même et n'accepte pas la transparence.
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}" style="display:block">'
            f'<rect width="512" height="512" fill="{BACKGROUND}"/>{DRAWING}</svg>')


OUTPUTS = [
    ("icon-192.png", 192, plain),
    ("icon-512.png", 512, plain),
    ("icon-maskable-512.png", 512, maskable),
    ("apple-touch-icon.png", 180, touch),
    ("favicon-32.png", 32, plain),
]

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    for name, size, build in OUTPUTS:
        page = browser.new_page(viewport={"width": size, "height": size})
        page.set_content(page_html(build(size), size))
        page.screenshot(path=ASSETS / name, omit_background=True)
        page.close()
        print(name, size)
    browser.close()
