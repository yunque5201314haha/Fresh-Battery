/*
 * Temperature - 充电温度伪装
 * gcc -O2 -o MAIN main.c -lpthread
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <time.h>
#include <pthread.h>
#include <sys/mount.h>
#include <sys/stat.h>
#include <sys/file.h>
#include <sys/wait.h>
#include <signal.h>

/* ── 节点路径 ── */
#define SHELL_TEMP   "/proc/shell-temp"
#define REAL_TEMP    "/sys/class/oplus_chg/battery/temp"
#define CHG_STATUS   "/sys/class/power_supply/battery/status"
#define USB_PRESENT  "/sys/class/power_supply/usb/present"
#define USB_ONLINE   "/sys/class/power_supply/usb/online"
#define AC_ONLINE    "/sys/class/power_supply/ac/online"
#define CHIP_SOC     "/sys/class/oplus_chg/battery/chip_soc"
#define BAT_CAP      "/sys/class/power_supply/battery/capacity"
#define COOL_DN_VAL  "/proc/oplus-votable/COOL_DOWN/force_val"
#define COOL_DN_ACT  "/proc/oplus-votable/COOL_DOWN/force_active"
#define VOOC_VAL     "/proc/oplus-votable/VOOC_CURR/force_val"
#define VOOC_ACT     "/proc/oplus-votable/VOOC_CURR/force_active"
#define CC_NODE1     "/sys/class/oplus_chg/battery/battery_cc"
#define CC_NODE2     "/sys/class/power_supply/battery/cycle_count"
#define CPU_FREQ_LMT "/proc/game_opt/disable_cpufreq_limit"
#define BAT_VOLT_UV  "/sys/class/power_supply/battery/voltage_now"
#define BAT_CURR_UA  "/sys/class/power_supply/battery/current_now"
#define BAT_HEALTH   "/sys/class/power_supply/battery/health"
#define BAT_CHGCURR  "/sys/class/power_supply/battery/charge_full"
#define BAT_CHGFULL  "/sys/class/power_supply/battery/charge_full_design"

/* 电流控制节点 */
static const char *CURR_NODES[] = {
    "/sys/class/power_supply/battery/constant_charge_current_max",
    "/sys/class/power_supply/battery/fast_charge_current",
    "/sys/class/power_supply/usb/input_current_limit",
    "/sys/class/power_supply/usb/current_max",
    "/sys/class/power_supply/ac/input_current_limit",
    "/sys/class/oplus_chg/usb/hw_current_max",
    NULL
};
static const char *CURR_VOTABLE_VAL[] = {
    "/proc/oplus-votable/FCC/force_val",
    "/proc/oplus-votable/ICL/force_val",
    "/proc/oplus-votable/WIRED_CURR_CTRL/force_val",
    NULL
};
static const char *CURR_VOTABLE_ACT[] = {
    "/proc/oplus-votable/FCC/force_active",
    "/proc/oplus-votable/ICL/force_active",
    "/proc/oplus-votable/WIRED_CURR_CTRL/force_active",
    NULL
};
/* 温度伪装节点（所有可能存在的，依次尝试挂载） */
static const char *TEMP_NODES[] = {
    "/sys/class/power_supply/battery/temp",
    "/sys/class/oplus_chg/battery/temp",
    "/sys/class/oplus_chg/battery/batt_temp",
    "/sys/class/oplus_chg/battery/temp_level",
    "/sys/devices/platform/soc/soc:oplus,mms_gauge/oplus_mms/gauge/battery/temp",
    NULL
};
/* 电量伪装节点 */
#define CAP_TARGET  "/sys/class/power_supply/battery/capacity"
/* 欧加亮屏限制节点 */
#define NORM_COOLDOWN  "/sys/class/oplus_chg/battery/normal_cool_down"
#define COOLDOWN       "/sys/class/oplus_chg/battery/cool_down"

#define BYPASS_CURR_UA  500000   /* 伪旁路：500mA，内核最低有效限制 */
#define MI_CHG_CURR     "/sys/class/power_supply/battery/constant_charge_current"

#define MODDIR_DEF   "/data/adb/modules/Fresh-Battery"
#define PLEN         512

static char g_moddir[PLEN];
static char g_cfg[PLEN];       /* config 文件路径 */
static char g_pids[PLEN];      /* pids 文件路径 */
static char g_fake_cc[PLEN];   /* fake_cc 文件路径 */
static char g_fake_soc[PLEN];  /* fake_soc 文件路径 */
static char g_fake_cap[PLEN];  /* fake_cap 文件路径（电量伪装） */
static char g_fake_temp[PLEN]; /* fake_temp 文件路径（温度伪装） */

