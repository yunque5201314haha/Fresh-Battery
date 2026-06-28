#!/system/bin/sh
MODDIR=${0%/*}

until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 5
done

chmod 755 "$MODDIR"
chmod 644 "$MODDIR/module.prop"
chmod 666 "$MODDIR/config" 2>/dev/null
chmod 666 "$MODDIR/log" 2>/dev/null

_chmod_tree() {
    for _f in "$1"/*; do
        [ -d "$_f" ] && { chmod 755 "$_f"; _chmod_tree "$_f"; }
        [ -f "$_f" ] && chmod 644 "$_f"
    done
}
[ -d "$MODDIR/webroot" ] && _chmod_tree "$MODDIR/webroot"

if [ -x "$MODDIR/bin/MAIN" ]; then
    "$MODDIR/bin/MAIN" "$MODDIR" >/dev/null 2>&1 &
else
    echo "FreshBattery: MAIN binary not found or not executable" >&2
fi

if [ -x "$MODDIR/bin/frlog" ]; then
    _log_on=$(grep '^日志输出=' "$MODDIR/config" 2>/dev/null | cut -d= -f2)
    [ "$_log_on" = "1" ] && "$MODDIR/bin/frlog" "$MODDIR" >/dev/null 2>&1 &
fi
