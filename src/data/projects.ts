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
    featured: true,
    year: 2026,
  },
  {
    id: 'local-llm',
    title: '本地大模型部署',
    description: 'RTX 5090D 32GB 部署 qwen3:32b，Ollama + Hermes Agent 实现本地推理，搭配 RAG 知识库',
    tags: ['Ollama', 'Hermes Agent', 'LLM', 'RAG', 'GPU'],
    featured: true,
    year: 2026,
  },
  {
    id: 'ai-knowledge-base',
    title: 'AI 个人知识库 (RAG)',
    description: '基于 LlamaIndex + BGE-M3 + Qdrant 构建的本地 RAG 知识库系统，Docker 部署，端到端可查询',
    tags: ['LlamaIndex', 'BGE-M3', 'Qdrant', 'Docker', 'RAG'],
    featured: false,
    year: 2026,
  },
];