/* ── 配置 ── */
typedef struct {
    int target_temp;   /* 摄氏度，默认 34 */
    int svc_enabled;
    int cc_spoof;
    int cpu_unlock;
    int cap_mount;     /* 电量挂载（旧） */
    int bypass_charge; /* MI伪旁路充电全局开关（小米），默认关 */
    int curr_limit;    /* 充电电流限制开关，默认关 */
    int curr_max_ma;   /* 最大电流 mA，默认 22000 */
    int mmi_bypass;    /* oplus mmi_charging_enable 旁路，开=写0，默认关 */
    int plug_interval; /* 伪插拔间隔分钟，0=关闭，默认0 */
    int plug_level;    /* 伪插拔电量阈值%，低于此值才执行，默认80 */
    int plc_charge;    /* 全场景伪Osys旁路充电特性注入，默认关 */
    int oplus_comp;   /* 组件控制，默认关 */
    /* 公共页伪装功能 */
    int chg_gate;      /* 充电开启总控，默认关 */
    int cap_spoof;     /* 电量伪装，默认关 */
    int cap_spoof_val; /* 电量伪装值，默认80 */
    int temp_spoof;    /* 温度伪装，默认关 */
    int temp_spoof_val;/* 温度伪装值，默认34 */
    int cc_spoof_val;  /* 循环伪装值，默认10 */
    int status_spoof;  /* 充放状态伪装，默认关 */
    int chg_unlock;    /* 亮屏充电限制，默认关 */
} Config;

static const Config CFG_DEF = {34, 0, 0, 0, 0, 0, 0, 22000, 0, 0, 0, 80, 0, 0, 0, 0, 0, 80, 0, 34, 10, 0, 0};

/* ── I/O 工具 ── */
static int rd_int(const char *p) {
    int fd = open(p, O_RDONLY | O_CLOEXEC);
    if (fd < 0) return -1;
    char buf[32] = {0};
    int n = read(fd, buf, 31);
    close(fd);
    if (n <= 0) return -1;
    /* 跳过前导空白，确保首个有效字符是数字或负号 */
    char *s = buf;
    while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++;
    if (*s == 0 || (!(*s >= '0' && *s <= '9') && *s != '-')) return -1;
    return atoi(s);
}

static void wr_str(const char *p, const char *v) {
    int fd = open(p, O_WRONLY | O_CLOEXEC);
    if (fd < 0) return;
    write(fd, v, strlen(v));
    close(fd);
}

static void mkdirp(const char *path) {
    char tmp[PLEN];
    strncpy(tmp, path, PLEN - 1);
    for (char *p = tmp + 1; *p; p++) {
        if (*p == '/') { *p = 0; mkdir(tmp, 0755); *p = '/'; }
    }
    mkdir(tmp, 0755);
}

/* ── 配置解析 ── */
static int cfg_get(const char *buf, const char *key) {
    char search[64];
    snprintf(search, sizeof(search), "%s", key);
    const char *p = buf;
    size_t klen = strlen(key);
    while ((p = strstr(p, key)) != NULL) {
        /* 确保是行首 */
        if (p != buf && *(p - 1) != '\n') { p++; continue; }
        /* 跳过 key */
        const char *q = p + klen;
        /* 跳过可选空格 */
        while (*q == ' ' || *q == '\t') q++;
        /* 必须是 '=' */
        if (*q != '=') { p++; continue; }
        q++;
        /* 跳过 '=' 后可选空格 */
        while (*q == ' ' || *q == '\t') q++;
        return atoi(q);
    }
    return -1;
}

static Config parse_config(void) {
    Config c = CFG_DEF;
    FILE *f = fopen(g_cfg, "r");
    if (!f) return c;
    /* 读整个文件到 buf */
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    rewind(f);
    if (sz <= 0 || sz > 4096) { fclose(f); return c; }
    char *buf = malloc(sz + 1);
    if (!buf) { fclose(f); return c; }
    fread(buf, 1, sz, f);
    fclose(f);
    buf[sz] = 0;

    int v;
    v = cfg_get(buf, "目标温度");    if (v > 0)               c.target_temp  = v;
    v = cfg_get(buf, "服务开关");    if (v == 0 || v == 1)    c.svc_enabled  = v;
    v = cfg_get(buf, "循环伪装");    if (v == 0 || v == 1)    c.cc_spoof     = v;
    v = cfg_get(buf, "CPU频率解锁"); if (v == 0 || v == 1)    c.cpu_unlock   = v;
    v = cfg_get(buf, "电量挂载");    if (v == 0 || v == 1)    c.cap_mount    = v;
    v = cfg_get(buf, "MI伪旁路充电");  if (v == 0 || v == 1)    c.bypass_charge= v;
    v = cfg_get(buf, "电流限制");    if (v == 0 || v == 1)    c.curr_limit   = v;
    v = cfg_get(buf, "最大电流");    if (v > 0)               c.curr_max_ma  = v;
    v = cfg_get(buf, "O伪旁路充电");     if (v == 0 || v == 1)    c.mmi_bypass   = v;
    v = cfg_get(buf, "伪插拔间隔");  if (v >= 0)               c.plug_interval = v;
    v = cfg_get(buf, "伪插拔电量");  if (v > 0 && v <= 100)    c.plug_level    = v;
    v = cfg_get(buf, "伪Osys旁路充电");    if (v == 0 || v == 1)     c.plc_charge    = v;
    v = cfg_get(buf, "组件控制");       if (v == 0 || v == 1)     c.oplus_comp    = v;
    v = cfg_get(buf, "充电开启");       if (v == 0 || v == 1)     c.chg_gate      = v;
    v = cfg_get(buf, "电量伪装");       if (v == 0 || v == 1)     c.cap_spoof     = v;
    v = cfg_get(buf, "电量伪装值");     if (v >= 0 && v <= 100)   c.cap_spoof_val = v;
    v = cfg_get(buf, "温度伪装");       if (v == 0 || v == 1)     c.temp_spoof    = v;
    v = cfg_get(buf, "温度伪装值");     if (v >= 0 && v <= 100)   c.temp_spoof_val= v;
    v = cfg_get(buf, "循环伪装值");     if (v >= 0)               c.cc_spoof_val  = v;
    v = cfg_get(buf, "充放状态伪装");   if (v == 0 || v == 1)     c.status_spoof  = v;
    v = cfg_get(buf, "亮屏充电限制");   if (v == 0 || v == 1)     c.chg_unlock    = v;
    free(buf);
    return c;
}

