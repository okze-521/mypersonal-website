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
    description: '基于 Astro + Tailwind CSS 构建的个人博客与作品集站点',
    tags: ['Astro', 'Tailwind CSS', 'TypeScript'],
    featured: true,
    year: 2026,
  },
  {
    id: 'memoapp',
    title: '好记 (MemoApp)',
    description: '鸿蒙原生备忘录应用，支持语音转文字、定时提醒、深色模式，已上架华为应用市场',
    tags: ['HarmonyOS', 'ArkTS', 'ArkUI', '鸿蒙'],
    featured: true,
    year: 2026,
  },
  {
    id: 'ai-knowledge-base',
    title: 'AI 个人知识库系统',
    description: '基于 Hermes Agent + LLM Wiki + Obsidian 打造的 AI 驱动个人知识管理系统，自动导入、交叉引用、持续积累',
    tags: ['Hermes Agent', 'LLM Wiki', 'Obsidian', 'Knowledge Graph'],
    featured: true,
    year: 2026,
  },
  {
    id: 'project-2',
    title: '项目名称',
    description: '项目描述……',
    tags: ['Vue', 'Python'],
    year: 2025,
  },
];
