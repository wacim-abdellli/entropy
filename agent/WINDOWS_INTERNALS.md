# Windows Internals & Win32 API Reference

Entropy interfaces directly with native Windows operating system APIs. This document details the exact Win32 structures, WMI classes, and registry paths used across the codebase.

---

## 1. NTFS Directory Junctions (`core/smart_mover.py`)

- **Creation**: `cmd.exe /c mklink /J "<source_on_C>" "<target_on_D>"`
  - *Why Junctions over Symlinks?* Junctions do NOT require administrative elevation or Developer Mode, whereas standard symbolic links (`mklink /D`) require `SeCreateSymbolicLinkPrivilege`.
  - Junctions are transparent at the filesystem driver level: build tools like Gradle, Maven, and Android Studio continue resolving `C:\Users\<user>\.gradle` normally while physical writes land on `D:`.
- **Win32 Reparse Point Verification**:
  - Python's standard `os.path.islink()` can fail on certain NTFS directory junctions.
  - Entropy opens the directory handle via `CreateFileW` (`FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS`) and invokes `DeviceIoControl` with `FSCTL_GET_REPARSE_POINT` (Control code `0x000900A8`).
  - Evaluates `ReparseTag == IO_REPARSE_TAG_MOUNT_POINT` (`0xA0000003`) to guarantee junction authenticity.

---

## 2. Safe Partition Shrink Boundaries (`core/partition_wizard.py`)

- **Query**: Windows CIM/WMI `root\Microsoft\Windows\Storage` -> `MSFT_Partition`.
- **Method**: Computes `SupportedSize.Min` to find the exact boundary dictated by unmovable files (e.g. `pagefile.sys`, `hiberfil.sys`, VSS volume shadow copies).
- **Safety Rule**: Never shrink beyond the CIM minimum threshold; shrinking further risks unrecoverable NTFS filesystem corruption.

---

## 3. Win32 Restart Manager (`core/file_locker.py`)

- **Library**: `rstrtmgr.dll`
- **APIs**: `RmStartSession`, `RmRegisterResources`, `RmGetList`, `RmEndSession`.
- **Purpose**: When a file cannot be deleted or written because of `EBUSY` / `Access Denied` (Win32 Error `0x20` / `0x5`), the Restart Manager identifies the exact PID and process name holding the handle without terminating the entire system.

---

## 4. Windows Startup App Synchronization (`core/startup_manager.py`)

Entropy monitors and modifies the standard Windows Run registry hives identical to Windows Task Manager:
- **Current User**: `HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run`
- **Local Machine**: `HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Run`
- **Disabled State**: Synchronized with Task Manager's disabled registry store in `StartupApproved\Run`.

---

## 5. Developer Tuning (`core/tuner.py`)

- **Win32 Long Paths (`MAX_PATH` removal)**:
  - Registry: `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem` -> `LongPathsEnabled` (DWORD = 1).
  - Eliminates the 260-character path limit that crashes deep `node_modules` trees.
- **Windows Developer Mode**:
  - Registry: `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock` -> `AllowDevelopmentWithoutDevLicense` (DWORD = 1).
- **Windows Defender Exclusions**:
  - PowerShell CIM: `Add-MpPreference -ExclusionPath "<path>"`.
  - Whitelists active developer root folders to prevent MsMpEng antivirus real-time scans from saturating disk I/O during builds.

---

## 6. Silent Subprocess Execution (Console Flashing Prevention)

Every Python `subprocess.Popen` / `subprocess.run` interacting with Windows tools (`cmd.exe`, `powershell.exe`, `diskpart`, `git`) MUST include:

```python
startupinfo = subprocess.STARTUPINFO()
startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
startupinfo.wShowWindow = 0  # SW_HIDE
creationflags = 0x08000000   # CREATE_NO_WINDOW
```
This ensures zero popping/flashing black console windows during desktop app usage.
