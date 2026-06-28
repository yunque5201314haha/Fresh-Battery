/*
 * gcc -O2 -o MAIN main.c log.c -lpthread
 */

#include <stdio.h>
#include <stdlib.h>
#include "log.h"
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
static const char *TEMP_NODES[] = {
    "/sys/class/power_supply/battery/temp",
    "/sys/class/oplus_chg/battery/temp",
    "/sys/class/oplus_chg/battery/batt_temp",
    "/sys/class/oplus_chg/battery/temp_level",
    "/sys/devices/platform/soc/soc:oplus,mms_gauge/oplus_mms/gauge/battery/temp",
    NULL
};
#define CAP_TARGET  "/sys/class/power_supply/battery/capacity"
#define NORM_COOLDOWN  "/sys/class/oplus_chg/battery/normal_cool_down"
#define COOLDOWN       "/sys/class/oplus_chg/battery/cool_down"

#define BYPASS_CURR_UA  500000
#define MI_CHG_CURR     "/sys/class/power_supply/battery/constant_charge_current"

#define MODDIR_DEF   "/data/adb/modules/Fresh-Battery"
#define PLEN         512

static char g_moddir[PLEN];
static char g_cfg[PLEN];
static char g_pids[PLEN];
static char g_fake_cc[PLEN];
static char g_fake_soc[PLEN];
static char g_fake_cap[PLEN];
static char g_fake_temp[PLEN];

typedef struct {
    int target_temp;
    int svc_enabled;
    int cc_spoof;
    int cpu_unlock;
    int cap_mount;
    int bypass_charge;
    int curr_limit;
    int curr_max_ma;
    int mmi_bypass;
    int plug_interval;
    int plug_level;
    int plc_charge;
    int oplus_comp;
    int chg_gate;
    int cap_spoof;
    int cap_spoof_val;
    int temp_spoof;
    int temp_spoof_val;
    int cc_spoof_val;
    int status_spoof;
    int chg_unlock;
    int cap_spoof_chg;
    int temp_spoof_chg;
    int cc_spoof_chg;
    int status_spoof_chg;
    int chg_unlock_chg;
} Config;

static const Config CFG_DEF = {
    .target_temp = 34,
    .curr_max_ma = 22000,
};

static int rd_int(const char *p) {
    int fd = open(p, O_RDONLY | O_CLOEXEC);
    if (fd < 0) return -1;
    char buf[32] = {0};
    int n = read(fd, buf, 31);
    close(fd);
    if (n <= 0) return -1;
    char *s = buf;
    while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++;
    if (*s == 0 || (!(*s >= '0' && *s <= '9') && *s != '-')) return -1;
    return atoi(s);
}

static void wr_str(const char *p, const char *v) {
    int fd = open(p, O_WRONLY | O_CLOEXEC);
    if (fd < 0) return;
    ssize_t r = write(fd, v, strlen(v));
    (void)r;
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

static int cfg_get(const char *buf, const char *key) {
    char search[64];
    snprintf(search, sizeof(search), "%s", key);
    const char *p = buf;
    size_t klen = strlen(key);
    while ((p = strstr(p, key)) != NULL) {
        if (p != buf && *(p - 1) != '\n') { p++; continue; }
        const char *q = p + klen;
        while (*q == ' ' || *q == '\t') q++;
        if (*q != '=') { p++; continue; }
        q++;
        while (*q == ' ' || *q == '\t') q++;
        return atoi(q);
    }
    return -1;
}

static Config parse_config(void) {
    Config c = CFG_DEF;
    FILE *f = fopen(g_cfg, "r");
    if (!f) return c;
    struct stat st;
    if (fstat(fileno(f), &st) != 0 || st.st_size <= 0 || st.st_size > 4096) { fclose(f); return c; }
    long sz = st.st_size;
    char buf[4097];  /* 栈上分配，避免 malloc 开销 */
    if (fread(buf, 1, sz, f) != (size_t)sz) { fclose(f); return c; }
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
    v = cfg_get(buf, "电量伪装充电");   if (v == 0 || v == 1)     c.cap_spoof_chg    = v;
    v = cfg_get(buf, "温度伪装充电");   if (v == 0 || v == 1)     c.temp_spoof_chg   = v;
    v = cfg_get(buf, "循环伪装充电");   if (v == 0 || v == 1)     c.cc_spoof_chg     = v;
    v = cfg_get(buf, "充放状态充电");   if (v == 0 || v == 1)     c.status_spoof_chg = v;
    v = cfg_get(buf, "亮屏充电充电");   if (v == 0 || v == 1)     c.chg_unlock_chg   = v;
    return c;
}

/* 带 stat 防抖的缓存：mtime 未变直接返回上次结果 */
static pthread_mutex_t cfg_mutex = PTHREAD_MUTEX_INITIALIZER;

static Config parse_config_cached(void) {
    static Config s_cache;
    static time_t s_mtime = 0;
    static int    s_init  = 0;
    struct stat st;
    if (stat(g_cfg, &st) != 0) return s_init ? s_cache : CFG_DEF;
    if (s_init && st.st_mtime == s_mtime) return s_cache;
    pthread_mutex_lock(&cfg_mutex);
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
        "亮屏充电限制=%d\n"
        "电量伪装充电=%d\n"
        "温度伪装充电=%d\n"
        "循环伪装充电=%d\n"
        "充放状态充电=%d\n"
        "亮屏充电充电=%d\n",
        c->target_temp, c->svc_enabled,
        c->cc_spoof, c->cpu_unlock, c->cap_mount,
        c->bypass_charge, c->curr_limit, c->curr_max_ma,
        c->mmi_bypass,
        c->plug_interval, c->plug_level, c->plc_charge,
        c->oplus_comp,
        c->chg_gate, c->cap_spoof, c->cap_spoof_val,
        c->temp_spoof, c->temp_spoof_val, c->cc_spoof_val,
        c->status_spoof, c->chg_unlock,
        c->cap_spoof_chg, c->temp_spoof_chg, c->cc_spoof_chg,
        c->status_spoof_chg, c->chg_unlock_chg);
    fclose(f);
    rename(tmp, g_cfg);
    chmod(g_cfg, 0666);
}

