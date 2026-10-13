import type { Lang, T, Tag, YearMonth } from '../data/profile';
import { site } from '../data/profile';

export const ui = {
  en: {
    dir: 'ltr',
    path: '/',
    ogLocale: 'en_US',
    nav: { home: 'Home', about: 'In short', experience: 'Experience', projects: 'Projects', education: 'Education', contact: 'Contact' },
    navLabel: 'Sections',
    otherLang: { label: 'Arabic', title: 'Read this page in Arabic' },
    skip: 'Skip to content',
    location: 'Amman, Jordan (UTC+3)',
    downloadCv: 'Download CV',
    sections: {
      about: { label: 'About', title: 'In short' },
      experience: { label: 'Experience', title: "Where I've worked" },
      projects: { label: 'Projects', title: 'Featured work' },
      education: { label: 'Education', title: 'Background & credentials' },
      certifications: 'Certifications',
    },
    facts: {
      role: 'Role',
      basedIn: 'Based in',
      current: 'Current',
      previously: 'Previously',
      education: 'Education',
      focus: 'Focus',
      languages: 'Languages',
      openTo: 'Open to',
      contact: 'Contact',
    },
    since: 'since',
    showAll: 'Show all highlights',
    showFewer: 'Show fewer',
    scrollCue: 'Scroll to begin the journey',
    present: 'Present',
    contact: {
      title: "Let's build something meaningful",
      linkedin: 'Connect on LinkedIn',
      github: 'View GitHub',
      email: 'Send email',
    },
    updated: 'Last updated',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthsLong: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
  },
  ar: {
    dir: 'rtl',
    path: '/ar/',
    ogLocale: 'ar_JO',
    nav: { home: 'الرئيسية', about: 'باختصار', experience: 'الخبرات', projects: 'المشاريع', education: 'التعليم', contact: 'تواصل' },
    navLabel: 'أقسام الصفحة',
    otherLang: { label: 'الإنجليزية', title: 'اقرأ هذه الصفحة بالإنجليزية' },
    skip: 'انتقل إلى المحتوى',
    location: 'عمّان، الأردن',
    downloadCv: 'تحميل السيرة الذاتية (بالإنجليزية)',
    sections: {
      about: { label: 'نبذة', title: 'باختصار' },
      experience: { label: 'الخبرات', title: 'أين عملت' },
      projects: { label: 'المشاريع', title: 'أعمال مختارة' },
      education: { label: 'التعليم', title: 'التعليم والشهادات' },
      certifications: 'الشهادات',
    },
    facts: {
      role: 'المسمّى',
      basedIn: 'المقر',
      current: 'حاليًا',
      previously: 'سابقًا',
      education: 'التعليم',
      focus: 'مجالات التركيز',
      languages: 'اللغات',
      openTo: 'منفتح على',
      contact: 'التواصل',
    },
    since: 'منذ',
    showAll: 'عرض كل الإنجازات',
    showFewer: 'عرض أقل',
    scrollCue: 'مرّر لتبدأ الرحلة',
    present: 'حتى الآن',
    contact: {
      title: 'لنصنع معًا شيئًا ذا قيمة',
      linkedin: 'تواصل عبر لينكدإن',
      github: 'تصفّح غيت هب',
      email: 'أرسل بريدًا إلكترونيًا',
    },
    updated: 'آخر تحديث',
    // Levantine month names, as used in Jordan
    months: [
      'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
      'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
    ],
    monthsLong: [
      'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
      'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
    ],
  },
} as const;

export const t = <V>(value: T<V>, lang: Lang): V => value[lang];
export const tag = (value: Tag, lang: Lang): string => (typeof value === 'string' ? value : value[lang]);

export function formatMonth(ym: YearMonth, lang: Lang): string {
  const [y, m] = ym.split('-').map(Number);
  return `${ui[lang].months[m - 1]} ${y}`;
}

export function formatPeriod(start: YearMonth, end: YearMonth | null, lang: Lang): string {
  if (end === start) return formatMonth(start, lang);
  return `${formatMonth(start, lang)} – ${end ? formatMonth(end, lang) : ui[lang].present}`;
}

/** `2026-10-12` → `12 October 2026` / `12 تشرين الأول 2026` */
export function formatDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${ui[lang].monthsLong[m - 1]} ${y}`;
}

export const pageUrl = (lang: Lang) => new URL(ui[lang].path, site.url).href;
