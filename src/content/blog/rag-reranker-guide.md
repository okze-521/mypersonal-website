---
title: '给 RAG 加个裁判：BGE-Reranker 精排实战'
description: '向量检索不够准？接个 Reranker 二次排序，精度提升立竿见影。从模型下载到 Docker 挂载，20 行代码搞定。'
pubDate: 2026-07-25
tags: ['RAG', 'Reranker', 'BGE', 'Smart Doc Analyzer', '向量检索']
draft: false
---

## 问题

Smart Doc Analyzer 的 RAG 问答跑通了，但有个隐性问题：**向量相似度 ≠ 语义相关性**。

比如搜索"这个系统支持哪些文件格式？"，向量检索 Top-3 的第一条可能是"支持 PDF/DOCX/XLSX 三种格式"——但第二条和第三条可能是"系统架构分为三层"，仅仅因为词频相似被排到了前面。

## 解法：加个裁判

BGE-Reranker-v2-m3 是一个 **Cross-Encoder**，它不靠向量距离，而是把问题和候选文本同时输入模型，输出一个 0~1 的**语义相关性分数**。

```
检索（粗排）         精排（Cross-Encoder）
BGE-small → Top-9    Reranker → Top-3 → LLM
向量相似度           逐对打分：问题 vs 文本
```

### 为什么有效？

| 方式 | 对比方式 | 问题 |
|------|---------|------|
| Bi-Encoder（向量检索） | `向量相似度(q, d)` | 问题和文档**独立编码**，丢失交互信息 |
| Cross-Encoder（Reranker） | `模型(q, d) → 分数` | 问题和文档**一起编码**，判断语义匹配 |

## 实现

### 1. 模型下载（ModelScope）

```bash
pip install modelscope
python -c "
from modelscope import snapshot_download
snapshot_download('BAAI/bge-reranker-v2-m3', cache_dir='./models')
"
```

BGE-Reranker-v2-m3 约 **2.27GB**，ModelScope 国内 7MB/s，约 5 分钟下完。

### 2. Reranker 类（20 行）

```python
from sentence_transformers import CrossEncoder

class Reranker:
    def __init__(self, model_path: str):
        self.model = CrossEncoder(model_path)

    def rerank(self, query: str, chunks: list[dict], top_k: int = 3):
        pairs = [[query, c["text"]] for c in chunks]
        scores = self.model.predict(pairs)
        # 按 Cross-Encoder 分数降序排列
        for i, c in enumerate(chunks):
            c["rerank_score"] = float(scores[i])
        return sorted(chunks, key=lambda c: c["rerank_score"], reverse=True)[:top_k]
```

### 3. SearchService 加一步

```python
def search(self, query: str, top_k: int = 5):
    query_vector = self.embedder.embed(query)

    # 向量检索多取一些候选（Top-3 × 3 = 9）
    fetch_k = min(top_k * 3, 30) if self.reranker else top_k
    results = self.qdrant.search(query_vector, top_k=fetch_k)

    # Reranker 精排
    if self.reranker:
        results = self.reranker.rerank(query, results, top_k=top_k)

    return results
```

### 4. Docker 挂载

```yaml
# docker-compose.yml
services:
  app:
    environment:
      - RERANKER_MODEL=/app/models/bge-reranker-v2-m3
    volumes:
      - ./models/bge-reranker-v2-m3:/app/models/bge-reranker-v2-m3:ro
```

## 实测

| | 耗时 | 效果 |
|--|------|------|
| 首次请求 | 35s | 模型加载 2.27GB 到内存 |
| 后续请求 | +1~2s | CPU 推理，秒级精排 |
| 无 Reranker | 基准 | 第 2-3 条偶尔跑偏 |

## 一句话

**Cross-Encoder 是 Bi-Encoder 的孪生兄弟，一个负责快，一个负责准。**

配合使用：Bi-Encoder 海量候选 → Cross-Encoder 精准 Top-3 → LLM 生成回答。用代码量不到 30 行，给 RAG 多上了一道保险。
