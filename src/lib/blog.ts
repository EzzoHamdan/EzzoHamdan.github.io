import { getCollection } from 'astro:content';

/** Newest first; drafts only show up in local development. */
export async function publishedPosts() {
  const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
  return posts.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}
