---
title: 'Smart Doc Analyzer：111 条测试驱动的文档分析平台'
description: '从 TDD 开始搭建，FastAPI + SQLite + Qdrant + sentence-transformers，一个纯本地、零 API 费用的智能文档分析工具。'
pubDate: 2026-07-25
tags: ['FastAPI', 'TDD', 'Docker', 'RAG', '文档分析']
draft: false
---

## 为什么要做这个

RAG 平台跑通后，我发现一个问题：它的文档导入太原始了。

上传全靠命令行 `python -m src.ingest docs/`，没有界面、不支持 PDF、不区分文档类型。真正需要分析合同、技术文档、表格数据的场景，它搞不定。

所以决定重新做——这次从 TDD 开始。

---

## 技术栈

| 层 | 技术 | 为什么选它 |
|----|------|----------|
| **Web 框架** | FastAPI | 异步原生支持、自动生成 API 文档 |
| **数据库** | SQLite | 开发阶段零配置，生产再换 PostgreSQL |
| **向量库** | Qdrant (Docker) | 1024 维 BGE-M3 向量，毫秒级检索 |
| **文档解析** | PyMuPDF + python-docx + openpyxl | PDF/DOCX/XLSX 全支持 |
| **Embedding** | sentence-transformers (BGE-M3) | 纯本地加载，不依赖任何外部 API |
| **前端** | 单文件 HTML + 原生 JS | 零构建、零依赖，浏览器直接开 |
| **部署** | Docker Compose | 一键拉起 App + Qdrant |

---

## TDD 驱动的工程纪律

这次最大的不同：**先写测试，再写代码**。

```bash
$ pytest -v
========================= 111 passed in 12.34s =========================
Coverage: 89%
```

### 测试分层

```
tests/
├── test_api/           # API 端点测试
│   ├── test_documents.py   上传、列表、搜索
│   ├── test_rag.py         问答、上下文召回
│   └── test_analysis.py    对比、分类
├── test_core/          # 核心逻辑测试
│   ├── test_llm_client.py  双后端切换 (ollama/deepseek)
│   ├── test_parser.py      PDF/DOCX/XLSX 解析
│   └── test_chunker.py     文档切片策略
└── conftest.py             共享 fixtures
```

### TDD 的好处（这次真切体会到了）

1. **重构不恐惧** — 改了 LLM 客户端构造器签名，跑测试立刻知道哪些地方坏了
2. **边界条件逼你想清楚** — 写测试时就会问自己：空文件怎么办？超大文件怎么办？
3. **代码写对一次就够了** — 不会出现"我以为修好了但其实没修"的情况

---

## 核心功能

### 1. 多格式文档上传

```
POST /api/v1/documents/upload
支持: PDF, DOCX, XLSX, TXT, Markdown
最大: 50MB
返回: 文档 ID + 切片数量
```

文档上传后自动：
- 解析文本（PyMuPDF 提取 PDF、python-docx 提取 Word）
- 智能切片（段落边界切分，保留上下文）
- 向量化入库（BGE-M3 1024 维）

### 2. RAG 检索问答

```
POST /api/v1/rag/chat
{
  "question": "这份合同的有效期到什么时候？",
  "document_ids": ["doc_001", "doc_003"]  // 可选，限定文档范围
}
```

和 RAG 平台同款的 Embed → Search → Rerank 链路，但增加了 **文档范围过滤**——可以只对特定几份文档提问。

### 3. 文档对比分析

```
POST /api/v1/analysis/compare
{
  "doc_a": "doc_001",
  "doc_b": "doc_002"
}
```

对比两篇文档的差异，生成结构化对比报告。典型场景：新老合同条款对比、技术方案 v1 vs v2。

### 4. 文档自动分类

```
POST /api/v1/analysis/classify
{
  "document_id": "doc_005"
}
```

自动识别文档类型（合同、技术文档、简历、发票等），方便批量管理。

---

## 双后端 LLM 设计

```python
class LLMClient:
    def __init__(
        self,
        provider: str = "ollama",           # ollama | deepseek
        ollama_host: str = "http://127.0.0.1:11434",
        deepseek_api_key: str | None = None,
    ):
        ...
```

| 配置 | 默认 | 切换方式 |
|------|------|---------|
| 本地 Ollama | ✅ | `LLM_PROVIDER=ollama` |
| DeepSeek API | 备用 | `LLM_PROVIDER=deepseek` + API Key |

设计原则：**隐私优先，本地默认，云端降级**。

---

## chat.html — 单文件前端

参照 RAG 平台的聊天界面，做了功能更强的版本：

- **三 Tab 切换**：聊天 | 上传 | 文档列表
- **拖拽上传**：支持 PDF/DOCX/XLSX，实时显示切片数
- **来源标注**：回答附带文档引用
- **零依赖**：一个 HTML 文件，无构建步骤，浏览器直接打开

```html
<!-- 就这样，没有 npm install，没有 webpack，没有 200MB node_modules -->
<script>
  const API = 'http://127.0.0.1:9876';
  fetch(`${API}/api/v1/rag/chat`, { ... });
</script>
```

---

## Docker 一键部署

```bash
git clone https://github.com/okze-521/smart-doc-analyzer
cd smart-doc-analyzer
docker compose up -d
```

打开 `http://127.0.0.1:9876` 就能用。

镜像打包过程中踩了一个坑：`Dockerfile` 只 `COPY src/`，忘了 `COPY chat.html`，容器里首页 404。补一行搞定。

---

## 和 RAG Platform 的区别

| 维度 | Smart Doc Analyzer | RAG Platform |
|------|-------------------|--------------|
| **定位** | 文档分析工具 | 知识库平台 |
| **输入** | 任意文档（PDF/DOCX/XLSX） | Markdown 文档 |
| **测试** | 111 tests, 89% 覆盖 | 56 tests |
| **部署** | Docker Compose 自包含 | 依赖 Ollama + Qdrant |
| **LLM** | 双后端自动切换 | 本地 Ollama 优先 |
| **前端** | 功能完整（上传+聊天+列表） | 聊天页 |

---

## 下一步

- 接入 OCR（扫描件 PDF 识别）
- 支持更多文件格式（PPT、图片）
- 前端增加文档对比可视化
- 生产部署：SQLite → PostgreSQL

---

> TDD 不只是测试——它是写代码之前，先想清楚"这个功能到底要干什么"。
>
> 111 条测试不是负担，是 111 条永远不会再犯的低级错。
