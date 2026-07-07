export interface SocialLink {
  name: string;
  url: string;
  icon: string;
}

export const socialLinks: SocialLink[] = [
  { name: 'GitHub', url: 'https://github.com/你的用户名', icon: '📦' },
  { name: '微博', url: 'https://weibo.com/你的用户名', icon: '📱' },
  { name: '邮箱', url: 'mailto:your@email.com', icon: '✉️' },
];
