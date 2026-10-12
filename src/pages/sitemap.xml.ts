import type { APIRoute } from 'astro';
import { site } from '../data/profile';
import { pageUrl } from '../lib/i18n';
import { publishedPosts } from '../lib/blog';

export const GET: APIRoute = async () => {
  const alternates = `
    <xhtml:link rel="alternate" hreflang="en" href="${pageUrl('en')}"/>
    <xhtml:link rel="alternate" hreflang="ar" href="${pageUrl('ar')}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl('en')}"/>`;
  const profiles = (['en', 'ar'] as const).map(
    (lang) => `
  <url>
    <loc>${pageUrl(lang)}</loc>
    <lastmod>${site.updated}</lastmod>${alternates}
  </url>`,
  );
  const posts = await publishedPosts();
  const articles = posts.map(
    (p) => `
  <url>
    <loc>${site.url}/blog/${p.id}/</loc>
    <lastmod>${(p.data.updated ?? p.data.date).toISOString().slice(0, 10)}</lastmod>
  </url>`,
  );
  const index = posts.length
    ? [`\n  <url>\n    <loc>${site.url}/blog/</loc>\n    <lastmod>${site.updated}</lastmod>\n  </url>`]
    : [];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${[...profiles, ...index, ...articles].join('')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