static void write_temp(int celsius) {
    static int last = -999;
    if (celsius == last) return;
    last = celsius;
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

/* 读取充电状态，返回状态字符串长度，0 表示失败 */
static int read_chg_status(char *buf, int size) {
    int fd = open(CHG_STATUS, O_RDONLY | O_CLOEXEC);
    if (fd < 0) { buf[0] = 0; return 0; }
    int n = read(fd, buf, size - 1);
    close(fd);
    if (n <= 0) { buf[0] = 0; return 0; }
    buf[n] = 0;
    buf[strcspn(buf, "\n")] = 0;
    return n;
}

static int is_charging_status(const char *status) {
    return strcmp(status, "Charging") == 0 || strcmp(status, "Full") == 0;
}

static int is_charging(void) {
    char buf[32];
    read_chg_status(buf, sizeof(buf));
    if (!is_charging_status(buf)) return 0;
    if (rd_int(USB_PRESENT) == 1) return 1;
    if (rd_int(USB_ONLINE)  == 1) return 1;
    if (rd_int(AC_ONLINE)   == 1) return 1;
    return 0;
}

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

static void cpu_limit_off(void) {
    wr_str(CPU_FREQ_LMT, "1\n");
    system("setprop persist.vendor.enable.cpulimit false 2>/dev/null");
}
static void cpu_limit_on(void)  { wr_str(CPU_FREQ_LMT, "0\n"); }

/* 通用电流节点写入 */
static void apply_curr_nodes(int ua) {
    char ua_str[32];
    snprintf(ua_str, sizeof(ua_str), "%d\n", ua);
    for (int i = 0; CURR_NODES[i]; i++)
        if (access(CURR_NODES[i], W_OK) == 0) wr_str(CURR_NODES[i], ua_str);
}

static void apply_votable_curr(int ma) {
    char ma_str[32];
    snprintf(ma_str, sizeof(ma_str), "%d\n", ma);
    for (int i = 0; CURR_VOTABLE_VAL[i]; i++) {
        if (access(CURR_VOTABLE_VAL[i], W_OK)) continue;
        if (access(CURR_VOTABLE_ACT[i], W_OK)) continue;
        wr_str(CURR_VOTABLE_VAL[i], ma_str);
        wr_str(CURR_VOTABLE_ACT[i], "1\n");
    }
}

static void deactivate_votable(void) {
    for (int i = 0; CURR_VOTABLE_ACT[i]; i++)
        if (access(CURR_VOTABLE_ACT[i], W_OK) == 0)
            wr_str(CURR_VOTABLE_ACT[i], "0\n");
}

static void bypass_charge_on(void) {
    apply_curr_nodes(BYPASS_CURR_UA);
    apply_votable_curr(500);
}

static void bypass_charge_off(void) {
    deactivate_votable();
}

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

#define MMI_CHG_ENABLE "/sys/class/oplus_chg/battery/mmi_charging_enable"

static void mmi_bypass_on(void) {
    if (access(MMI_CHG_ENABLE, W_OK) == 0)
        wr_str(MMI_CHG_ENABLE, "0\n");
}

static void mmi_bypass_off(void) {
    if (access(MMI_CHG_ENABLE, W_OK) == 0)
        wr_str(MMI_CHG_ENABLE, "1\n");
}

#define PLC_TARGET "/my_product/etc/extension/com.oplus.app-features.xml"
#define PLC_FEATURES_CONTENT \
    "\t<app_feature name=\"com.oplus.plc_charge.support\">\n" \
    "\t\t<StringList args=\"true\"/>\n" \
    "\t</app_feature>\n" \
    "\t<app_feature name=\"com.oplus.fullscene_plc_charge.support\" args=\"boolean:true\"/>\n" \
    "\t<app_feature name=\"com.oplus.reversecharge\" args=\"boolean:true\"/>"

static int file_contains(const char *path, const char *needle) {
    FILE *f = fopen(path, "r");
    if (!f) return 0;
    char buf[256];
    while (fgets(buf, sizeof(buf), f)) {
        if (strstr(buf, needle)) { fclose(f); return 1; }
    }
    fclose(f);
    return 0;
}

static void plc_charge_on(const char *moddir) {
    if (access(PLC_TARGET, F_OK) != 0) return;
    if (file_contains(PLC_TARGET, "com.oplus.plc_charge.support")) return;

    char feat[PLEN], tmp[PLEN];
    snprintf(feat, sizeof(feat), "%s/fake/plc_feat.txt", moddir);
    snprintf(tmp,  sizeof(tmp),  "%s/fake/plc_features.xml", moddir);
    FILE *f = fopen(feat, "w");
    if (!f) return;
    fputs(PLC_FEATURES_CONTENT, f);
    fclose(f);

    FILE *in = fopen(PLC_TARGET, "r");
    if (!in) return;
    FILE *out = fopen(tmp, "w");
    if (!out) { fclose(in); return; }
    char line[512];
    int inserted = 0;
    while (fgets(line, sizeof(line), in)) {
        if (!inserted && strstr(line, "</extend_features>")) {
            FILE *fi = fopen(feat, "r");
            if (fi) { char fl[256]; while (fgets(fl, sizeof(fl), fi)) fputs(fl, out); fclose(fi); }
            inserted = 1;
        }
        fputs(line, out);
    }
    fclose(in);
    fclose(out);

    if (mount(tmp, PLC_TARGET, NULL, MS_BIND, NULL) == 0) {
        pid_t pid = fork();
        if (pid == 0) { execl("/system/bin/restorecon", "restorecon", PLC_TARGET, (char *)NULL); _exit(1); }
        if (pid > 0) waitpid(pid, NULL, 0);
    }
}

static void plc_charge_off(const char *moddir) {
    umount2(PLC_TARGET, MNT_DETACH);
    char p[PLEN];
    snprintf(p, sizeof(p), "%s/fake/plc_feat.txt",     moddir); unlink(p);
    snprintf(p, sizeof(p), "%s/fake/plc_features.xml", moddir); unlink(p);
}

static void curr_limit_apply(int ma) {
    apply_curr_nodes(ma * 1000);
    apply_votable_curr(ma);
}

static void curr_limit_off(void) {
    deactivate_votable();
}

/* 通用写入伪装文件并挂载 */
static int write_fake_file(const char *path, const char *content, int len) {
    char dir[PLEN];
    snprintf(dir, sizeof(dir), "%s/fake", g_moddir);
    mkdirp(dir);
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0444);
    if (fd < 0) return -1;
    ssize_t w = write(fd, content, len);
    (void)w;
    close(fd);
    return 0;
}

