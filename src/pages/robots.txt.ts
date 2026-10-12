import type { APIRoute } from 'astro';
import { site } from '../data/profile';

// Everything is public on purpose, for search engines and AI crawlers alike, both those that
// answer questions live (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, PerplexityBot) and those
// that collect training data (GPTBot, ClaudeBot, Google-Extended, CCBot). A personal site wants
// to be found and described correctly everywhere, so no agent is singled out.
export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
