/*
 * log.c — FreshBattery 日志文件写入
 * 仅写文件，logcat 输出由独立进程 frlog 负责
 */

#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <time.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>

#define PLEN         512
#define LOG_MAX_BYTES (100 * 1024)

static char g_log[PLEN];

void log_init(const char *moddir) {
    snprintf(g_log, sizeof(g_log), "%s/log", moddir);
}

static void log_rotate(void) {
    struct stat st;
    if (stat(g_log, &st) != 0) return;
    if (st.st_size < LOG_MAX_BYTES) return;
    int fd = open(g_log, O_RDONLY | O_CLOEXEC);
    if (fd < 0) return;
    char buf[4096];
    off_t skip = st.st_size - LOG_MAX_BYTES / 2;
    if (skip > 0) lseek(fd, skip, SEEK_SET);
    int n = read(fd, buf, sizeof(buf));
    close(fd);
    if (n <= 0) return;
    fd = open(g_log, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd < 0) return;
    const char *cut = memchr(buf, '\n', n);
    if (cut) { int off = cut - buf + 1; write(fd, cut + 1, n - off); }
    else     { write(fd, buf, n); }
    close(fd);
}

void fb_log(const char *tag, const char *fmt, ...) {
    if (!g_log[0]) return;
    char msg[256];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(msg, sizeof(msg), fmt, ap);
    va_end(ap);

    log_rotate();
    int fd = open(g_log, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
    if (fd < 0) return;
    time_t now = time(NULL);
    struct tm *tm = localtime(&now);
    char line[384];
    int len = snprintf(line, sizeof(line), "%02d-%02d %02d:%02d:%02d [%s] %s\n",
        tm->tm_mon + 1, tm->tm_mday, tm->tm_hour, tm->tm_min, tm->tm_sec,
        tag, msg);
    write(fd, line, len);
    close(fd);
}
