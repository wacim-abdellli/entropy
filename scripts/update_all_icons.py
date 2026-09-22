import os
import sys
import ctypes
from PIL import Image

MASTER_PATH = r"C:\Users\pc\.gemini\antigravity\brain\ff3aac9b-472d-4bc8-a25f-87f6f1dece72\entropy_master_icon.png"
PROJECT_ROOT = r"c:\Users\pc\Desktop\entropy"
ICONS_DIR = os.path.join(PROJECT_ROOT, "desktop", "src-tauri", "icons")
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "desktop", "public")

print(f"Loading master icon from: {MASTER_PATH}")
master = Image.open(MASTER_PATH).convert("RGBA")

os.makedirs(ICONS_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)

# 1. Generate multi-resolution icon.ico with transparent background
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
target_ico = os.path.join(ICONS_DIR, "icon.ico")
master.save(target_ico, format="ICO", sizes=ico_sizes)
print(f"Generated: {target_ico}")

# 2. Generate all PNG assets
sizes_map = {
    "icon.png": 512,
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

for fname, sz in sizes_map.items():
    out_path = os.path.join(ICONS_DIR, fname)
    resized = master.resize((sz, sz), Image.Resampling.LANCZOS)
    resized.save(out_path, "PNG")
    print(f"Generated: {out_path}")

# 3. Generate desktop/public icons
public_ico = os.path.join(PUBLIC_DIR, "favicon.ico")
master.save(public_ico, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
public_png = os.path.join(PUBLIC_DIR, "icon.png")
master.resize((192, 192), Image.Resampling.LANCZOS).save(public_png, "PNG")
print(f"Generated: {public_ico} and {public_png}")

# Also save a copy directly in desktop/src/assets/logo.png for React components
assets_dir = os.path.join(PROJECT_ROOT, "desktop", "src", "assets")
os.makedirs(assets_dir, exist_ok=True)
master.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(assets_dir, "logo.png"), "PNG")
print("Generated React asset logo.png")

# 4. Update the desktop shortcut directly
shortcut_path = r"C:\Users\pc\Desktop\Entropy.exe - Raccourci.lnk"
if os.path.exists(shortcut_path):
    try:
        import subprocess
        ps_cmd = f"""
        $w = New-Object -ComObject WScript.Shell
        $s = $w.CreateShortcut('{shortcut_path}')
        $s.TargetPath = '{os.path.join(PROJECT_ROOT, "dist", "Entropy.exe")}'
        $s.IconLocation = '{target_ico},0'
        $s.WorkingDirectory = '{os.path.join(PROJECT_ROOT, "dist")}'
        $s.Save()
        """
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True)
        print(f"Updated shortcut at: {shortcut_path}")
    except Exception as e:
        print(f"Failed to update shortcut: {e}")

# 5. Notify Windows Shell to flush icon cache immediately
try:
    SHCNE_ASSOCCHANGED = 0x08000000
    SHCNF_IDLIST = 0x0000
    ctypes.windll.shell32.SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None)
    print("Windows Shell notified: Icon cache flushed.")
except Exception as e:
    print(f"Could not notify shell: {e}")

print("All icons successfully updated across all locations!")
