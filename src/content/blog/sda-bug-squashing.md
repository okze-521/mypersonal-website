---
title: 'Smart Doc Analyzer 代码审查：一次揪出 10 个隐藏 Bug'
description: '系统性审查 Smart Doc Analyzer 代码库，发现并修复 10 个隐藏问题——从 AttributeError 崩溃到数据库连接泄漏，一次代码审查的全过程复盘。'
pubDate: 2026-07-30
tags: ['SDA', '代码审查', 'Bug修复', 'Python', 'FastAPI']
draft: false
---

## 为什么要做这次审查？

Smart Doc Analyzer（SDA）基础版运行一段时间了——文档上传、向量检索、RAG 问答都能跑通。但"能跑通"不等于"没问题"。很多 Bug 藏在边界条件里，平时不触发，一旦踩到就是 500。

周日花了半天时间，对全部源码做了一次系统性审查。结果：10 个隐藏问题，按严重程度分三级——

| 级别 | 数量 | 后果 |
|:---|:---:|:---|
| 🔴 CRITICAL | 3 | 运行时必崩溃 |
| 🟡 MEDIUM | 3 | 逻辑错误但侥幸没坏 |
| 🟢 LOW | 4 | 代码规范 / 潜在风险 |

下面逐个复盘。

---

## 🔴 CRITICAL：运行时必崩溃

### #1 错误恢复逻辑用 pop() 删错消息

**文件**：`chat.html`

**症状**：用户发送问题 → API 调用失败 → catch 块执行 `conversationHistory.pop()` 恢复历史——但 pop() 删的是数组最后一个元素，如果恢复时数组已经被其他操作修改，会删掉不该删的消息。

**修复**：push 之前记录长度，恢复时直接设回：

```js
// ❌ 之前
conversationHistory.push({ role: 'user', content: question });
// ... API 调用失败 ...
conversationHistory.pop();  // 删的是最后一个，可能不对

// ✅ 之后
const historyLenBefore = conversationHistory.length;
conversationHistory.push({ role: 'user', content: question });
// ... API 调用失败 ...
conversationHistory.length = historyLenBefore;  // 精确回退
```

---

### #2 Document 模型缺少 content 字段

**文件**：`src/models/document.py`、`src/api/analysis.py`

**症状**：文档对比和分类接口访问 `doc.content`，但 Document 表根本没有这一列——文本解析后只存入 Qdrant 向量库，从未落 SQLite。调用即抛 `AttributeError`。

**修复**：三点联动——

1. **模型加字段**：`content = Column(Text, default="")`
2. **入库时保存**：`IngestService.ingest()` 返回值增加 `full_text`
3. **上传时落库**：`repo.update_metadata(..., content=result["full_text"])`

加上 SQLite `ALTER TABLE` 给已有数据库补列。修复后新上传的文档自动有全文，分类接口正常返回。

---

### #3 注册接口允许空 email，但数据库不允许 NULL

**文件**：`src/api/auth.py`、`src/models/user.py`

**症状**：`RegisterRequest.email` 类型标注 `str | None = None`（可选），但 `User.email` 是 `Column(String(100), nullable=False)`。不传 email 注册 → Pydantic 放行 → SQLite 报 `IntegrityError`。

**修复**：一行——

```python
# ❌ 之前
email: str | None = None

# ✅ 之后
email: str = Field(..., max_length=100)
```

Pydantic 自动校验必填，不会再把 None 送给数据库。

---

## 🟡 MEDIUM：逻辑 / 类型错误

### #4 分页 total 统计错误

**文件**：`src/api/rag.py`

**症状**：文档列表接口返回 `total=len(items)` —— `items` 是当前页数据（最多 20 条），而非数据库全部文档数。前端分页器会以为只有 20 个文档，翻不了页。

**修复**：加 `DocumentRepository.count_all()` 方法，分页改用真实总数：

```python
# ❌ 之前
return DocumentListResponse(total=len(items), ...)

# ✅ 之后
return DocumentListResponse(total=repo.count_all(), ...)
```

---

### #5 QdrantStore.upsert() 类型签名不匹配