/* 带 stat 防抖的缓存版本：mtime 未变则直接返回上次结果 */
static pthread_mutex_t cfg_mutex = PTHREAD_MUTEX_INITIALIZER;

static Config parse_config_cached(void) {
    static Config s_cache;
    static time_t s_mtime = 0;
    static int    s_init  = 0;
    struct stat st;
    if (stat(g_cfg, &st) != 0) return s_init ? s_cache : CFG_DEF;
    if (s_init && st.st_mtime == s_mtime) return s_cache;
    pthread_mutex_lock(&cfg_mutex);
    /* 二次检查：拿到锁后确认 mtime 未变 */
    if (stat(g_cfg, &st) == 0 && (!s_init || st.st_mtime != s_mtime)) {
        s_cache = parse_config();
        s_mtime = st.st_mtime;
        s_init  = 1;
    }
    pthread_mutex_unlock(&cfg_mutex);
    return s_cache;
}

static void write_config(const Config *c) {
    char tmp[PLEN];
    snprintf(tmp, sizeof(tmp), "%s.tmp", g_cfg);
    FILE *f = fopen(tmp, "w");
    if (!f) return;
    fprintf(f,
        "目标温度=%d\n"
        "服务开关=%d\n"
        "循环伪装=%d\n"
        "CPU频率解锁=%d\n"
        "电量挂载=%d\n"
        "MI伪旁路充电=%d\n"
        "电流限制=%d\n"
        "最大电流=%d\n"
        "O伪旁路充电=%d\n"
        "伪插拔间隔=%d\n"
        "伪插拔电量=%d\n"
        "伪Osys旁路充电=%d\n"
        "组件控制=%d\n"
        "充电开启=%d\n"
        "电量伪装=%d\n"
        "电量伪装值=%d\n"
        "温度伪装=%d\n"
        "温度伪装值=%d\n"
        "循环伪装值=%d\n"
        "充放状态伪装=%d\n"
        "亮屏充电限制=%d\n",
        c->target_temp, c->svc_enabled,
        c->cc_spoof, c->cpu_unlock, c->cap_mount,
        c->bypass_charge, c->curr_limit, c->curr_max_ma,
        c->mmi_bypass,
        c->plug_interval, c->plug_level, c->plc_charge,
        c->oplus_comp,
        c->chg_gate, c->cap_spoof, c->cap_spoof_val,
        c->temp_spoof, c->temp_spoof_val, c->cc_spoof_val,
        c->status_spoof, c->chg_unlock);
    fclose(f);
    rename(tmp, g_cfg);
    chmod(g_cfg, 0666);
}

/* ── 温度写入 ── */
static void write_temp(int celsius) {
    int fd = open(SHELL_TEMP, O_WRONLY | O_CLOEXEC);
    if (fd < 0) return;
    int millideg = celsius * 1000;
    for (int i = 0; i <= 9; i++) {
        char buf[32];
        int n = snprintf(buf, sizeof(buf), "%d %d\n", i, millideg);
        write(fd, buf, n);
    }
    close(fd);
}

/* ── 充电检测 ── */
static int is_charging(void) {
    char buf[32] = {0};
    int fd = open(CHG_STATUS, O_RDONLY | O_CLOEXEC);
    if (fd >= 0) { read(fd, buf, 31); close(fd); }
    buf[strcspn(buf, "\n")] = 0;
    if (strcmp(buf, "Charging") != 0 && strcmp(buf, "Full") != 0) return 0;
    if (rd_int(USB_PRESENT) == 1) return 1;
    if (rd_int(USB_ONLINE)  == 1) return 1;
    if (rd_int(AC_ONLINE)   == 1) return 1;
    return 0;
}

/* ── 充电解锁 ── */
static void chg_unlock_on(void) {
    system("stop horae 2>/dev/null");
    wr_str(COOL_DN_VAL, "0\n");
    wr_str(COOL_DN_ACT, "1\n");
    wr_str(VOOC_VAL,    "7500\n");
    wr_str(VOOC_ACT,    "1\n");
    system("setprop ro.oplus.charge.thermal.limit 0 2>/dev/null");
    system("setprop persist.vendor.charge.thermal.control 0 2>/dev/null");
}

static void chg_unlock_off(void) {
    wr_str(COOL_DN_ACT, "0\n");
    wr_str(VOOC_ACT,    "0\n");
    system("setprop ro.oplus.charge.thermal.limit 1 2>/dev/null");
    system("setprop persist.vendor.charge.thermal.control 1 2>/dev/null");
}