static int bind_mount(const char *src, const char *target) {
    if (access(target, F_OK) != 0) return -1;
    return mount(src, target, NULL, MS_BIND, NULL);
}

static void bind_umount(const char *target) {
    umount2(target, MNT_DETACH);
}

static void cc_mount_val(int val) {
    char buf[32];
    int n = snprintf(buf, sizeof(buf), "%d\n", val);
    write_fake_file(g_fake_cc, buf, n);
    bind_mount(g_fake_cc, CC_NODE1);
    bind_mount(g_fake_cc, CC_NODE2);
}

static void cc_umount(void) {
    bind_umount(CC_NODE1);
    bind_umount(CC_NODE2);
    unlink(g_fake_cc);
}

static void cap_spoof_mount(int val) {
    char buf[32];
    int n = snprintf(buf, sizeof(buf), "%d\n", val);
    write_fake_file(g_fake_cap, buf, n);
    bind_mount(g_fake_cap, CAP_TARGET);
}

static void cap_spoof_umount(void) {
    bind_umount(CAP_TARGET);
    unlink(g_fake_cap);
}

static void temp_spoof_mount(int val) {
    char buf[32];
    int n = snprintf(buf, sizeof(buf), "%d\n", val * 10);
    write_fake_file(g_fake_temp, buf, n);
    for (int i = 0; TEMP_NODES[i]; i++)
        bind_mount(g_fake_temp, TEMP_NODES[i]);
}

