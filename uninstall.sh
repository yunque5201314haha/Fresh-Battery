#!/system/bin/sh
MODDIR=${0%/*}

PIDFILE="$MODDIR/pids"
if [ -f "$PIDFILE" ]; then
    while read -r _ _pid _; do
        [ -n "$_pid" ] && kill -9 "$_pid" 2>/dev/null
    done < "$PIDFILE"
    sleep 1
fi

UMOUNT_NODES="
    /sys/class/oplus_chg/battery/battery_cc
    /sys/class/power_supply/battery/cycle_count
    /sys/class/power_supply/battery/capacity
    /sys/class/power_supply/battery/temp
    /sys/class/oplus_chg/battery/temp
    /sys/class/oplus_chg/battery/batt_temp
    /sys/class/oplus_chg/battery/temp_level
    /sys/devices/platform/soc/soc:oplus,mms_gauge/oplus_mms/gauge/battery/temp
    /sys/class/power_supply/battery/status
    /my_product/etc/extension/com.oplus.app-features.xml
"

RESET_NODES="
    /proc/game_opt/disable_cpufreq_limit
    /proc/oplus-votable/COOL_DOWN/force_active
    /proc/oplus-votable/VOOC_CURR/force_active
    /proc/oplus-votable/FCC/force_active
    /proc/oplus-votable/ICL/force_active
    /proc/oplus-votable/WIRED_CURR_CTRL/force_active
    /sys/class/oplus_chg/battery/normal_cool_down
    /sys/class/oplus_chg/battery/cool_down
"

for node in $UMOUNT_NODES; do
    umount -l "$node" 2>/dev/null
done

for node in $RESET_NODES; do
    echo 0 > "$node" 2>/dev/null
done

echo 1 > /sys/class/oplus_chg/battery/mmi_charging_enable 2>/dev/null

echo 10000000 > /sys/class/power_supply/battery/constant_charge_current 2>/dev/null
echo 0 > /sys/class/power_supply/battery/input_suspend 2>/dev/null

[ -d "$MODDIR/fake" ] && rm -rf "$MODDIR/fake" 2>/dev/null

dumpsys battery reset 2>/dev/null
exit 0
