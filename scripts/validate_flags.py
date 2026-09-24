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

def rect_numeric_value(rect, key, default=0.0):
    return float(rect.attrib.get(key, default))

def has_full_canvas_background(root):
    rects = [child for child in list(root) if child.tag.endswith('rect')]
    for rect in rects:
        width = rect_numeric_value(rect, 'width')
        height = rect_numeric_value(rect, 'height')
        x = rect_numeric_value(rect, 'x')
        y = rect_numeric_value(rect, 'y')
        if width == 1600.0 and height == 900.0 and x == 0.0 and y == 0.0:
            return True

    stripe_rects = []
    for rect in rects:
        width = rect_numeric_value(rect, 'width')
        x = rect_numeric_value(rect, 'x')
        if width != 1600.0 or x != 0.0:
            continue
        y = rect_numeric_value(rect, 'y')
        height = rect_numeric_value(rect, 'height')
        if height <= 0:
            continue
        stripe_rects.append((y, y + height))

    if not stripe_rects:
        return False

    stripe_rects.sort()
    coverage_end = 0.0
    for start, end in stripe_rects:
        if start > coverage_end + 1e-6:
            return False
        coverage_end = max(coverage_end, end)
    return coverage_end >= 900.0 - 1e-6

for key in EXPECTED:
    if f'.tile[data-flag="{key}"]' not in css:
        errors.append(f'missing CSS rule for {key}')

germany_rule = re.search(r'\.tile\[data-flag="de"\] \{(?P<body>.*?)\n\}', css, re.S)
if not germany_rule:
    errors.append('missing CSS block for de')
else:
    germany_css = germany_rule.group('body')
    expected_german_flag = '--tile-flag: linear-gradient(180deg, #000000 0 33.33%, #dd0000 33.33% 66.66%, #ffce00 66.66% 100%) var(--flag-fill);'
    if expected_german_flag not in germany_css:
        errors.append('Germany flag stripes must remain black/red/gold horizontal thirds')
    if '--flag-overlay-opacity: 1;' not in germany_css:
        errors.append('Germany flag overlay opacity must preserve true colors')
    if '--flag-overlay-filter: none;' not in germany_css:
        errors.append('Germany flag overlay filter must remain disabled')

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
    if not any(child.tag.endswith('rect') for child in list(root)):
        errors.append(f'no background rect found for {key}')
        continue
    if not has_full_canvas_background(root):
        errors.append(f'background shapes do not cover full canvas for {key}')

if errors:
    print('FLAG VALIDATION FAILED')
    for err in errors:
        print('-', err)
    sys.exit(1)

print('Validated all 20 flag keys.')
print('Verified SVG decoding, XML parsing, viewBox, and full-canvas backgrounds for complex flags.')
