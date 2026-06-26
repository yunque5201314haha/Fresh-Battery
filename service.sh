#!/system/bin/sh
MODDIR=${0%/*}

until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 5
done

chmod 755 "$MODDIR"
chmod 644 "$MODDIR/module.prop"
chmod 666 "$MODDIR/config" 2>/dev/null
find "$MODDIR/webroot" -type f -exec chmod 644 {} \; 2>/dev/null
find "$MODDIR/webroot" -type d -exec chmod 755 {} \; 2>/dev/null

"$MODDIR/MAIN" "$MODDIR" >/dev/null 2>&1 &
