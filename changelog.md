# v1.3

UI 全面 Material Design 3 规范化，代码质量大幅提升。

## 新增

- 日志页面：独立 frlog 守护进程，用户可选开关，支持自动刷新
- 状态页 Sparkline Y 轴温度标注
- 品牌检测 5 秒超时提示
- URL 跳转安全白名单校验

## 优化

- **M3 组件规范化**：Button 40dp / Slider 圆形 thumb / Toggle Switch 16→24dp / Segmented Button / Status Chip
- **M3 Typography**：section-label / tile-label / info-list / chg-item 全部对齐 M3 type scale
- **状态页卡片差异化**：SOC 电量环 Filled / 电池数据格 Outlined / PID 进程卡 accent 色条 / 设备信息 Outlined
- 移除所有 HTML 内联事件，改用 data-action + 事件委托
- 路径常量集中管理到 exec.js
- 编译产物移入 bin/ 目录，模块结构更清晰
- 去掉 @material/web CDN，UI 秒开
- 清理 sh 脚本注释，减小体积

## 修复

- 充电门控生效 + thr_chg 守卫 + 服务健壮性

---

# v1.1

C 核心重构，UI 清理，脚本精简。

## 优化

- C 核心代码重构
- 日志模块拆分为独立 log.c / log.h
- WebUI 清理冗余代码
- 脚本精简优化

---

# v1.0

FreshBattery 首个正式版本。

## 新增

- 电量伪装：伪装电池容量百分比，滑块可调 0%~100%
- 电池温度伪装：伪装电池温度传感器返回值，屏蔽温控降频
- 充电循环次数伪装：伪装电池循环计数，滑块可调 0~9999
- 充放状态伪装：将充电状态伪装为「未充电」
- 解除亮屏充电限制：充电时解除屏幕亮起导致的电流限制
- MI 伪旁路充电：小米/红米/POCO 全局限制充电电流至 500mA
- 充电调速：限制最大充电电流（500mA ~ 22000mA）
- O 伪旁路充电：OPPO/一加/真我基础旁路方案
- 全场景伪 Osys 旁路充电：系统级方案，注入 PLC 特性声明
- 快充伪插拔：解除充电头计数器限制，保持快充不掉
- CPU 频率解锁：解除游戏/温控 CPU 频率限制
- 温度墙调节：目标温度 30°C ~ 38°C，带实时仪表盘
- 组件控制：WiFi 游戏高温加速、音频热控策略管理
- 充电开启模式：所有功能支持仅在充电时启用

## 优化

- Material Design 3 动态取色（Monet 主题），跟随系统壁色自适应明暗主题
- WebUI 可视化配置，支持 KernelSU / Magisk / APatch
- 状态页实时显示电池温度、电压、电流、功率、循环次数
- 守护进程基于 C 语言编写，mount --bind 技术实现

## 技术

- CI 自动构建：GitHub Actions 自动编译 MAIN 二进制并打包模块
- 构建完成后自动推送至 Telegram
- 标签推送达 GitHub Releases