static void temp_spoof_umount(void) {
    for (int i = 0; TEMP_NODES[i]; i++)
        bind_umount(TEMP_NODES[i]);
    unlink(g_fake_temp);
}

static void status_spoof_mount(const char *val) {
    char p[PLEN];
    snprintf(p, sizeof(p), "%s/fake/fakestatus", g_moddir);
    char content[64];
    int n = snprintf(content, sizeof(content), "%s\n", val);
    write_fake_file(p, content, n);
    bind_mount(p, CHG_STATUS);
}

static void status_spoof_umount(void) {
    bind_umount(CHG_STATUS);
    char p[PLEN];
    snprintf(p, sizeof(p), "%s/fake/fakestatus", g_moddir);
    unlink(p);
}

static void unlock_chg_on(void) {
    if (access(COOLDOWN, F_OK) == 0) {
        wr_str(NORM_COOLDOWN, "0\n");
        wr_str(COOLDOWN, "0\n");
    }
}
static void unlock_chg_off(void) {}

static void cap_mount(void) {
    mount(CHIP_SOC, BAT_CAP, NULL, MS_BIND, NULL);
}

static void cap_umount(void) {
    umount2(BAT_CAP, MNT_DETACH);
}

static void *thr_chg(void *arg) {
    (void)arg;
    while (access(COOL_DN_ACT, F_OK) != 0) sleep(2);
    char prev[32] = {0};
    int mi_unlocked = 0;
    for (;;) {
        Config c = parse_config_cached();
        char buf[32];
        read_chg_status(buf, sizeof(buf));

        int now_chg  = is_charging_status(buf);
        int was_chg  = is_charging_status(prev);

        if (now_chg && !was_chg) {
            fb_log("CHG", "开始充电 chg_unlock=%d cpu_unlock=%d", c.chg_unlock, c.cpu_unlock);
            if (c.chg_unlock) chg_unlock_on();
            if (c.cpu_unlock) cpu_limit_off();
            if (access(MI_CHG_CURR, F_OK) == 0) {
                mi_chg_unlock();
                mi_unlocked = 1;
                fb_log("CHG", "MI充电电流已解锁");
            }
        } else if (!now_chg && was_chg) {
            fb_log("CHG", "停止充电");
            if (c.chg_unlock) chg_unlock_off();
            if (c.cpu_unlock) cpu_limit_on();
            if (mi_unlocked) {
                mi_chg_restore();
                mi_unlocked = 0;
            }
        }

        if (now_chg && mi_unlocked) {
            int temp = read_batt_temp();
            if (temp >= 0) mi_chg_set(temp);
        }

        strncpy(prev, buf, sizeof(prev) - 1);
        sleep(1);
    }
    return NULL;
}

static void *thr_plug(void *arg) {
    (void)arg;
    time_t s_last = -1;
    int    s_prev_interval = 0;
    for (;;) {
        sleep(10);
        Config c = parse_config_cached();

        int cur_interval = c.plug_interval;
        int was_off = (s_prev_interval == 0);
        s_prev_interval = cur_interval;

        if (c.mmi_bypass || cur_interval <= 0) continue;

        char status[32];
        read_chg_status(status, sizeof(status));
        if (!is_charging_status(status)) continue;

        int soc = rd_int(CHIP_SOC);
        if (soc < 0) soc = rd_int(BAT_CAP);
        if (soc < 0 || soc >= c.plug_level) continue;

        time_t now = time(NULL);
        if (s_last == -1 || was_off) s_last = now;
        if (now - s_last < (time_t)(cur_interval * 60)) continue;
        s_last = now;

        if (access(MMI_CHG_ENABLE, W_OK) == 0) {
            wr_str(MMI_CHG_ENABLE, "0\n");
            wr_str(MMI_CHG_ENABLE, "1\n");
            fb_log("PLUG", "伪插拔触发 SOC=%d%% 间隔=%dmin", soc, cur_interval);
        }
    }
    return NULL;
}