/* ── CPU 频率限制 ── */
static void cpu_limit_off(void) {
    wr_str(CPU_FREQ_LMT, "1\n");
    system("setprop persist.vendor.enable.cpulimit false 2>/dev/null");
}
static void cpu_limit_on(void)  { wr_str(CPU_FREQ_LMT, "0\n"); }

/* ── MI伪旁路充电：全局将电流限制到 500mA ── */
static void bypass_charge_on(void) {
    char ua_str[32];
    snprintf(ua_str, sizeof(ua_str), "%d\n", BYPASS_CURR_UA);
    for (int i = 0; CURR_NODES[i]; i++)
        if (access(CURR_NODES[i], W_OK) == 0) wr_str(CURR_NODES[i], ua_str);
    /* votable: 500mA = 500 (单位 mA) */
    for (int i = 0; CURR_VOTABLE_VAL[i]; i++) {
        if (access(CURR_VOTABLE_VAL[i], W_OK)) continue;
        if (access(CURR_VOTABLE_ACT[i], W_OK)) continue;
        wr_str(CURR_VOTABLE_VAL[i], "500\n");
        wr_str(CURR_VOTABLE_ACT[i], "1\n");
    }
}

static void bypass_charge_off(void) {
    /* 释放 votable，恢复系统默认 */
    for (int i = 0; CURR_VOTABLE_ACT[i]; i++)
        if (access(CURR_VOTABLE_ACT[i], W_OK) == 0)
            wr_str(CURR_VOTABLE_ACT[i], "0\n");
}

/* ── 米系亮屏快充 ── */
static int saved_mi_curr = -1;

static void mi_chg_unlock(void) {
    saved_mi_curr = rd_int(MI_CHG_CURR);
    wr_str(MI_CHG_CURR, "10000000\n");
}

static void mi_chg_restore(void) {
    if (saved_mi_curr > 0) {
        char buf[32];
        snprintf(buf, sizeof(buf), "%d\n", saved_mi_curr);
        wr_str(MI_CHG_CURR, buf);
    }
    saved_mi_curr = -1;
}

static int read_batt_temp(void) {
    return rd_int(REAL_TEMP);
}

static void mi_chg_set(int temp) {
    if (temp <= 370)
        wr_str(MI_CHG_CURR, "6000000\n");
    else if (temp <= 400)
        wr_str(MI_CHG_CURR, "3000000\n");
    else if (temp <= 430)
        wr_str(MI_CHG_CURR, "1500000\n");
    else
        wr_str(MI_CHG_CURR, "500000\n");
}

/* ── oplus mmi_charging_enable 旁路 ── */
#define MMI_CHG_ENABLE "/sys/class/oplus_chg/battery/mmi_charging_enable"

static void mmi_bypass_on(void) {
    /* 开启旁路：写 0 禁止充电 */
    if (access(MMI_CHG_ENABLE, W_OK) == 0)
        wr_str(MMI_CHG_ENABLE, "0\n");
}

static void mmi_bypass_off(void) {
    /* 关闭旁路：写 1 恢复充电 */
    if (access(MMI_CHG_ENABLE, W_OK) == 0)
        wr_str(MMI_CHG_ENABLE, "1\n");
}

/* ── 全场景伪Osys旁路充电特性注入 ── */
#define PLC_TARGET "/my_product/etc/extension/com.oplus.app-features.xml"
#define PLC_FEATURES_CONTENT \
    "\t<app_feature name=\"com.oplus.plc_charge.support\">\n" \
    "\t\t<StringList args=\"true\"/>\n" \
    "\t</app_feature>\n" \
    "\t<app_feature name=\"com.oplus.fullscene_plc_charge.support\" args=\"boolean:true\"/>\n" \
    "\t<app_feature name=\"com.oplus.reversecharge\" args=\"boolean:true\"/>"

static void plc_charge_on(const char *moddir) {
    if (access(PLC_TARGET, F_OK) != 0) return;
    if (system("grep -q 'com.oplus.plc_charge.support' '" PLC_TARGET "' 2>/dev/null") == 0) return;

    /* 把特性内容写到独立文件，awk 引用该文件，避免 shell 转义地狱 */
    char feat[PLEN], tmp[PLEN], cmd[PLEN * 3];
    snprintf(feat, sizeof(feat), "%s/fake/plc_feat.txt", moddir);
    snprintf(tmp,  sizeof(tmp),  "%s/fake/plc_features.xml", moddir);

    FILE *f = fopen(feat, "w");
    if (!f) return;
    fputs(PLC_FEATURES_CONTENT, f);
    fclose(f);

    snprintf(cmd, sizeof(cmd),
        "awk '/<[/]extend_features>/{while((getline l<\"%s\")>0)print l} {print}' "
        "'%s' > '%s' && mount --bind '%s' '%s' && restorecon '%s' 2>/dev/null",
        feat, PLC_TARGET, tmp, tmp, PLC_TARGET, PLC_TARGET);
    system(cmd);
}

static void plc_charge_off(const char *moddir) {
    umount2(PLC_TARGET, MNT_DETACH);
    char p[PLEN];
    snprintf(p, sizeof(p), "%s/fake/plc_feat.txt",     moddir); unlink(p);
    snprintf(p, sizeof(p), "%s/fake/plc_features.xml", moddir); unlink(p);
}