**文件**：`src/core/qdrant_store.py`

**症状**：`upsert(point_id: str)` 声明接受 `str`，但调用方 `_make_point_id()` 返回的是 `int`（MD5 hash 取模）。Qdrant 底层接受 `int | str | UUID`，运行时没出错，但 IDE/类型检查器报错。

**修复**：类型标注对齐实际调用——

```python
# ❌ 之前
def upsert(self, point_id: str, ...) -> str:

# ✅ 之后
def upsert(self, point_id: int, ...) -> int:
```

---

### #6 LLMClient 路由方法返回类型造假

**文件**：`src/core/llm_client.py`

**症状**：`_primary_chat()` 标注返回 `str`，但内部调用的 `_ollama_chat` / `_deepseek_chat` 都是 `async def`，实际返回协程对象。调用方用了 `await`，运行时正确，但类型欺骗了静态分析。

**修复**：改为正确的 `async def` + `await`：

```python
# ❌ 之前
def _primary_chat(self, ...) -> str:
    return self._ollama_chat(...)  # 返回 Coroutine，不是 str

# ✅ 之后
async def _primary_chat(self, ...) -> str:
    return await self._ollama_chat(...)  # 真正返回 str
```

`_primary_chat_stream` 同理，改为 `async def` + `async for ... yield`。

---

## 🟢 LOW：规范 / 潜在风险

### #7 datetime.utcnow() 已废弃

**文件**：`auth.py`、`audit.py`、`user.py`、`document.py`（共 4 处）

Python 3.12+ 中 `datetime.utcnow()` 标记为 deprecated，返回无时区的 naive datetime。

**修复**：全局替换为 `datetime.now(tz=timezone.utc)` /

---

### #8 句子拼接缺少空格

**文件**：`src/core/chunker.py`

`_merge_sentences()` 中 `current += sentence` 直接将两句首尾相接：`"Hello." + "World."` → `"Hello.World."`。缺少空格会影响 embedding 向量质量，降低检索精度。

**修复**：`current += " " + sentence`

---

### #9 doc_id 为 None 时 payload 不写，无法清理

**文件**：`src/core/ingest_service.py`

原来只有 `doc_id is not None` 时才写入 payload。虽然当前上传接口总是传了 doc_id，但 API 设计上这是个隐患——如果哪天不传，`delete_by_doc_id()` 就找不到这些向量点。

**修复**：无条件写入 `"doc_id": doc_id`

---

### #10 分类端点手动创建 Session 绕过依赖注入

**文件**：`src/api/analysis.py`

`classify_document` 端点自己 `SessionLocal()` 创建 session，而 `compare_documents` 用的却是标准的 `Depends(get_db)`。风格不一致，且绕过了 FastAPI 统一的 session 生命周期管理。

**修复**：改为 `db: Session = Depends(get_db)`，移除手动 `SessionLocal()` 和 `db.close()`。

---

## 修复统计

| 维度 | 数据 |
|:---|:---|
| 涉及文件 | **15 个** |
| 修复 Bug 数 | **10 个** |
| 🔴 会崩的 | 3 个 |
| 🟡 逻辑 / 类型错误 | 3 个 |
| 🟢 规范 / 潜在风险 | 4 个 |
| 耗时 | 约 3 小时 |

## 几条教训

1. **"能跑" ≠ "没问题"**——3 个 CRITICAL 问题都是在特定路径才会触发（analysis 接口没人调、注册接口 Basic 版不用、前端错误很少发生）。但它们就安静地躺在那里，等着某天爆炸。

2. **类型标注不是说谎用的**——`def foo() -> str` 但返回的是协程，IDE 和 mypy 的警告就是在告诉你：这里有问题。标注应该反映真相。

3. **Session 管理要统一**——一个项目里有的端点用 DI、有的自己 new Session，混乱不说，出问题时排查方向都不一样。

4. **SQLAlchemy 不会自动迁移**——加字段后要记得 `ALTER TABLE`，或者开发阶段直接用 `create_all` + drop 重建。

---

下一步计划：给 SDA 加自动化测试覆盖这些边界条件，防止修复后再被改坏。
