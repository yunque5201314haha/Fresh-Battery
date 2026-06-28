#!/system/bin/sh
if [ -z "$MODPATH" ]; then
    _self="$0"
    case "$_self" in
        /*) ;;
        *)  _self="$(pwd)/$_self" ;;
    esac
    MODPATH="${_self%/*}"
fi
mkdir -p "$MODPATH" || { ui_print "错误：无法创建 $MODPATH"; exit 1; }

CFG="$MODPATH/config"

if [ ! -f "$CFG" ]; then
    printf '%s\n' \
        "目标温度=34" \
        "服务开关=0" \
        "循环伪装=0" \
        "CPU频率解锁=0" \
        "电量挂载=0" \
        "MI伪旁路充电=0" \
        "电流限制=0" \
        "最大电流=22000" \
        "O伪旁路充电=0" \
        "伪插拔间隔=0" \
        "伪插拔电量=80" \
        "伪Osys旁路充电=0" \
        "组件控制=0" \
        "充电开启=0" \
        "电量伪装=0" \
        "电量伪装值=80" \
        "温度伪装=0" \
        "温度伪装值=34" \
        "循环伪装值=10" \
        "充放状态伪装=0" \
        "亮屏充电限制=0" \
        "日志输出=0" \
        "电量伪装充电=0" \
        "温度伪装充电=0" \
        "循环伪装充电=0" \
        "充放状态充电=0" \
        "亮屏充电充电=0" > "$CFG"
fi
chmod 666 "$CFG"

MDIR=/data/adb/modules/Fresh-Battery
if [ -f /data/adb/magisk.db ] || [ -f /data/adb/apd ] || [ -f /data/adb/ksu ]; then
    mkdir -p "$MDIR"
    cp "$MODPATH/module.prop" "$MDIR/module.prop"
    : > "$MDIR/update"
fi

ui_print "  FreshBattery 安装完成，请通过 WebUI 配置。"
ui_print " "
ui_print "  本模块作者不承担任何带来的后果"
ui_print "  刷入本模块代表同意"
ui_print " "
ui_print "  感谢使用本模块！"
exit 0
