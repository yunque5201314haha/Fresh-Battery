# Magisk Module Build Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a GitHub Actions workflow that cross-compiles `main.c` to ARM64 and packages a Magisk module zip.

**Architecture:** Single YAML workflow file triggering on push to `main` and `v*` tags. NDK cross-compiles `main.c` → `MAIN`, then all module assets are zipped.

**Tech Stack:** GitHub Actions, Android NDK r27, aarch64-linux-android24-clang

## Global Constraints

- `main.c` compiles to `MAIN` binary for ARM64 (API 24+)
- Zip name = `<module-id>-<version>.zip` (from `module.prop`: `Fresh-Battery-v1.0.zip`)
- Branch push → upload zip as Actions Artifact
- Tag push (`v*`) → upload Artifact + create GitHub Release
- NDK toolchain path from `ncipollo/setup-ndk` output
- Compile with `-O2 -static` (no `-lpthread`, Bionic libc includes it)
- Zip root contains: `MAIN`, `META-INF/`, `webroot/`, `customize.sh`, `module.prop`, `service.sh`, `uninstall.sh`

---

### Task 1: Create GitHub Actions workflow

**Files:**
- Create: `.github/workflows/build-magisk-module.yml`

**Interfaces:**
- Consumes: `main.c` (source), `module.prop` (metadata), `META-INF/`, `webroot/`, `customize.sh`, `module.prop`, `service.sh`, `uninstall.sh` (module assets)
- Produces: `Fresh-Battery-v1.0.zip` (Magisk module) uploaded as Actions Artifact and optionally to GitHub Release

- [ ] **Step 1: Write the workflow file**

```yaml
name: Build Magisk Module

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup NDK
        id: setup-ndk
        uses: ncipollo/setup-ndk@v1
        with:
          ndk-version: r27

      - name: Compile MAIN binary
        run: |
          TOOLCHAIN=${{ steps.setup-ndk.outputs.ndk-path }}/toolchains/llvm/prebuilt/linux-x86_64
          $TOOLCHAIN/bin/aarch64-linux-android24-clang \
            -O2 -static -o MAIN main.c

      - name: Package Magisk Module
        run: |
          MODULE_ID=$(grep '^id=' module.prop | cut -d= -f2)
          MODULE_VER=$(grep '^version=' module.prop | cut -d= -f2)
          ZIP_NAME="${MODULE_ID}-${MODULE_VER}.zip"
          echo "ZIP_NAME=${ZIP_NAME}" >> $GITHUB_ENV
          mkdir -p _module
          cp -r META-INF webroot customize.sh module.prop service.sh uninstall.sh MAIN _module/
          cd _module && zip -r9 "../${ZIP_NAME}" . && cd ..

      - name: Upload Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ env.ZIP_NAME }}
          path: ${{ env.ZIP_NAME }}

      - name: Create Release
        if: startsWith(github.ref, 'refs/tags/')
        uses: softprops/action-gh-release@v2
        with:
          files: ${{ env.ZIP_NAME }}
```

- [ ] **Step 2: Verify the file is valid YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-magisk-module.yml')); print('Valid YAML')"`

Expected output: `Valid YAML`

- [ ] **Step 3: Commit**

```bash
cd /storage/emulated/0/Download/frsh
git add .github/workflows/build-magisk-module.yml
git commit -m "ci: add Magisk module build workflow

Cross-compile main.c to ARM64 MAIN binary via NDK, package module zip
on push to main, create Release on tag push.

Closes #ISSUE"
```
