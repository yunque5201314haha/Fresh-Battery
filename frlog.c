/*
 * frlog.c — FreshBattery 日志守护进程
 * 独立进程，tail 日志文件输出到 logcat
 * gcc -O2 -o frlog frlog.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/stat.h>

#define PLEN 512

int main(int argc, char *argv[]) {
    const char *moddir = argc > 1 ? argv[1] : "/data/adb/modules/Fresh-Battery";
    char logfile[PLEN];
    snprintf(logfile, sizeof(logfile), "%s/log", moddir);

    int fd = open(logfile, O_RDONLY | O_CLOEXEC);
    if (fd < 0) {
        fprintf(stderr, "frlog: cannot open %s\n", logfile);
        return 1;
    }
    lseek(fd, 0, SEEK_END);

    char line[512];
    int pos = 0;

    for (;;) {
        sleep(1);

        /* 检测轮转：文件被截断则重新打开 */
        struct stat st;
        if (stat(logfile, &st) == 0) {
            off_t cur = lseek(fd, 0, SEEK_CUR);
            if (cur > st.st_size) {
                close(fd);
                fd = open(logfile, O_RDONLY | O_CLOEXEC);
                if (fd < 0) { sleep(2); continue; }
                pos = 0;
            }
        }

        /* 读取新增内容 */
        char buf[4096];
        int n;
        while ((n = read(fd, buf, sizeof(buf))) > 0) {
            for (int i = 0; i < n; i++) {
                if (buf[i] == '\n' || pos >= (int)sizeof(line) - 1) {
                    line[pos] = '\0';
                    if (pos > 0) {
                        char cmd[780];
                        snprintf(cmd, sizeof(cmd),
                            "log -t FreshBattery '%s' 2>/dev/null", line);
                        system(cmd);
                    }
                    pos = 0;
                } else {
                    line[pos++] = buf[i];
                }
            }
        }
    }
    return 0;
}
