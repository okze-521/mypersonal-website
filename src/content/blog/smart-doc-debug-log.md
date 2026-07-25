---
title: 'Smart Doc Analyzer 填坑日记：从 6 个 Bug 到 111 个全绿测试'
description: '一次完整的 Docker 全链路调试实录：自动建表、Qdrant 版本兼容、BGE 模型切换、Embedding 维度对齐——四个"小问题"卡了两小时，每一条都是工程教训。'
pubDate: 2026-07-22
tags: ['Docker', 'Qdrant', 'FastAPI', 'RAG', '调试', '工程实践']
draft: false
---

昨天 Smart Doc Analyzer Docker 一键部署看似跑通了，但一用就炸。今天花了两个小时逐层排查，修了四个坑，顺便加了三个增强。过程比结果更有记录价值——将来面试被问"你遇到的最难调试的 Bug 是什么"，这篇文章就是答案。

---

## 症状：启动成功，一用就 500

`docker compose up -d` 正常，`/health` 返回 `{"status":"ok"}`，但：

- `/api/v1/documents` → **500 Internal Server Error**
- 上传文档 → 有时成功有时报错
- 检索接口 → 直接崩

表面看一切正常，实际「启动全部跑通，业务全线崩溃」。

---

## 坑 ①：数据库表不存在

**症状**：`/documents` 端点报 500，日志里 `sqlalchemy.exc.OperationalError: no such table: documents`

**排查**：entrypoint 脚本还没加，容器启动后没执行 `create_all()`。SQLite 是文件型数据库，不会自动建表。

**修复**：创建 `scripts/entrypoint.sh`，启动时自动执行建表，改 Dockerfile 的 ENTRYPOINT：

```bash
#!/bin/bash
python -c "
from src.database import engine, Base
from src.models import User, Document, AuditLog
Base.metadata.create_all(bind=engine)
print('✅ 数据库表已就绪 (users, documents, audit_logs)')
"
exec "$@"
```

**效果**：此后每次 `docker compose up` 都自动建表，不用手动 `python -c "Base.metadata.create_all()"`。

**教训**：Docker 自包含不只是代码打进去——**初始化逻辑也要自包含**。entrypoint 脚本是容器化的标配。

---

## 坑 ②：Qdrant 集合不存在就写入

**症状**：上传文档偶尔 200、偶尔 500。日志显示 `collection 'smart_docs' not found`。

**排查**：手动删了 Qdrant 集合（为切换维度从 1024 到 512），但 `IngestService` 和 `SearchService` 里都没调 `ensure_collection()`。这个方法定义了但从来没被调用过。

**修复**：在 `ingest_service.py` 和 `search_service.py` 的入口都加上：

```python
def ingest(self, file_path: Path) -> dict:
    self.qdrant.ensure_collection()  # ← 加这一行，集合不存在就自动创建
    ...
```

**教训**：定义方法 ≠ 调用方法。抽象写得漂亮但没人用的代码约等于没写。**写完基础设施层的方法，立刻在业务层入口调用它。**

---

## 坑 ③：BGE-M3 2GB 下载导致容器卡死

**症状**：`docker compose up` 后容器一直在下载模型，超时也不报错，服务起不来。

**排查**：默认用的 `BAAI/bge-m3` 2GB+，国内网络下载慢，等待时间超过 Docker 的容忍限度。

**修复**：切换到本地已有的 BGE-small-zh-v1.5（95MB，512 维）：

```yaml
# docker-compose.yml
volumes:
  - ./models/bge-small:/app/models/bge-small:ro
environment:
  - EMBEDDING_MODEL=/app/models/bge-small
  - EMBEDDING_DIM=512
```

**效果**：模型加载从 5 分钟+变为 **1 秒以内**。

**教训**：**深度学习模型不要靠运行时下载**。要么打镜像里，要么挂载本地卷。特别是国内部署——下载 2GB 模型超时不是偶然，是必然。

维度从 1024 降到 512 不影响检索质量（BGE-small 对短文本效果很好），但需要删除重建 Qdrant 集合（维度不匹配会插入失败）。这是一个连锁反应：改模型 → 改维度 → 重建集合 → 忘记自动建集合 → 引出坑②。

---

## 坑 ④：qdrant-client 1.18 与 Qdrant Server 1.8.4 不兼容

