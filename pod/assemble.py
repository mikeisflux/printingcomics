import os
import re
import subprocess
from pathlib import Path

ROOT = Path('/Users/maurapowers/Desktop/philbo-portal')
HUB = ROOT / 'philbo-operations-hub.html'
CSS = ROOT / 'src/index.css'
BUNDLE = ROOT / 'public/assets/philbo-app.bundle.js'
ENTRY = ROOT / 'src/standalone-entry.jsx'


def refresh_bundle():
    if os.environ.get('PHILBO_SKIP_BUNDLE') == '1':
        if not BUNDLE.exists():
            raise RuntimeError('The local application bundle is missing.')
        return

    native_esbuild = sorted((ROOT / 'node_modules/.pnpm').glob('@esbuild+*/node_modules/@esbuild/*/bin/esbuild'))
    candidates = [
        os.environ.get('PHILBO_ESBUILD'),
        *(str(candidate) for candidate in native_esbuild),
        str(ROOT / 'node_modules/.bin/esbuild'),
    ]
    esbuild = next((candidate for candidate in candidates if candidate and Path(candidate).exists()), None)
    if not esbuild:
        if not BUNDLE.exists():
            raise RuntimeError('The local application bundle is missing. Run npm install, then npm run build:standalone.')
        print('Using the existing offline application bundle (install dependencies to rebuild it from source).')
        return

    subprocess.run([
        esbuild, str(ENTRY), '--bundle', '--format=iife', '--platform=browser',
        '--target=es2020', '--loader:.js=jsx', '--loader:.jsx=jsx', '--loader:.json=json',
        f'--outfile={BUNDLE}'
    ], cwd=ROOT, check=True)


def assemble():
    refresh_bundle()
    html_content = HUB.read_text(encoding='utf-8')
    markers = ['<script type="text/babel">', '<script id="philbo-app-bundle">']
    marker_positions = [html_content.find(marker) for marker in markers]
    marker_positions = [position for position in marker_positions if position >= 0]
    if not marker_positions:
        raise RuntimeError('Application script marker not found in the hub HTML.')

    head_section = html_content[:min(marker_positions)]
    # The Desktop file must not require React, ReactDOM, Babel, or Lucide from a CDN.
    # React and ReactDOM are compiled into philbo-app.bundle.js; icons degrade cleanly
    # when Lucide is unavailable.
    head_section = re.sub(
        r'\s*<script[^>]+src="https://(?:unpkg\.com/(?:react|react-dom|@babel|lucide)[^"]*|unpkg\.com/@babel/standalone/babel\.min\.js)"[^>]*></script>',
        '', head_section, flags=re.IGNORECASE
    )
    head_section = re.sub(
        r'<style>.*?</style>',
        '<style>\n' + CSS.read_text(encoding='utf-8') + '\n  </style>',
        head_section, count=1, flags=re.DOTALL
    )

    # Third-party packages can contain literal C0 control characters inside
    # JavaScript strings. Escape them so the same bundle is safe both as a
    # standalone script and when embedded into the self-contained HTML file.
    bundle_code = BUNDLE.read_text(encoding='utf-8')
    bundle_code = re.sub(
        r'[\x00-\x08\x0b\x0c\x0e-\x1f]',
        lambda match: f'\\x{ord(match.group(0)):02x}',
        bundle_code,
    )
    bundle_code = '\n'.join(line.rstrip() for line in bundle_code.splitlines()) + '\n'
    BUNDLE.write_text(bundle_code, encoding='utf-8')
    final_html = (
        head_section.rstrip() + '\n\n'
        '<script id="philbo-app-bundle">\n' + bundle_code + '\n</script>\n'
        '</body>\n</html>\n'
    )
    HUB.write_text(final_html, encoding='utf-8')
    print('Assembly successful! The Desktop hub is self-contained and updated.')


if __name__ == '__main__':
    assemble()
