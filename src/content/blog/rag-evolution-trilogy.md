---
title: 'RAG 进化三部曲：一个运维老兵的 AI 实战之路'
description: '从 Ollama 试水到存算分离企业级 RAG 平台，三个项目、半年时间、56 条测试用例，完整记录我的技术转型历程。'
pubDate: 2026-07-19
tags: ['RAG', 'Ollama', 'Qdrant', 'AI', '转型']
draft: false
---

## 起点：为什么一个 OA 运维要去搞 AI？

2025 年初，我还在联想驻场，负责深圳能源 10000+ 用户的 OA 系统运维 — Domino 迁移到 Java、SAP 集成、SQL 调优，标准的传统 IT 运维。

但每次看到 ChatGPT 和本地大模型的新闻，心里就痒痒。一个做了 16 年运维的人，能不能跟上这波 AI 浪潮？

---

## v1：Ollama 试水（2025.12）

**仓库**：[okze-521/local-llm](https://github.com/okze-521/local-llm)

最开始的想法很简单：在台式机（RTX 5090D）上跑个本地大模型。

```bash
ollama pull qwen3.6:35b-a3b
ollama run qwen3.6:35b-a3b
```

装好之后需要有个界面。用 Python Flask 写了个极简 API，前端用 HTML + 原生 JS 做了聊天页 — 一个输入框、一个发送按钮，能对话就行。

### 学到什么

- **MoE 模型的诡异行为**：qwen3.6 是 Mixture of Experts 架构，实际有效上下文远小于标称的 128K，设 4096 才稳
- **Ollama 的坑**：模型推理时显存占用和参数量的关系不是线性的
- **台式机做服务器**：Windows 上稳定运行 Ollama 服务不简单

总结：v1 证明了**本地 LLM 能用**，但只是一个玩具。

---

## v2：LLM Wiki 知识库（2026.06）

**仓库**：[okze-521/ai-knowledge-base](https://github.com/okze-521/ai-knowledge-base)

v1 能聊天了，但没有记忆 — 关了就忘。我想做个能"记住"我的技术文档的 AI 助手。

### 架构升级

```
Markdown 文档 → Obsidian 编辑 → 向量化 → Qdrant 存储 → API 查询 → Ollama 回答
```

核心改进：
- **文档 Pipeline**：Watchdog 监听文件变更，自动切片、向量化、入库
- **Qdrant 向量数据库**：Docker 部署，1024 维 BGE-M3 向量
- **结构化知识管理**：Obsidian 双向链接 + 模板系统

### 踩过的坑

- **Qdrant 版本陷阱**：1.18 的 API 变化很大，`point_id` 必须是 int 而非字符串，`search()` 改名 `query_points()`
- **Embedding 模型选择**：BGE-M3 比 text2vec-large-chinese 效果好得多，但下载是个问题 — huggingface 直连经常断，最终用 ModelScope（7MB/s）解决
- **`context_length` 不能瞎改**：曾试图把 Hermes Agent 的上下文从 128K 降到 8192，直接导致无法启动。血的教训。

总结：v2 证明了**本地知识库可行**，但架构太耦合 — 文档处理、向量存储、LLM 推理全挤在一台机器上。

---

## v3：Personal RAG Platform — 存算分离（2026.07）

**仓库**：[okze-521/personal-rag-platform](https://github.com/okze-521/personal-rag-platform)

v2 的痛点：台式机一关机，整个系统就瘫了。我需要真正的生产级架构。

### 核心设计

```
┌─────────────────────────┐    ┌──────────────────────┐
│   笔记本 (Logic Layer)   │    │   台式机 (Compute)    │
│                         │    │                      │
│  FastAPI 服务            │    │  Ollama              │
│  Qdrant 向量数据库       │───▶│  qwen3.6:35b-a3b     │
│  BGE-M3 Embedding        │    │  (MoE, RTX 5090D)   │
│  BGE-Reranker 精排       │    │                      │
│  Docker 编排             │    │                      │
└─────────────────────────┘    └──────────────────────┘
```

笔记本负责轻量级任务（检索、排序、API 分发），台式机专门做重活（LLM 推理）。

### 关键工程实践

**1. 5 步 RAG 链路**

```
Query → Embed → Search 10 → Rerank 3 → Prompt → LLM
```

最大的改进是加入 Reranker。原始向量检索常把不相关文档排到前面（比如 curl 命令代码排在架构文档前面），Cross-Encoder 重排序后，真正相关的文档从第 2 位跳到了第 1 位，分数从 0.67 跳到 0.94。

**2. 降级容错**

```python
try:
    reranked = self.reranker.rerank(query, hits)
except Exception:
    # Reranker 挂了？降级回原始检索，不中断服务
    reranked = hits[:top_k]
```

Reranker 失败 → 退回原始检索。台式机 Ollama 离线 → 提示用户并记录日志。永远不因为一个组件挂了就让整个系统不可用。

**3. 全链路异步**

```python
async def ainvoke(self, inputs):
    query_vec = self.embedder.embed(query)     # 同步
    hits = self.store.search(query_vec)        # 同步
    reranked = self.reranker.rerank(...)       # 同步（CPU 密集）
    answer = await self.llm.agenerate(prompt)   # 异步（IO 密集）
```

Reranker 和 Embedding 是 CPU 密集型，不需要 async。LLM 调用是网络 IO，必须 async 避免阻塞事件循环。

---

## 进化图谱

| 维度 | v1 试水 | v2 知识库 | v3 平台 |
|------|---------|-----------|---------|
| **定位** | 玩具 | 工具 | 平台 |
| **LLM** | 本地 Ollama | 本地 Ollama | 本地优先 + 云端降级 |
| **存储** | 无 | Qdrant 单机 | Qdrant 存算分离 |
| **检索** | 无 | 向量相似度 | 向量 + Reranker |
| **容错** | 无 | 无 | 多级降级 |
| **测试** | 0 | 0 | 56 tests |
| **部署** | 命令行 | Docker 单机 | Docker Compose |

---

## 三个最重要的教训

### 1. 别动 `context_length`

曾经试图优化 Hermes Agent 的上下文窗口，结果直接起不来了。不是所有配置都值得调 — 尤其是框架内部的默认值，改之前先想清楚后果。

### 2. 文档先于代码

v3 的每个模块都有对应的 `docs/*.md`，记录了为什么这么做、怎么验证、如何回滚。三个月后回来看，没有文档 = 看不懂自己写的代码。

### 3. 隐私不是口号

企业文档上传到云端 API 是红线。即使 DeepSeek API 更方便更稳定，RAG 平台依然默认走本地 Ollama。**技术选型要反映价值观**。

---

## 接下来

Smart Doc Analyzer 已经在路上 — TDD 驱动开发、111 条测试、89% 覆盖率。后续会单独写一篇复盘。

---

> 从 `ollama run` 到 Docker Compose 生产部署，从 0 测试到 56 条用例，从 GUI 思维到命令行思维。
>
> 一个 40 岁的运维老兵，证明转 AI 不是年轻人的专利。
