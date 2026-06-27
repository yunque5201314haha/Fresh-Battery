# Magisk Module Build Workflow Design

## Overview

GitHub Actions workflow that cross-compiles `main.c` to an ARM64 `MAIN` binary using Android NDK, then packages it with the module's other assets into a Magisk module zip.

## Triggers

| Event | Action |
|-------|--------|
| Push to `main` branch | Compile + package, upload zip as Actions Artifact |
| Push tag matching `v*` | Compile + package, upload to Artifact, create GitHub Release with zip |

## Steps

1. **Checkout** — `actions/checkout@v4`
2. **Setup NDK** — `ncipollo/setup-ndk@v1`, NDK r27
3. **Compile** — `aarch64-linux-android24-clang -O2 -o MAIN main.c -static`
   - API 24 targets Android 7.0+
   - `-static` avoids runtime linker issues on different ROMs
   - No `-lpthread` needed; Bionic libc includes pthreads natively
4. **Package** — Read `id=` and `version=` from `module.prop`, create `<id>-<version>.zip` containing:
   ```
   META-INF/com/google/android/{update-binary,updater-script}
   webroot/index.html
   webroot/js/
   customize.sh
   module.prop
   service.sh
   uninstall.sh
   MAIN
   ```
5. **Upload Artifact** — `actions/upload-artifact@v4`, always runs
6. **Create Release** — `softprops/action-gh-release@v2`, only runs on tag push

## Files

- `.github/workflows/build-magisk-module.yml` — the single workflow file
