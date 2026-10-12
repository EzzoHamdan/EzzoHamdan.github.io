// Markdown summaries for AI agents (https://llmstxt.org), generated from the same data as the
// pages so they can never disagree with them. English only: the machine-readable lingua franca.
import { certifications, education, experience, orgs, person, projects, site } from '../data/profile';
import { formatMonth, formatPeriod, pageUrl } from './i18n';

const lang = 'en';
const firstSentence = (text: string) => text.split(/(?<=\.)\s/)[0];

function header() {
  return [
    `# ${person.name.en}`,
    '',
    `> ${person.summary.en}`,
    '',
    `Also known as ${person.alternateName}. Based in ${person.location.en}. Open to ${person.openTo.en}. Contact: ${site.email}.`,
  ];
}

export function llmsTxt() {
  return [
    ...header(),
    '',
    '## Profile',
    `- [Portfolio](${pageUrl('en')}): experience, projects, education and certifications`,
    `- [Portfolio in Arabic](${pageUrl('ar')}): the same profile, written in Arabic`,
    `- [Full profile in Markdown](${site.url}/llms-full.txt): everything on the site in one file`,
    `- [CV (PDF)](${site.url}${site.cv})`,
    '',
    '## Elsewhere',
    `- [GitHub](${site.links.github})`,
    `- [LinkedIn](${site.links.linkedin})`,
    '',
    '## Projects',
    ...projects.map((p) => `- [${p.name.en}](${p.repo ?? p.links[0].href}): ${firstSentence(p.description.en)}`),
    '',
  ].join('\n');
}

export function llmsFullTxt() {
  const out = [...header(), '', '## About', '', ...person.about.en.flatMap((p) => [p, ''])];

  out.push('## Experience', '');
  for (const r of experience) {
    const org = r.orgs.map((k) => orgs[k].name.en).join(' and ');
    out.push(`### ${r.title.en}, ${org} (${formatPeriod(r.start, r.end, lang)})`, '');
    if (r.summary) out.push(r.summary.en, '');
    for (const g of r.groups ?? []) {
      if (g.title) out.push(`**${g.title.en}**`, '');
      out.push(...g.bullets.en.map((b) => `- ${b}`), '');
    }
  }

  out.push('## Projects', '');
  for (const p of projects) {
    out.push(`### ${p.name.en} (${p.context.en})`, '', p.description.en, '', `Tech: ${p.tech.join(', ')}.`);
    out.push(...p.links.map((l) => `- ${l.label.en}: ${l.href}`), '');
  }

  out.push(
    '## Education',
    '',
    `### ${education.degree.en}, ${orgs[education.org].name.en} (${education.start}–${education.end})`,
    '',
    ...education.highlights.en.map((h) => `- ${h}`),
    '',
    '## Certifications',
    '',
    ...certifications.map(
      (c) => `- ${c.name.en}, ${orgs[c.org].name.en} (${formatMonth(c.date, lang)}): ${c.note.en}`,
    ),
    '',
    '## Skills and focus',
    '',
    person.knowsAbout.en.join(', ') + '.',
    '',
    `Languages: ${person.languages.en}.`,
    '',
    `Last updated: ${site.updated}.`,
    '',
  );
  return out.join('\n');
}
