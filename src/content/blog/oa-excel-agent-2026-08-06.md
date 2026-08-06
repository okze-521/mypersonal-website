---
title: '从零构建 Excel 智能分析 Agent — 12 工具 + 三模式大脑'
description: '如何把 mini-agent 教学示例演进为生产级 Agent 应用：循环骨架、工具注册、三模大脑、错误自纠正。'
pubDate: 2026-08-06
tags: ['AI Agent', 'FastAPI', 'Pandas', 'Function Calling', 'Ollama']
draft: false
---

上周学了 Agent "while 循环"的原理后，动手做了一个真正可用的 Agent 应用——**上传 Excel，用中文提问，Agent 自动调用分析工具算给你看**。

## 它是什么

一个完整的 AI Agent 应用，不是 Demo：

```
用户上传 Excel → Agent 看到表结构 → 用户自然语言提问
  → Agent 决定调哪些工具 → 执行 → 看结果够不够
    → 不够就换工具再查 → 够了就生成结论
```

## 架构四层

| 层 | 文件 | 职责 |
|:--|:--|:--|
| 大脑层 | `brain.py` | 三模式工厂：云端 API / 本地 Ollama / 离线规则 |
| 工具层 | `tools.py` | 12 个分析工具 + 双注册表（TOOLS + TOOL_SCHEMAS） |
| 循环层 | `agent.py` | Agent 主循环：tool_call → 执行 → 结果回喂 |
| 服务层 | `main.py` | FastAPI HTTP 接口 + Web 前端 |

### 大脑层：一个函数切换三种模式

```python
def get_brain():
    if provider == "cloud":   return CloudBrain(api_key)
    if provider == "ollama":  return OllamaBrain(base_url)
    return MockBrain()  # 离线规则模式，无需 API Key
```

### 工具层：三步加一个新工具

加一个分析工具只需三步，缺一不可：

```python
# 1. 写函数
def top_share(column: str, top_n: int = 3) -> dict:
    ...

# 2. 登记进注册表（Agent 用它把"模型说的工具名"翻译成"真正的函数"）
TOOLS["top_share"] = top_share

# 3. 写说明书（模型靠它决定何时调用、参数怎么填）
TOOL_SCHEMAS.append({"type": "function", "function": {
    "name": "top_share",
    "description": "计算某字段 TOP N 行在总量中的占比",
    "parameters": {...}
}})
```

### Agent 循环：P0.2 错误自纠正

核心设计——工具执行出错时不崩溃，而是把错误信息喂回 LLM 让它自己改：

```python
try:
    result = TOOLS[name](**args)
except AppError as exc:
    # 字段不存在？detail 里带可用字段列表，让 LLM 看到后自己改
    return {"ok": False, "error": {"code": exc.code, "detail": exc.detail}}
```

模型拿到 `"字段 '销售额' 不存在，可用字段：[金额, 数量]..."`，下一轮自动改用正确字段名。

## 12 个分析工具

| 工具 | 能力 |
|:--|:--|
| `filter_rows` | 多条件筛选（支持 =, >, contains, between, in, is_null 等） |
| `sort_rows` | 排序取 TOP N |
| `aggregate` | 整表统计（求和/均值/极值/计数） |
| `group_aggregate` | 分组聚合（"各部门销售额合计"） |
| `pivot_table` | 透视汇总（"各地区×各月份"） |
| `value_counts` | 频次分布 |
| `describe_columns` | 描述性统计（分位数） |
| `check_missing` | 缺失值检查 |
| `check_outliers` | 异常值检测（IQR / Z-score） |
| `calculate` | 简单算术 |
| `list_sheets` | 列出工作表 |
| `preview_rows` | 预览数据行 |

## 工程细节

- **字段名容错**：模型写"销售额"但列名是"销售额（万元）"→ 自动模糊匹配纠正
- **类型推断**：千分位金额、百分比、日期自动还原
- **重复调用检测**：模型死循环调同一个工具时，系统强制它收尾
- **预算管理**：接近调用上限时注入提示，让模型在最后一轮必须给结论
- **Token 统计**：逐次调用的 token 明细 + 费用估算
- **53 项自动化测试**：离线冒烟 35 项 + 接口测试 18 项

## 为什么值得写

这不是又一个调 API 的 Demo。它是一个**理解 Agent 原理后、从骨架开始手写循环**的工程——没有用 LangChain Agent、没有用现成框架。每一行工具注册、每一次错误回喂、每一轮工具调用和结果拼接，都是按 Agent "while 循环"原理念手写的。

理解了它，就理解了所有 Agent 框架（LangChain、AutoGen、CrewAI）背后在做什么。
