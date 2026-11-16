#!/usr/bin/env python3
"""Build a credential-free Skill archive from the reviewed tracked source only."""
import pathlib
import subprocess
import sys
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
subprocess.run(['node', 'scripts/scan-secrets.mjs'], cwd=root, check=True)
output = pathlib.Path(sys.argv[1]).resolve()
if output.is_relative_to(root):
    raise SystemExit('Archive must be outside the repository')
paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
roots = {'SKILL.md', 'AGENTS.md', 'README.md', 'README.en.md', 'README.zh-CN.md', 'LICENSE', 'SECURITY.md', 'package.json', 'package-lock.json'}
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(p for p in paths if p and (p in roots or p.startswith(('lib/', 'scripts/', 'docs/')))):
        file = root / name
        if file.is_symlink():
            raise SystemExit('Symlinks are not packaged')
        archive.write(file, name)
print('Skill archive built from reviewed source.')
