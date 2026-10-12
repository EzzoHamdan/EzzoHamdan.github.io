import {
  certifications,
  education,
  experience,
  orgs,
  person,
  projects,
  site,
  type Lang,
  type OrgKey,
} from '../data/profile';
import { pageUrl } from './i18n';

// One stable identity shared by every page and language, so search engines and AI
// systems merge them into a single entity instead of guessing.
export const ids = {
  person: `${site.url}/#person`,
  website: `${site.url}/#website`,
};

function org(key: OrgKey, lang: Lang) {
  const o: (typeof orgs)[OrgKey] = orgs[key];
  return {
    '@type': o.type,
    name: o.name[lang],
    ...('url' in o && { url: o.url }),
    ...('sameAs' in o && { sameAs: o.sameAs }),
  };
}

export function personNode(lang: Lang) {
  const current = experience.filter((r) => r.end === null);
  return {
    '@type': 'Person',
    '@id': ids.person,
    name: person.name[lang],
    givenName: person.givenName[lang],
    familyName: person.familyName[lang],
    ...(lang === 'en' && { alternateName: person.alternateName }),
    url: pageUrl(lang),
    jobTitle: person.role[lang],
    description: person.summary[lang],
    email: `mailto:${site.email}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: lang === 'en' ? 'Amman' : 'عمّان',
      addressCountry: 'JO',
    },
    affiliation: current.flatMap((r) => r.orgs.map((k) => org(k, lang))),
    alumniOf: org(education.org, lang),
    knowsAbout: person.knowsAbout[lang],
    hasCredential: certifications.map((c) => ({
      '@type': 'EducationalOccupationalCredential',
      name: c.name[lang],
      credentialCategory: 'certificate',
      dateCreated: c.date,
      recognizedBy: org(c.org, lang),
    })),
    sameAs: [site.links.linkedin, site.links.github],
  };
}

export function profileGraph(lang: Lang, title: string) {
  const url = pageUrl(lang);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': ids.website,
        url: pageUrl('en'),
        name: person.name[lang],
        inLanguage: ['en', 'ar'],
        publisher: { '@id': ids.person },
      },
      {
        '@type': 'ProfilePage',
        '@id': `${url}#profile`,
        url,
        name: title,
        inLanguage: lang,
        isPartOf: { '@id': ids.website },
        mainEntity: { '@id': ids.person },
        dateModified: site.updated,
      },
      personNode(lang),
      ...projects
        .filter((p) => p.repo)
        .map((p) => ({
          '@type': 'SoftwareSourceCode',
          '@id': `${site.url}/#project-${p.id}`,
          name: p.name[lang],
          description: p.description[lang],
          codeRepository: p.repo,
          programmingLanguage: p.language,
          author: { '@id': ids.person },
        })),
    ],
  };
}

export function articleGraph(post: {
  url: string;
  title: string;
  description: string;
  date: Date;
  updated?: Date;
  tags: string[];
}) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': `${post.url}#article`,
        mainEntityOfPage: post.url,
        url: post.url,
        headline: post.title,
        description: post.description,
        datePublished: post.date.toISOString().slice(0, 10),
        dateModified: (post.updated ?? post.date).toISOString().slice(0, 10),
        keywords: post.tags,
        inLanguage: 'en',
        author: { '@id': ids.person },
        publisher: { '@id': ids.person },
        isPartOf: { '@id': ids.website },
      },
      personNode('en'),
    ],
  };
}
