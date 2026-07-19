import type { MetadataRoute } from 'next';
import { CATEGORIES, allEntries, resolveHref } from '@/lib/catalog';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ['', '/all', '/about', '/notes'];
  const categoryRoutes = CATEGORIES.map((c) => `/category/${c.slug}`);
  // Internal content routes from the catalog (skip off-site dashboards).
  const contentRoutes = allEntries()
    .map((e) => resolveHref(e))
    .filter((h) => h.startsWith('/'));

  const unique = [...new Set([...staticRoutes, ...categoryRoutes, ...contentRoutes])];
  return unique.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : path.startsWith('/category') ? 0.6 : 0.8,
  }));
}