int main(int argc, char *argv[]) {
    signal(SIGCHLD, SIG_IGN);

    strncpy(g_moddir, argc > 1 ? argv[1] : MODDIR_DEF, PLEN - 1);

    snprintf(g_cfg,     sizeof(g_cfg),     "%s/config",         g_moddir);
    snprintf(g_pids,    sizeof(g_pids),    "%s/pids",           g_moddir);
    snprintf(g_fake_cc, sizeof(g_fake_cc), "%s/fake/fakecc",    g_moddir);
    snprintf(g_fake_cap,sizeof(g_fake_cap),"%s/fake/fakecap",   g_moddir);
    snprintf(g_fake_temp,sizeof(g_fake_temp),"%s/fake/faketemp",g_moddir);
    snprintf(g_fake_soc,sizeof(g_fake_soc),"%s/sys/class/oplus_chg/battery/fakesoc", g_moddir);
    log_init(g_moddir);

    int lock_fd = open(g_pids, O_RDWR | O_CREAT, 0644);
    if (lock_fd >= 0 && flock(lock_fd, LOCK_EX | LOCK_NB) < 0) {
        close(lock_fd);
        return 0;
    }

    if (lock_fd >= 0) {
        ftruncate(lock_fd, 0);
        char pid_buf[32];
        snprintf(pid_buf, sizeof(pid_buf), "MAIN %d\n", (int)getpid());
        write(lock_fd, pid_buf, strlen(pid_buf));
    }

    {
        char fake_dir[PLEN];
        snprintf(fake_dir, sizeof(fake_dir), "%s/fake", g_moddir);
        mkdirp(fake_dir);
    }

    /* 智能等待：检测到 config 或 sysfs 节点就绪后缩短延迟 */
    for (int i = 0; i < 6; i++) {
        if (access(g_cfg, F_OK) == 0 && access(REAL_TEMP, F_OK) == 0) break;
        sleep(1);
    }
    sleep(2);

    if (access(g_cfg, F_OK) != 0) write_config(&CFG_DEF);
    chmod(g_cfg, 0666);

    Config c = parse_config();
    fb_log("INIT", "守护进程启动 PID=%d 模块目录=%s", (int)getpid(), g_moddir);
    fb_log("INIT", "服务开关=%d 目标温度=%d 充电开启=%d", c.svc_enabled, c.target_temp, c.chg_gate);

    if (c.cap_mount) cap_mount();
    if (c.cc_spoof)  cc_mount_val(c.cc_spoof_val ? c.cc_spoof_val : 10);
    if (c.cap_spoof)   cap_spoof_mount(c.cap_spoof_val);
    if (c.temp_spoof)  temp_spoof_mount(c.temp_spoof_val);
    if (c.status_spoof) status_spoof_mount("Discharging");

    pthread_t t_chg;
    pthread_create(&t_chg, NULL, thr_chg, NULL);
    pthread_detach(t_chg);

    pthread_t t_plug;
    pthread_create(&t_plug, NULL, thr_plug, NULL);
    pthread_detach(t_plug);

    int last_state      = 0;
    int cc_mounted      = c.cc_spoof;
    int cap_mounted     = c.cap_mount;
    int bypass_on       = 0;
    int curr_lim_on     = 0;
    int last_curr_ma    = 0;
    int mmi_on          = 0;
    int plc_on          = 0;
    int comp_on         = 0;
    int tick            = 0;
    int cap_spoof_on    = c.cap_spoof;
    int temp_spoof_on   = c.temp_spoof;
    int status_spoof_on = c.status_spoof;
    int chg_unlock_on   = c.chg_unlock;

    /* 状态切换宏：简化重复的 if-else 模式 */
    #define TOGGLE(cfg_flag, state, on_fn, off_fn) do { \
        if ((cfg_flag) && !(state)) { on_fn; (state) = 1; } \
        else if (!(cfg_flag) && (state)) { off_fn; (state) = 0; } \
    } while(0)

    for (;;) {
        c = parse_config_cached();

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
            TOGGLE(0, cap_spoof_on, (void)0, cap_spoof_umount());
            TOGGLE(0, temp_spoof_on, (void)0, temp_spoof_umount());
            TOGGLE(0, status_spoof_on, (void)0, status_spoof_umount());
            TOGGLE(0, chg_unlock_on, (void)0, unlock_chg_off());
            system("dumpsys battery reset");
            last_state = 0;
            sleep(8);
            continue;
        }

        int chg = is_charging();

        /* 充电状态变化日志 */
        { static int _prev_chg = -1; if (_prev_chg != chg) {
            fb_log("CHG", "充电状态: %s", chg ? "充电中" : "未充电"); _prev_chg = chg; } }

        /* 伪装功能：充电门控 — 若开启「充电专属」则仅在充电时生效 */
        int spoof_active = !c.chg_gate || chg;
        int gate_cap     = spoof_active && (!c.cap_spoof_chg    || chg);
        int gate_temp    = spoof_active && (!c.temp_spoof_chg   || chg);
        int gate_cc      = spoof_active && (!c.cc_spoof_chg     || chg);
        int gate_status  = spoof_active && (!c.status_spoof_chg || chg);
        int gate_unlock  = spoof_active && (!c.chg_unlock_chg   || chg);

        /* 带日志的 TOGGLE */
        #define LTOGGLE(cfg_flag, state, tag, on_fn, off_fn) do { \
            if ((cfg_flag) && !(state)) { on_fn; (state) = 1; fb_log("TOGGLE", "%s → ON", tag); } \
            else if (!(cfg_flag) && (state)) { off_fn; (state) = 0; fb_log("TOGGLE", "%s → OFF", tag); } \
        } while(0)

        LTOGGLE(c.cc_spoof   && gate_cc,     cc_mounted,    "循环次数伪装", cc_mount_val(c.cc_spoof_val ? c.cc_spoof_val : 10), cc_umount());
        LTOGGLE(c.cap_mount,                 cap_mounted,    "电量挂载",     cap_mount(), cap_umount());
        LTOGGLE(c.cap_spoof  && gate_cap,    cap_spoof_on,  "电量伪装",     cap_spoof_mount(c.cap_spoof_val), cap_spoof_umount());
        LTOGGLE(c.temp_spoof && gate_temp,   temp_spoof_on, "温度伪装",     temp_spoof_mount(c.temp_spoof_val), temp_spoof_umount());
        LTOGGLE(c.status_spoof && gate_status, status_spoof_on, "充放状态伪装", status_spoof_mount("Discharging"), status_spoof_umount());
        LTOGGLE(c.chg_unlock && gate_unlock, chg_unlock_on, "亮屏充电限制", (void)0, unlock_chg_off());

        LTOGGLE(c.bypass_charge, bypass_on, "MI伪旁路充电", bypass_charge_on(), bypass_charge_off());
        LTOGGLE(c.mmi_bypass, mmi_on, "O伪旁路充电", mmi_bypass_on(), mmi_bypass_off());
        LTOGGLE(c.plc_charge, plc_on, "伪Osys旁路充电", plc_charge_on(g_moddir), plc_charge_off(g_moddir));
        TOGGLE(c.oplus_comp, comp_on,
            { system("setprop persist.sys.oplus.wifi.sla.game_high_temperature 1 2>/dev/null");
              system("setprop ro.oplus.audio.thermal_control 0 2>/dev/null"); },
            { system("setprop persist.sys.oplus.wifi.sla.game_high_temperature 0 2>/dev/null");
              system("setprop ro.oplus.audio.thermal_control 1 2>/dev/null"); });

        /* 电流限制：需要检测值变化 */
        if (c.curr_limit) {
            if (!curr_lim_on || c.curr_max_ma != last_curr_ma) {
                curr_limit_apply(c.curr_max_ma);
                curr_lim_on = 1;
                last_curr_ma = c.curr_max_ma;
                fb_log("TOGGLE", "电流限制 → %dmA", c.curr_max_ma);
            }
        } else if (curr_lim_on) {
            curr_limit_off();
            curr_lim_on = 0;
            last_curr_ma = 0;
            fb_log("TOGGLE", "电流限制 → OFF");
        }

        if (chg) {
            if (last_state != 1) {
                last_state = 1;
                pid_t pid = fork();
                if (pid == 0) {
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
                if (pid > 0) waitpid(pid, NULL, WNOHANG);
            }

            write_temp(c.target_temp);

            if (chg_unlock_on) {
                unlock_chg_on();
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
            if (chg) write_temp(c.target_temp);
        }
    }
    return 0;
}
