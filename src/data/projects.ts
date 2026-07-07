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
    id: 'project-2',
    title: '项目名称',
    description: '项目描述……',
    tags: ['Vue', 'Python'],
    year: 2025,
  },
];