/* ── 充电电流限制 ── */
static void curr_limit_apply(int ma) {
    /* sysfs 节点单位是微安 */
    char ua_str[32];
    snprintf(ua_str, sizeof(ua_str), "%d\n", ma * 1000);
    for (int i = 0; CURR_NODES[i]; i++)
        if (access(CURR_NODES[i], W_OK) == 0) wr_str(CURR_NODES[i], ua_str);
    /* votable 单位是 mA */
    char ma_str[32];
    snprintf(ma_str, sizeof(ma_str), "%d\n", ma);
    for (int i = 0; CURR_VOTABLE_VAL[i]; i++) {
        if (access(CURR_VOTABLE_VAL[i], W_OK)) continue;
        if (access(CURR_VOTABLE_ACT[i], W_OK)) continue;
        wr_str(CURR_VOTABLE_VAL[i], ma_str);
        wr_str(CURR_VOTABLE_ACT[i], "1\n");
    }
}

static void curr_limit_off(void) {
    for (int i = 0; CURR_VOTABLE_ACT[i]; i++)
        if (access(CURR_VOTABLE_ACT[i], W_OK) == 0)
            wr_str(CURR_VOTABLE_ACT[i], "0\n");
}

/* ── 循环伪装 mount/umount （可配置值）── */
static void cc_mount_val(int val) {
    char dir[PLEN];
    snprintf(dir, sizeof(dir), "%s/fake", g_moddir);
    mkdirp(dir);
    int fd = open(g_fake_cc, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0444);
    if (fd >= 0) {
        char buf[32];
        int n = snprintf(buf, sizeof(buf), "%d\n", val);
        write(fd, buf, n);
        close(fd);
    }
    if (access(CC_NODE1, F_OK) == 0) mount(g_fake_cc, CC_NODE1, NULL, MS_BIND, NULL);
    if (access(CC_NODE2, F_OK) == 0) mount(g_fake_cc, CC_NODE2, NULL, MS_BIND, NULL);
}

static void cc_umount(void) {
    umount2(CC_NODE1, MNT_DETACH);
    umount2(CC_NODE2, MNT_DETACH);
    unlink(g_fake_cc);
}

/* ── 公共页：电量伪装 mount/umount（可配置值）── */
static void cap_spoof_mount(int val) {
    char dir[PLEN];
    snprintf(dir, sizeof(dir), "%s/fake", g_moddir);
    mkdirp(dir);
    int fd = open(g_fake_cap, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0444);
    if (fd >= 0) {
        char buf[32];
        int n = snprintf(buf, sizeof(buf), "%d\n", val);
        write(fd, buf, n);
        close(fd);
    }
    if (access(CAP_TARGET, F_OK) == 0) mount(g_fake_cap, CAP_TARGET, NULL, MS_BIND, NULL);
}

static void cap_spoof_umount(void) {
    umount2(CAP_TARGET, MNT_DETACH);
    unlink(g_fake_cap);
}

/* ── 公共页：温度伪装 mount/umount（可配置值，写入 decicelsius）── */
static void temp_spoof_mount(int val) {
    char dir[PLEN];
    snprintf(dir, sizeof(dir), "%s/fake", g_moddir);
    mkdirp(dir);
    int decicelsius = val * 10;
    int fd = open(g_fake_temp, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0444);
    if (fd >= 0) {
        char buf[32];
        int n = snprintf(buf, sizeof(buf), "%d\n", decicelsius);
        write(fd, buf, n);
        close(fd);
    }
    for (int i = 0; TEMP_NODES[i]; i++) {
        if (access(TEMP_NODES[i], F_OK) == 0)
            mount(g_fake_temp, TEMP_NODES[i], NULL, MS_BIND, NULL);
    }
}

static void temp_spoof_umount(void) {
    for (int i = 0; TEMP_NODES[i]; i++)
        umount2(TEMP_NODES[i], MNT_DETACH);
    unlink(g_fake_temp);
}

/* ── 公共页：充放状态伪装 mount/umount ── */
static void status_spoof_mount(const char *val) {
    char p[PLEN];
    snprintf(p, sizeof(p), "%s/fake/fakestatus", g_moddir);
    char dir[PLEN];
    snprintf(dir, sizeof(dir), "%s/fake", g_moddir);
    mkdirp(dir);
    int fd = open(p, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0444);
    if (fd >= 0) {
        write(fd, val, strlen(val));
        write(fd, "\n", 1);
        close(fd);
    }
    if (access(CHG_STATUS, F_OK) == 0) mount(p, CHG_STATUS, NULL, MS_BIND, NULL);
}

static void status_spoof_umount(void) {
    umount2(CHG_STATUS, MNT_DETACH);
    char p[PLEN];
    snprintf(p, sizeof(p), "%s/fake/fakestatus", g_moddir);
    unlink(p);
}

