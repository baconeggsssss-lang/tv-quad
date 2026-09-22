#!/usr/bin/env python3
from pathlib import Path
from urllib.parse import unquote
import re
import sys
import xml.etree.ElementTree as ET

EXPECTED = ['qa', 'tr', 'ng', 'de', 'fr', 'sg', 'co', 'ar', 'us', 'au', 'ca', 'es', 'cg', 'eu', 'cn', 'hk', 'in', 'gb', 'kr', 'jp']
COMPLEX = {'qa', 'tr', 'sg', 'us', 'au', 'ca', 'eu', 'cn', 'hk', 'in', 'gb', 'kr'}
repo = Path(__file__).resolve().parent.parent
css = (repo / 'styles.css').read_text()

errors = []
for key in EXPECTED:
    if f'.tile[data-flag="{key}"]' not in css:
        errors.append(f'missing CSS rule for {key}')

for key in COMPLEX:
    match = re.search(rf'\.tile\[data-flag="{key}"\] \{{\s+--tile-flag: url\("data:image/svg\+xml,([^"]+)"\) var\(--flag-fill\);', css, re.S)
    if not match:
        errors.append(f'missing SVG data URI for {key}')
        continue
    encoded = match.group(1)
    if '#' in encoded:
        errors.append(f'unescaped # in data URI for {key}')
    svg_text = unquote(encoded)
    try:
        root = ET.fromstring(svg_text)
    except ET.ParseError as exc:
        errors.append(f'XML parse failed for {key}: {exc}')
        continue
    if not root.tag.endswith('svg'):
        errors.append(f'root element is not <svg> for {key}')
    if root.attrib.get('viewBox') != '0 0 1600 900':
        errors.append(f'viewBox mismatch for {key}: {root.attrib.get("viewBox")}')
    rect = None
    for child in list(root):
        if child.tag.endswith('rect'):
            rect = child
            break
    if rect is None:
        errors.append(f'no background rect found for {key}')
        continue
    width = rect.attrib.get('width')
    height = rect.attrib.get('height')
    x = rect.attrib.get('x', '0')
    y = rect.attrib.get('y', '0')
    if width not in {'1600', '1600.0'} or height not in {'900', '900.0'} or x not in {'0', '0.0'} or y not in {'0', '0.0'}:
        errors.append(f'background rect does not cover full canvas for {key}')

if errors:
    print('FLAG VALIDATION FAILED')
    for err in errors:
        print('-', err)
    sys.exit(1)

print('Validated all 20 flag keys.')
print('Verified SVG decoding, XML parsing, viewBox, and full-canvas backgrounds for complex flags.')
