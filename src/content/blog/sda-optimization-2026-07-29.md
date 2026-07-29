---
title: 'SDA 深度优化：5 项 Bug 修复 + 功能升级实录'
description: '从引用来源字段不匹配到多轮对话、流式输出、Docker 健康检查——一次系统性优化 SDA 问答体验。'
pubDate: 2026-07-29
tags: ['SDA', 'RAG', 'SSE', 'Docker', 'LLM', '后端', '前端']
draft: false
---

## 背景

上次修完 chat.html 的 6 个渲染 bug 后，排查出一份 7 项优化清单。今天一口气处理了其中 5 项（去掉已存在的删除确认和够用的上传进度），涵盖字段对齐、容器修复、多轮对话、流式输出、健康检查五个维度。

---

## 🐛 Bug 1：引用来源从不显示

### 现象

每次提问后，回答正常，但下方的引用来源片段一直都是空的。

### 根因

后端 `POST /documents/qa` 返回的 JSON 字段名叫 `snippets`（数组），里面的对象字段是 `text` 和 `source`。但前端 `chat.html` 读取的是 `data.references`，以及 `ref.content` 和 `ref.filename`——字段名全都不匹配。

| 数据层 | 后端实际字段 | 前端读取字段 |
|:---|:---|:---|
| 数组名 | `snippets` | `references` |
| 内容字段 | `text` | `content` |
| 来源字段 | `source` | `filename` |

### 修复

三行映射对齐，`data.references` → `data.snippets`，`ref.content` → `ref.text`，`ref.filename` → `ref.source`。

---

## 🐛 Bug 2：容器无法启动（entrypoint.sh 换行符）

### 现象

`docker compose up -d` 后容器不断重启，日志显示 `Restarting (255)`。

### 根因

`scripts/entrypoint.sh` 第一行 `#!/bin/bash` 在 Windows Git 检出时被自动转为 CRLF（`\r\n`），容器内 Linux 看到的是 `#!/bin/bash^M`，找不到解释器。

### 修复

```bash
cat scripts/entrypoint.sh | tr -d '\r' > tmp && mv tmp scripts/entrypoint.sh
```

然后重建镜像（`docker compose up -d --build`），容器正常启动。

教训：Windows 开发环境下，shell 脚本统一用 `.gitattributes` 锁定 LF。

---

## ⚡ 功能 3：多轮对话上下文记忆

### 需求

之前每次提问都是独立的——问完"审批节点有几个"，再问"详细说明一下"，AI 不知道在说什么。

### 方案

保留最近 10 轮对话历史（20 条消息），每次请求时一起发给 LLM。开销极小：多 2500 tokens 左右，在 128K 上下文里只占 2%。

### 实现（4 个文件）

| 文件 | 改动 |
|:---|:---|
| `schemas/api.py` | `SearchRequest` 加 `history: list[dict] | None` |
| `core/llm_client.py` | `generate_with_context` 接收 history，`_build_messages()` 统一拼接 |
| `api/rag.py` | QA 端点传 `req.history` 给 LLM |
| `chat.html` | 维护 `conversationHistory`，请求时 `slice(-20)` 发送，回答后 push，错误时 pop 回滚 |

额外加了 `/reset` 命令——输入框里打 `/reset` 回车即可清空历史，重新开始。

---

## ⚡ 功能 4：流式输出（SSE）

### 需求

替代"等 30 秒 → 一次性出结果"的加载圈体验，改成 ChatGPT 那样逐字冒出来。

### 方案

传统方案：后端等 LLM 返回全部文本 → 打包 JSON → 前端一次性渲染。

流式方案：后端向 Ollama/DeepSeek 请求时设置 `stream: true`，拿到 token 就通过 SSE 推给前端，前端用 `ReadableStream` 逐字追加到 DOM。

```
[前端 fetch] ──────────────────────────────────→ [后端 SSE]
  reader.read() ← data: {"type":"token","content":"审批"}
  reader.read() ← data: {"type":"token","content":"节点"}
  reader.read() ← data: {"type":"token","content":"包含"}
  ...
  reader.read() ← data: [DONE]
  → 渲染完成，展示引用来源
```

### 实现（3 个文件）

| 文件 | 改动 |
|:---|:---|
| `llm_client.py` | 新增 `generate_with_context_stream()`、`_ollama_chat_stream()`、`_deepseek_chat_stream()` |
| `rag.py` | 新增 `POST /documents/qa/stream` SSE 端点，先推 snippets 再逐 token 推 |
| `chat.html` | `ask()` 改用 `fetch` + `reader`，创建空 bot 气泡并用 `textSpan.textContent` 实时追加 |

### 关键技术细节

- **Ollama 流式**：NDJSON 格式，每行一个 `{"message":{"content":"token"}}`
- **DeepSeek 流式**：SSE 格式，`data: {"choices":[{"delta":{"content":"token"}}]}`，以 `data: [DONE]` 结尾
- **前端 buffer 处理**：`TextDecoder` + 行分割，最后一条不完整行保留到下次循环

---

## ⚡ 功能 5：Docker 健康检查

### 需求

`docker ps` 能看到容器到底健康不健康，而不是盲猜"应该跑着吧"。

### 实现

| 服务 | 探测方式 | 端口 |
|:---|:---|:---|
| app | `python -c "import urllib.request; urlopen('http://localhost:8000/health')"` | 8000 |
| qdrant | bash `/dev/tcp` 发 HTTP GET，检查 200 | 6333 |

配置参数：`interval: 30s`、`timeout: 10s`、`retries: 3`、app `start_period: 60s`（留够模型加载时间）。

最终 `docker ps` 输出：

```
smart-doc-analyzer-app-1      Up xx seconds (healthy)
smart-doc-analyzer-qdrant-1   Up xx seconds (healthy)
```

---

## 总结

今天处理的 5 项覆盖了 SDA 的稳定性（容器启动、健康检查）、准确性（引用来源）和体验（多轮对话、流式输出）三个维度。核心改动集中在 `chat.html`、`llm_client.py`、`rag.py` 三个文件。

下一阶段计划：迁至台式机（RTX 5090D 32GB），彻底解决笔记本内存瓶颈。