/* ── 公共页：解除亮屏充电限制（OPPO 系写 cool_down）── */
static void unlock_chg_on(void) {
    if (access(COOLDOWN, F_OK) == 0) {
        wr_str(NORM_COOLDOWN, "0\n");
        wr_str(COOLDOWN, "0\n");
    }
    /* MI系通过 mi_chg_set 在主循环处理 */
}
static void unlock_chg_off(void) {
    /* cool_down 恢复：不主动写回，由系统默认值接管 */
    /* 通过 umount 或者后续系统行为恢复 */
    /* 对于OPPO系，我们只需停止写入即可 */
}

/* ── 电量挂载 mount/umount ── */
static void cap_mount(void) {
    mount(CHIP_SOC, BAT_CAP, NULL, MS_BIND, NULL);
}

static void cap_umount(void) {
    umount2(BAT_CAP, MNT_DETACH);
}

/* ── 充电日志 ── */
/* new_session=1 时截断文件（新一次充电），否则追加 */
static void *thr_chg(void *arg) {
    (void)arg;
    while (access(COOL_DN_ACT, F_OK) != 0) sleep(2);
    char prev[32] = {0};
    int mi_unlocked = 0;
    for (;;) {
        Config c = parse_config_cached();
        char buf[32] = {0};
        int fd = open(CHG_STATUS, O_RDONLY | O_CLOEXEC);
        if (fd >= 0) { read(fd, buf, 31); close(fd); }
        buf[strcspn(buf, "\n")] = 0;

        int now_chg  = strcmp(buf, "Charging") == 0 || strcmp(buf, "Full") == 0;
        int was_chg  = strcmp(prev, "Charging") == 0 || strcmp(prev, "Full") == 0;

        if (now_chg && !was_chg) {
            /* 充电开始 */
            chg_unlock_on();
            if (c.cpu_unlock) cpu_limit_off();
            /* 米系亮屏快充：解锁节点 */
            if (access(MI_CHG_CURR, F_OK) == 0) {
                mi_chg_unlock();
                mi_unlocked = 1;
            }
        } else if (!now_chg && was_chg) {
            /* 充电停止 */
            chg_unlock_off();
            if (c.cpu_unlock) cpu_limit_on();
            /* 米系亮屏快充：恢复 */
            if (mi_unlocked) {
                mi_chg_restore();
                mi_unlocked = 0;
            }
        }

        /* 充电中：每轮按温度动态调电流 */
        if (now_chg && mi_unlocked) {
            int temp = read_batt_temp();
            if (temp >= 0) mi_chg_set(temp);
        }

        strncpy(prev, buf, sizeof(prev) - 1);
        sleep(1);
    }
    return NULL;
}

/* ── 伪插拔线程 ── */
static void *thr_plug(void *arg) {
    (void)arg;
    for (;;) {
        sleep(10);
        Config c = parse_config_cached();

        /* 关闭→开启检测：interval 从0变非0时重置计时器 */
        static time_t s_last         = -1;  /* -1=未初始化 */
        static int    s_prev_interval = 0;
        int cur_interval = c.plug_interval;
        /* 记录上一轮interval（无论是否跳过，都要更新） */
        int was_off = (s_prev_interval == 0);
        s_prev_interval = cur_interval;

        /* 伪旁路开启时不运行；间隔为0时不运行 */
        if (c.mmi_bypass || cur_interval <= 0) continue;

        /* 检查充电状态 */
        char status[32] = {0};
        int fd = open(CHG_STATUS, O_RDONLY | O_CLOEXEC);
        if (fd >= 0) { read(fd, status, 31); close(fd); }
        status[strcspn(status, "\n")] = 0;
        int charging = (strcmp(status, "Charging") == 0 || strcmp(status, "Full") == 0);
        if (!charging) continue;

        /* 检查电量 */
        int soc = rd_int(CHIP_SOC);
        if (soc < 0) soc = rd_int(BAT_CAP);
        if (soc < 0 || soc >= c.plug_level) continue;

        /* 等待间隔到期；首次或刚从关闭状态开启时重置为当前时刻，不立即触发 */
        time_t now = time(NULL);
        if (s_last == -1 || was_off) s_last = now;
        if (now - s_last < (time_t)(cur_interval * 60)) continue;
        s_last = now;

        /* 执行伪插拔：写0停充 → 写1恢复 */
        if (access(MMI_CHG_ENABLE, W_OK) == 0)
            wr_str(MMI_CHG_ENABLE, "0\n");
        if (access(MMI_CHG_ENABLE, W_OK) == 0)
            wr_str(MMI_CHG_ENABLE, "1\n");
    }
    return NULL;
}

