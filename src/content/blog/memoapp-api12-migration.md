---
title: 'MemoApp API 12 迁移：6 项审查修复 + 4 个残留清理'
description: 'HarmonyOS API 12 破坏性变更导致的编译错误修复，附代码审查死代码清理和残留 bug 排查全记录。'
pubDate: 2026-07-31
tags: ['鸿蒙', 'ArkTS', 'MemoApp', 'Debug', 'API 迁移']
draft: false
---

## 背景

MemoApp（好记）是去年写的一个鸿蒙备忘录应用。最近升级到 API 12 后编译不过，加上一份代码审查报告提了 11 项问题，今天逐一修复。

涉及文件：`NotificationService.ets`、`ReminderAgentAbility.ets`、`IndexPage.ets`、`MemoList.ets`、`ForegroundChecker.ets`、`StorageService.ets`、`Constants.ets`、`module.json5`。

---

## 第一部分：API 12 编译错误（3 个）

### 错误 1：`addSlot` 签名变更

```
ArkTS Compiler Error 10505001:
Argument of type '{ name: string; description: string; }'
is not assignable to parameter of type 'AsyncCallback<void, void>'
```

旧 API 接受 `(SlotType, config)` 两个参数；API 12 只接受 `SlotType`。

```typescript
// ❌ API 11 写法
await notificationManager.addSlot(
  notificationManager.SlotType.SOCIAL_COMMUNICATION,
  { name: '提醒通知', description: '备忘录提醒通知' }
);

// ✅ API 12 写法
await notificationManager.addSlot(
  notificationManager.SlotType.SOCIAL_COMMUNICATION
);
```

### 错误 2 & 3：`ReminderAgentAbility` 基类移除

```
Property 'ReminderAgentAbility' does not exist on type 'typeof reminderAgentManager'
Property 'context' does not exist on type 'ReminderAgentAbility'
```

API 12 彻底移除了 `reminderAgentManager.ReminderAgentAbility` 类。此前 `module.json5` 的 `extensionAbilities` 类型 `"reminderAgent"` 也不复存在。

**修复**：删除整个 `ReminderAgentAbility.ets` 文件 + 移除 `module.json5` 中 `extensionAbilities` 配置块。

**影响评估**：系统闹钟（`publishReminder`）不受影响，通知仍然正常弹出。仅后台"标记已提醒"的清理逻辑移除 —— 前台轮询（`IndexPage.startReminderCheck`）仍会在应用可见时完成清理，实际体验无影响。

---

## 第二部分：代码审查修复（#1 ~ #6）

| # | 问题 | 根因 | 修复 | 删行 |
|:---|:---|:---|:---|:---|
| 1 | `ForegroundChecker.getContext()` | 方法无外部调用 | 删除死方法 | 4 |
| 2 | `NotificationService.hasActiveReminders()` | 同上 | 删除死方法 | 10 |
| 3 | `StorageService.getMemoCount()` | 同上 | 删除死方法 | 5 |
| 4 | `ASK_IS_DARK_MODE` + 暗色常量 | 未实现暗色模式 | 删除 7 个常量 | 8 |
| 5 | `onEdit` 回调链路中断 | MemoList 接收但未转发给 MemoCard | 删除整个 onEdit 链路 | 16 |
| 6 | 首次重复 `loadData` | `aboutToAppear` + `onPageShow` 都调用 | 加 `firstLoad` 标记跳过首次 | +5 |

### #5 详解：onEdit 死链路

```
IndexPage.onEdit() ← 定义
    ↓ 传入
MemoList.onEdit    ← 接收但——从未调用！
    ↓ (断裂)
MemoCard           ← 自己内部 router.pushUrl 导航，不依赖回调
```

三个文件各有一段 onEdit 代码，但没有一处真正把这回调串起来。MemoCard 内部直接 `router.pushUrl` 跳编辑页，整个 onEdit 链路是僵尸代码。

### #6 详解：双重加载

HarmonyOS 页面生命周期：`aboutToAppear` → `build` → `onPageShow`。两个钩子里都写了 `loadData()`：

```typescript
aboutToAppear(): void {
  this.loadData();  // 第一次
}

onPageShow(): void {
  this.loadData();  // 第二次（aboutToAppear 刚跑完）
}
```

修复：加 `private firstLoad: boolean = true`，首次 `onPageShow` 跳过。

---

## 第三部分：修复后自查（4 个残留）

刚修完编译通过，顺手再扫了一遍：

| Bug | 问题 | 根因 |
|:--|:--|:--|
| 1 | `ForegroundChecker.setContext()` 写了个无人读取的变量 | 删 `getContext()` 后 `_context` 彻底无读者 |
| 2 | `saveReminderRecord` / `deleteReminderRecord` 继续写 `reminder_records` | ReminderAgentAbility 已删除，无消费者 |
| 3 | `IndexPage` 导入未用常量 `BP_SM_MAX` / `BP_MD_MAX` | 断点检测用的是本地常量 |
| 4 | `ForegroundChecker` 注释过时 | 仍写"通过 getContext() 获取"，但方法已删 |

全部清理，额外再删 **65 行**。

---

## 汇总

```
总计删除: 120+ 行死代码
修改文件: 8 个
编译错误: 3 → 0
审查项:   #1~#6 全部通过
```

核心教训：

1. **API 版本迁移先查 changelog** — 不用等编译报错才意识到 `ReminderAgentAbility` 整个类没了
2. **删了消费者就把生产者也删干净** — `saveReminderRecord` 这种死写是典型的"删一半"
3. **回调链路要端到端验证** — `IndexPage → MemoList → MemoCard` 三段式回调，中间一段没接线就全废
4. **生命周期钩子别重复做事** — `aboutToAppear` 和 `onPageShow` 先后触发，容易写出双重逻辑
