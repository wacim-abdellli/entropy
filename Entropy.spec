# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, collect_submodules

block_cipher = None

webview_datas = collect_data_files('webview')
webview_binaries = collect_dynamic_libs('webview')
pythonnet_datas = collect_data_files('pythonnet')

datas = [
    ('desktop/dist', 'desktop/dist'),
    ('desktop/src-tauri/icons/icon.ico', 'desktop/src-tauri/icons'),
] + webview_datas + pythonnet_datas

binaries = [] + webview_binaries

hiddenimports = [
    'webview',
    'webview.platforms.winforms',
    'webview.platforms.edgechromium',
    'clr',
    'pythonnet',
    'clr_loader',
    'psutil',
    'scan',
    'core',
    'core.entities',
    'core.graph',
    'core.findings',
    'core.system_cleaner',
    'core.cleanup_progress',
    'core.git_control',
    'core.cache_cleaner',
    'core.launcher',
    'core.advisor',
    'core.ai_provider',
    'core.disk_cleaner',
    'core.docker_control',
    'collectors',
    'collectors.git',
    'collectors.projects',
    'collectors.processes',
    'collectors.docker',
    'collectors.caches',
    'collectors.runtimes',
    'linkers',
    'linkers.relationships',
    'report',
    'report.contract',
    'report.inspect',
    'report.text',
] + collect_submodules('webview')

a = Analysis(
    ['desktop/app.py'],
    pathex=['.', 'desktop'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'scipy', 'torch', 'transformers',
        'nltk', 'huggingface_hub', 'openai', 'anthropic', 'litellm',
        'google', 'IPython', 'jupyter', 'PIL', 'reportlab'
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='Entropy',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='desktop/src-tauri/icons/icon.ico',
)