/* ── 主循环 ── */
int main(int argc, char *argv[]) {
    /* 自动回收子进程，避免僵尸进程 */
    signal(SIGCHLD, SIG_IGN);

    strncpy(g_moddir, argc > 1 ? argv[1] : MODDIR_DEF, PLEN - 1);

    snprintf(g_cfg,     sizeof(g_cfg),     "%s/config",         g_moddir);
    snprintf(g_pids,    sizeof(g_pids),    "%s/pids",           g_moddir);
    snprintf(g_fake_cc, sizeof(g_fake_cc), "%s/fake/fakecc",    g_moddir);
    snprintf(g_fake_cap,sizeof(g_fake_cap),"%s/fake/fakecap",   g_moddir);
    snprintf(g_fake_temp,sizeof(g_fake_temp),"%s/fake/faketemp",g_moddir);
    snprintf(g_fake_soc,sizeof(g_fake_soc),"%s/sys/class/oplus_chg/battery/fakesoc", g_moddir);

    /* ── 单实例锁：防止多进程竞争写入 sysfs ── */
    int lock_fd = open(g_pids, O_RDWR | O_CREAT, 0644);
    if (lock_fd >= 0 && flock(lock_fd, LOCK_EX | LOCK_NB) < 0) {
        /* 已有实例持锁，直接退出 */
        close(lock_fd);
        return 0;
    }

    /* 写 PID */
    if (lock_fd >= 0) {
        ftruncate(lock_fd, 0);
        char pid_buf[32];
        snprintf(pid_buf, sizeof(pid_buf), "MAIN %d\n", (int)getpid());
        write(lock_fd, pid_buf, strlen(pid_buf));
        /* 不关闭 lock_fd，进程退出时内核自动释放 flock */
    }

    /* 确保 fake 目录存在 */
    {
        char fake_dir[PLEN];
        snprintf(fake_dir, sizeof(fake_dir), "%s/fake", g_moddir);
        mkdirp(fake_dir);
    }

    sleep(12);

    /* 初始化配置 */
    if (access(g_cfg, F_OK) != 0) write_config(&CFG_DEF);
    chmod(g_cfg, 0666);

    Config c = parse_config();

    /* 初始挂载 */
    if (c.cap_mount) cap_mount();
    if (c.cc_spoof)  cc_mount_val(c.cc_spoof_val ? c.cc_spoof_val : 10);
    if (c.cap_spoof)   cap_spoof_mount(c.cap_spoof_val);
    if (c.temp_spoof)  temp_spoof_mount(c.temp_spoof_val);
    if (c.status_spoof) status_spoof_mount("Discharging");

    /* 充电解锁线程 */
    pthread_t t_chg;
    pthread_create(&t_chg, NULL, thr_chg, NULL);
    pthread_detach(t_chg);

    pthread_t t_plug;
    pthread_create(&t_plug, NULL, thr_plug, NULL);
    pthread_detach(t_plug);

    int last_state      = 0;
    int cc_mounted      = c.cc_spoof;
    int cap_mounted     = c.cap_mount;
    int bypass_on       = 0;   /* 伪旁路当前状态 */
    int curr_lim_on     = 0;   /* 电流限制当前状态 */
    int last_curr_ma    = 0;   /* 上次写入的电流值，用于脏位检测 */
    int mmi_on          = 0;   /* O伪旁路充电当前状态 */
    int plc_on          = 0;   /* 伪Osys旁路充电注入当前状态 */
    int comp_on         = 0;   /* 组件控制当前状态 */
    int tick            = 0;
    /* 公共页伪装功能状态 */
    int cap_spoof_on    = c.cap_spoof;
    int temp_spoof_on   = c.temp_spoof;
    int cc_spoof_val_on = c.cc_spoof;  /* 使用 cc_spoof（旧的），但值用 cc_spoof_val */
    int status_spoof_on = c.status_spoof;
    int chg_unlock_on   = c.chg_unlock;

    for (;;) {
        c = parse_config_cached();

        /* 同步 cc 挂载（旧功能，使用配置值） */
        if (c.cc_spoof  && !cc_mounted)  { cc_mount_val(c.cc_spoof_val ? c.cc_spoof_val : 10); cc_mounted  = 1; }
        if (!c.cc_spoof &&  cc_mounted)  { cc_umount();  cc_mounted  = 0; }

        /* 同步电量挂载（旧功能） */
        if (c.cap_mount  && !cap_mounted) { cap_mount();  cap_mounted = 1; }
        if (!c.cap_mount &&  cap_mounted) { cap_umount(); cap_mounted = 0; }

        /* ── 公共页伪装功能（chg_gate=关时全局生效，开时充电专属） ── */
        /* 电量伪装 */
        if (c.cap_spoof && !cap_spoof_on) {
            cap_spoof_mount(c.cap_spoof_val); cap_spoof_on = 1;
        } else if (!c.cap_spoof && cap_spoof_on) {
            cap_spoof_umount(); cap_spoof_on = 0;
        }
        /* 温度伪装（电池 sysfs 节点） */
        if (c.temp_spoof && !temp_spoof_on) {
            temp_spoof_mount(c.temp_spoof_val); temp_spoof_on = 1;
        } else if (!c.temp_spoof && temp_spoof_on) {
            temp_spoof_umount(); temp_spoof_on = 0;
        }
        /* 循环伪装值 */
        if (c.cc_spoof && !cc_spoof_val_on) {
            cc_mount_val(c.cc_spoof_val ? c.cc_spoof_val : 10); cc_spoof_val_on = 1;
        } else if (!c.cc_spoof && cc_spoof_val_on) {
            cc_umount(); cc_spoof_val_on = 0;
        }
        /* 充放状态伪装 */
        if (c.status_spoof && !status_spoof_on) {
            status_spoof_mount("Discharging"); status_spoof_on = 1;
        } else if (!c.status_spoof && status_spoof_on) {
            status_spoof_umount(); status_spoof_on = 0;
        }
        /* 解除亮屏充电限制（OPPO cool_down + MI 温度调流） */
        if (c.chg_unlock && !chg_unlock_on) {
            chg_unlock_on = 1;
        } else if (!c.chg_unlock && chg_unlock_on) {
            unlock_chg_off(); chg_unlock_on = 0;
        }

        /* 服务关闭 */
        if (!c.svc_enabled) {
            write_temp(0);
            if (bypass_on)    { bypass_charge_off(); bypass_on = 0; }
            if (curr_lim_on)  { curr_limit_off();    curr_lim_on = 0; }
            if (mmi_on)       { mmi_bypass_off();    mmi_on = 0; }
            if (plc_on)       { plc_charge_off(g_moddir); plc_on = 0; }
            if (comp_on)      {
                system("setprop persist.sys.oplus.wifi.sla.game_high_temperature 0 2>/dev/null");
                system("setprop ro.oplus.audio.thermal_control 1 2>/dev/null");
                comp_on = 0;
            }
            if (cap_spoof_on)    { cap_spoof_umount();    cap_spoof_on = 0; }
            if (temp_spoof_on)   { temp_spoof_umount();   temp_spoof_on = 0; }
            if (status_spoof_on) { status_spoof_umount(); status_spoof_on = 0; }
            if (chg_unlock_on)   { unlock_chg_off();      chg_unlock_on = 0; }
            system("dumpsys battery reset");
            last_state = 0;
            sleep(8);
            continue;
        }

        int chg = is_charging();

        /* ── MI伪旁路充电（全局，不依赖充电状态） ── */
        if (c.bypass_charge && !bypass_on) {
            bypass_charge_on(); bypass_on = 1;
        } else if (!c.bypass_charge && bypass_on) {
            bypass_charge_off(); bypass_on = 0;
        }

        /* ── oplus mmi 旁路（全局） ── */
        if (c.mmi_bypass && !mmi_on) {
            mmi_bypass_on();  mmi_on = 1;
        } else if (!c.mmi_bypass && mmi_on) {
            mmi_bypass_off(); mmi_on = 0;
        }

        /* ── 全场景伪Osys旁路充电特性注入 ── */
        if (c.plc_charge && !plc_on) {
            plc_charge_on(g_moddir);  plc_on = 1;
        } else if (!c.plc_charge && plc_on) {
            plc_charge_off(g_moddir); plc_on = 0;
        }

        /* ── 组件控制 ── */
        if (c.oplus_comp && !comp_on) {
            system("setprop persist.sys.oplus.wifi.sla.game_high_temperature 1 2>/dev/null");
            system("setprop ro.oplus.audio.thermal_control 0 2>/dev/null");
            comp_on = 1;
        } else if (!c.oplus_comp && comp_on) {
            system("setprop persist.sys.oplus.wifi.sla.game_high_temperature 0 2>/dev/null");
            system("setprop ro.oplus.audio.thermal_control 1 2>/dev/null");
            comp_on = 0;
        }

        /* ── 充电电流限制（全局） ── */
        if (c.curr_limit && !curr_lim_on) {
            curr_limit_apply(c.curr_max_ma); curr_lim_on = 1; last_curr_ma = c.curr_max_ma;
        } else if (c.curr_limit && curr_lim_on && c.curr_max_ma != last_curr_ma) {
            curr_limit_apply(c.curr_max_ma); last_curr_ma = c.curr_max_ma;
        } else if (!c.curr_limit && curr_lim_on) {
            curr_limit_off(); curr_lim_on = 0; last_curr_ma = 0;
        }

        if (chg) {
            if (last_state != 1) {
                last_state = 1;
                /* 用 execv 直接发通知，避免 shell 多层转义 */
                pid_t pid = fork();
                if (pid == 0) {
                    /* 子进程：切换到 uid 2000 发通知 */
                    setuid(2000);
                    char msg[128];
                    snprintf(msg, sizeof(msg),
                        "当前伪装温度: %d°C | 温度伪装正在运行", c.target_temp);
                    char *argv_n[] = {
                        "/system/bin/cmd", "notification", "post",
                        "-S", "messaging",
                        "--conversation", "Fresh-Battery",
                        "--message", msg,
                        "Fresh-Battery",
                        NULL
                    };
                    execv("/system/bin/cmd", argv_n);
                    _exit(1);
                }
                /* 父进程非阻塞等待，避免僵尸进程 */
                if (pid > 0) waitpid(pid, NULL, WNOHANG);
            }

            write_temp(c.target_temp);

            /* ── 解除亮屏充电限制（充电中生效） ── */
            if (chg_unlock_on) {
                unlock_chg_on();
                /* MI 系：温度调流 */
                if (access(MI_CHG_CURR, F_OK) == 0) {
                    int bt = read_batt_temp();
                    if (bt >= 0) mi_chg_set(bt);
                }
            }
            sleep(3);

        } else {
            if (last_state != 2) {
                system("dumpsys battery reset");
                last_state = 2;
            }
            int rt = rd_int(REAL_TEMP);
            if (rt >= 0) write_temp(rt / 10);
            sleep(8);
        }

        tick++;
        if (tick % 10 == 0) {
            /* 定期重写 shell-temp，防止系统覆盖 */
            if (chg) write_temp(c.target_temp);
        }
    }
    return 0;
}