这是今天最恶心的 Bug。

**症状**：上传文档成功（200），但检索永远返回 500。日志显示：

```
404 Not Found: collection 'smart_docs/points/query'
```

**排查过程**：

1. Qdrant 集合存在，通过 `/collections/smart_docs` 可以 GET 到
2. 手动查询 `curl` 也能返回数据
3. 但 Python SDK 走的是 `/points/query` 端点 → 404
4. 确认 Qdrant Server 版本 1.8.4 → 没有 `/points/query` 这个端点（那是 1.9+ 才加的）
5. `pip show qdrant-client` → **1.18.0**

**根因**：qdrant-client 1.9 开始废弃了 `search()` 方法，改用 `query_points()`。但 `query_points()` 调的是 Qdrant 1.9+ 的 `/points/query` 端点。Server 1.8.4 根本不认识这个路由。

**修复**：

```toml
# pyproject.toml
- "qdrant-client>=1.9"
+ "qdrant-client>=1.9,<1.12"
```

同时 Dockerfile 里也锁版本：`"qdrant-client>=1.9,<1.12"`

**效果**：降级到 1.11.3，`client.search()` 走 `/points/search` → Server 1.8.4 认得 → 检索正常。

**教训**：**客户端和服务端的主版本差不能超过 1**。和数据库驱动一样（psycopg2 连不了 PostgreSQL 7），向量库也是 C/S 架构。`unlimited` 版本的 pip 依赖在生产环境就是定时炸弹。

---

## 修复前后对照

| 问题 | Before | After |
|------|--------|-------|
| 数据库表 | 启动不建表 → 500 | entrypoint.sh 自动建表 ✅ |
| Qdrant 集合 | 删了就没了 → 写入失败 | `ensure_collection()` 自动创建 ✅ |
| Embedding 模型 | BGE-M3 2GB 下载超时 | BGE-small 95MB 秒加载 ✅ |
| qdrant-client | 1.18 → `/points/query` 404 | 1.11.3 → `/points/search` 正常 ✅ |
| **测试结果** | 105/111 passed | **111/111 passed** ✅ |

---

## 顺手做的三个增强

### 1. 前端 AI 问答

原本的聊天 Tab 只调了检索接口，没有 LLM 生成回答。新增 `/api/v1/documents/qa` 端点，流程：

```
用户提问 → 向量检索(Top-3) → 拼接上下文 → Ollama 35B 生成 → 返回答案+引用来源
```

前端 `chat.html` 里改动就一个 endpoint 名（`/search` → `/qa`）加来源显示，其余不变。

### 2. CI/CD

加了 `.github/workflows/ci.yml` 和 `cd.yml`。每次 `git push` 到 main 分支自动：

```
pytest tests/ → ruff check → docker build → push to ghcr.io
```

面试时候说"我的项目有 CI/CD"比说"我手动跑的测试"高一个档次。

### 3. `.env.example`

之前 `.env` 只有我自己的一人份。加了一个模板文件，别人 clone 下来知道该配什么：

```bash
cp .env.example .env
# 改 SECRET_KEY、DEEPSEEK_API_KEY 等
docker compose up -d
```

---

## 今日收获

1. **"能启动 ≠ 能工作"**。Docker 容器的状态检查要把数据库连接、向量库连通性也放进去，光靠 `/health` ping 是不够的。

2. **锁定版本是运维第一要义**。`>=1.9,<1.12` 不是一个可选项，是必须项。不锁版本的后果是：你今天写测试通过，明天 CI 就红了，后天生产就崩了。

3. **大模型不要运行时下载**。不管是 Embedding 还是 LLM，在 Docker 启动时从 HuggingFace 拉模型就是自找超时。挂载本地卷是最稳的方案。

4. **前端聊天 Tab 只用了几十行 JS**。没有 React、没有 WebSocket、没有中间件——一个 `fetch` 调 `/documents/qa` 就实现了完整问答。过度设计是个人项目的头号敌人。

全文用的工具链：Docker Compose + FastAPI + Qdrant 1.8.4 + Ollama 35B + BGE-small + 纯 HTML/CSS/JS 前端。

> Smart Doc Analyzer 开源在 [GitHub](https://github.com/okze-521/smart-doc-analyzer)，欢迎 star。
