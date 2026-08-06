export interface Project {
  id: string;
  title: string;
  description: string;
  tags: string[];
  image?: string;
  liveUrl?: string;
  githubUrl?: string;
  featured?: boolean;
  year: number;
  /** 进化版本标识 (v1/v2/v3) */
  version?: string;
  /** 进化到的下一个项目 title */
  evolvedTo?: string;
}

export const projects: Project[] = [
  {
    id: 'my-website',
    title: '个人网站',
    description: '基于 Astro + Tailwind CSS + TypeScript 构建的个人博客与作品集站点，部署于 EdgeOne Pages',
    tags: ['Astro', 'Tailwind CSS', 'TypeScript'],
    featured: true,
    year: 2026,
  },
  {
    id: 'memoapp',
    title: '好记 — 鸿蒙备忘录应用',
    description: '鸿蒙原生备忘录，支持语音转文字离线识别、深色模式，已提交华为应用市场审核',
    tags: ['HarmonyOS', 'ArkTS', 'CoreSpeechKit', '鸿蒙'],
    featured: false,
    year: 2026,
  },
  // ── RAG 进化三部曲 ────────────────────────────────
  {
    id: 'local-llm',
    title: '本地大模型部署',
    description: 'RTX 5090D 32GB 部署 qwen3.6:35b MoE（存算分离架构），Ollama 开放外部推理 API，搭配 Hermes Agent 智能体',
    tags: ['Ollama', 'GPU', 'MoE', 'LLM'],
    featured: false,
    year: 2026,
    version: 'v1',
    evolvedTo: 'AI 个人知识库 (RAG)',
  },
  {
    id: 'ai-knowledge-base',
    title: 'AI 个人知识库 (RAG)',
    description: '基于 LLamaIndex + BGE-M3 + Qdrant 的端到端 RAG 原型，Docker 部署，完成从零到检索问答的全链路验证',
    tags: ['LLamaIndex', 'BGE-M3', 'Qdrant', 'Docker', 'RAG'],
    featured: false,
    year: 2026,
    version: 'v2',
    evolvedTo: 'Personal RAG Platform',
  },
  {
    id: 'personal-rag-platform',
    title: 'Personal RAG Platform',
    description: '企业级私有化 RAG 知识库平台 v2.0 — FastAPI + LangChain 异步架构，5步链路（Embed → Search → Rerank → Prompt → LLM），BGE-Reranker 精排 + 降级容错，存算分离本地运行',
    tags: ['FastAPI', 'LangChain', 'Qdrant', 'Ollama', 'Reranker', 'RAG', 'MLOps'],
    githubUrl: 'https://github.com/okze-521/personal-rag-platform',
    featured: true,
    year: 2026,
    version: 'v3',
  },
  {
    id: 'smart-doc-analyzer',
    title: 'Smart Doc Analyzer',
    description: '企业文档智能分析平台 — FastAPI + Qdrant 向量检索，支持 PDF/DOCX/XLSX 解析、语义 RAG 问答、文档对比与自动分类，111 tests · 89% 覆盖率，TDD 全流程开发',
    tags: ['FastAPI', 'Qdrant', 'RAG', 'TDD', 'Ollama', 'MLOps'],
    githubUrl: 'https://github.com/okze-521/smart-doc-analyzer',
    featured: true,
    year: 2026,
  },
  {
    id: 'oa-excel-analyzer',
    title: 'OA Excel 智能分析 Agent',
    description: '真正的 AI Agent 应用 — 上传 Excel 用自然语言提问，Agent 自动调用 12 个分析工具（筛选/聚合/透视/异常检测等），支持云端 API / 本地 Ollama / 离线规则三种模式，Docker 一键部署，53 项自动化测试',
    tags: ['AI Agent', 'FastAPI', 'Pandas', 'Function Calling', 'Ollama', 'Docker'],
    featured: true,
    year: 2026,
  },
];
