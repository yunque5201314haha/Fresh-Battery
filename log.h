#ifndef FB_LOG_H
#define FB_LOG_H

void log_init(const char *moddir);
void fb_log(const char *tag, const char *fmt, ...);

#endif
