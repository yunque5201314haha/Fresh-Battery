# FreshBattery

Android 电池伪装 / 充电控制的 Magisk / KernelSU 模块。

<p align="left">
  <img src="https://img.shields.io/badge/Magisk-支持-00BFA5?style=flat-square&logo=magisk">
  <img src="https://img.shields.io/badge/KernelSU-支持-009688?style=flat-square">
  <img src="https://img.shields.io/badge/APatch-支持-F5A623?style=flat-square">
</p>

---

## 功能

| 功能 | 说明 |
|------|------|
| 电量伪装 | 伪装电池容量百分比，滑块可调 0%~100% |
| 电池温度伪装 | 伪装电池温度传感器返回值，屏蔽温控降频 |
| 充电循环次数伪装 | 伪装电池循环计数，滑块可调 0~9999 |
| 充放状态伪装 | 将充电状态伪装为「未充电」 |
| 解除亮屏充电限制 | 充电时解除屏幕亮起导致的电流限制 |

### 充电控制

**小米 / 红米 / POCO：**

| 功能 | 说明 |
|------|------|
| MI 伪旁路充电 | 全局限制充电电流至 500mA |
| 充电调速 | 限制最大充电电流（500mA ~ 22000mA） |

**OPPO / 一加 / 真我：**

| 功能 | 说明 |
|------|------|
| O 伪旁路充电 | 基础旁路方案 |
| 全场景伪 Osys 旁路充电 | 系统级方案，注入 PLC 特性声明 |
| 快充伪插拔 | 解除充电头计时器限制，可调间隔与电量阈值 |
| CPU 频率解锁 | 解除游戏 / 温控 CPU 频率限制 |
| 温度墙调节 | 目标温度 30°C ~ 38°C 滑块 + 预设 |
| 组件控制 | WiFi 游戏高温加速、音频热控策略管理 |

### 充电开启模式

所有伪装和充电控制功能均支持 **充电开启** 模式——只在充电时启用，非充电时自动停用。

---

## 工作原理

模块通过 **mount --bind** 将伪装文件绑定挂载到系统 sysfs 节点，拦截电池传感器返回值。

核心组件：
- **MAIN 守护进程**（C）— 监控配置文件变更，管理 mount/umount，处理充电状态检测
- **WebUI** — KernelSU WebView 内嵌的 Web 界面，提供可视化配置
- **配置文件** — `/data/adb/modules/Fresh-Battery/config`，键值对格式

---

## 安装要求

- Android 设备已 Root
- 已安装 Magisk（≥24.0）或 KernelSU 或 APatch
- KernelSU 用户需使用 KernelSU Manager 的 WebView 打开 WebUI

---

## 安装

1. 从 [更新网盘](https://1817712916.share.123pan.cn/123pan/pk6Tjv-IPUuv) 下载最新模块包
2. 在 Magisk / KernelSU / APatch 管理器中刷入
3. 重启设备
4. 在 KernelSU Manager 中进入模块详情，点击「启动 WebUI」
5. 按需配置各项功能

---

## 配置文件

路径：`/data/adb/modules/Fresh-Battery/config`

```
目标温度=34
服务开关=0
循环伪装=0
CPU频率解锁=0
电量挂载=0
MI伪旁路充电=0
电流限制=0
最大电流=22000
O伪旁路充电=0
伪插拔间隔=0
伪插拔电量=80
伪Osys旁路充电=0
组件控制=0
```

更多配置项通过 WebUI 操作后自动生成。

---

## 卸载

在 Magisk / KernelSU 管理器中直接卸载模块，卸载脚本会自动 umount 所有绑定的 sysfs 节点。

---

## 鸣谢

- **阮mumu** — CoolAPK
- **她说好了** — CoolAPK
- **bybycode** — CoolAPK
- **Metahybird** — 底栏作业参考
- **KernelSU** — WebUI / MUI 颜色系统

---

## 免责声明

- 本模块作者不承担任何使用带来的后果
- 过度修改电池参数可能导致设备异常

---

<p align="center">
  <a href="https://www.coolapk.com/u/38698278">作者：石板上回荡的</a>
</p>
