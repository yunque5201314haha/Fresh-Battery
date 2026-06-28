#!/system/bin/sh
MODDIR=${0%/*}

until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 5
done

chmod 755 "$MODDIR"
chmod 644 "$MODDIR/module.prop"
chmod 666 "$MODDIR/config" 2>/dev/null

# 用 shell 递归替代 find，启动更快
_chmod_tree() {
    for _f in "$1"/*; do
        [ -d "$_f" ] && { chmod 755 "$_f"; _chmod_tree "$_f"; }
        [ -f "$_f" ] && chmod 644 "$_f"
    done
}
[ -d "$MODDIR/webroot" ] && _chmod_tree "$MODDIR/webroot"

if [ -x "$MODDIR/MAIN" ]; then
    "$MODDIR/MAIN" "$MODDIR" >/dev/null 2>&1 &
else
    echo "FreshBattery: MAIN binary not found or not executable" >&2
fi
