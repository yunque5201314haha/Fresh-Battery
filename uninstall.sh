#!/system/bin/sh
_d=${0%/*}

# ── 停止主进程 ──
_f=$_d/pids
if [ -f "$_f" ]; then
    while IFS= read -r _l; do
        _p=$(echo "$_l" | awk '{print $2}')
        [ -n "$_p" ] && kill -9 "$_p" 2>/dev/null
    done < "$_f"
    sleep 1
fi

_u() { umount -l "$1" 2>/dev/null; }
_w() { echo 0 > "$1" 2>/dev/null; }

# ── umount sysfs 节点 ──
_u /sys/class/oplus_chg/battery/battery_cc
_u /sys/class/power_supply/battery/cycle_count
_u /sys/class/power_supply/battery/capacity
_u /sys/class/power_supply/battery/temp
_u /sys/class/oplus_chg/battery/temp
_u /sys/class/oplus_chg/battery/batt_temp
_u /sys/class/oplus_chg/battery/temp_level
_u /sys/devices/platform/soc/soc:oplus,mms_gauge/oplus_mms/gauge/battery/temp
# ── 恢复充电节点 ──
_w /proc/game_opt/disable_cpufreq_limit
_w /proc/oplus-votable/COOL_DOWN/force_active
_w /proc/oplus-votable/VOOC_CURR/force_active
_w /proc/oplus-votable/FCC/force_active
_w /proc/oplus-votable/ICL/force_active
_w /proc/oplus-votable/WIRED_CURR_CTRL/force_active

# ── 米系亮屏快充恢复 ──
echo 10000000 > /sys/class/power_supply/battery/constant_charge_current 2>/dev/null
echo 0 > /sys/class/power_supply/battery/input_suspend 2>/dev/null

dumpsys battery reset 2>/dev/null
exit 0
