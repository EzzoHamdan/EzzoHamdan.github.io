/**
 * Bright stars whose names come from Arabic astronomy, shown when hovering the sky.
 * `en` must match the proper name in the d3-celestial catalog (scripts/make-sky-catalog.mjs
 * looks each one up by this name and fails if it is missing).
 * English pages show `en` plus `origin` (Latin transliteration); Arabic pages show `ar` only.
 */
export interface StarName {
  en: string;
  origin: string;
  ar: string;
}

export const starNames: StarName[] = [
  { en: 'Aldebaran', origin: 'al-Dabarān, “the follower”', ar: 'الدَّبَران' },
  { en: 'Altair', origin: 'al-Nasr al-Ṭāʾir, “the flying eagle”', ar: 'النسر الطائر' },
  { en: 'Vega', origin: 'al-Nasr al-Wāqiʿ, “the swooping eagle”', ar: 'النسر الواقع' },
  { en: 'Deneb', origin: 'Dhanab al-Dajājah, “the hen’s tail”', ar: 'ذنب الدجاجة' },
  { en: 'Betelgeuse', origin: 'Yad al-Jawzāʾ, “the hand of al-Jawzāʾ”', ar: 'يد الجوزاء' },
  { en: 'Rigel', origin: 'Rijl al-Jawzāʾ, “the foot of al-Jawzāʾ”', ar: 'رجل الجوزاء' },
  { en: 'Regulus', origin: 'Qalb al-Asad, “the lion’s heart”', ar: 'قلب الأسد' },
  { en: 'Denebola', origin: 'Dhanab al-Asad, “the lion’s tail”', ar: 'ذنب الأسد' },
  { en: 'Antares', origin: 'Qalb al-ʿAqrab, “the scorpion’s heart”', ar: 'قلب العقرب' },
  { en: 'Arcturus', origin: 'al-Simāk al-Rāmiḥ, “the lance-bearer”', ar: 'السماك الرامح' },
  { en: 'Spica', origin: 'al-Simāk al-Aʿzal, “the unarmed one”', ar: 'السماك الأعزل' },
  { en: 'Sirius', origin: 'al-Shiʿrā al-Yamāniyya', ar: 'الشعرى اليمانية' },
  { en: 'Procyon', origin: 'al-Shiʿrā al-Shāmiyya', ar: 'الشعرى الشامية' },
  { en: 'Capella', origin: 'al-ʿAyyūq', ar: 'العيّوق' },
  { en: 'Fomalhaut', origin: 'Fam al-Ḥūt, “the fish’s mouth”', ar: 'فم الحوت' },
  { en: 'Canopus', origin: 'Suhayl', ar: 'سهيل' },
  { en: 'Polaris', origin: 'al-Judayy, “the little kid”', ar: 'الجدي' },
  { en: 'Dubhe', origin: 'Ẓahr al-Dubb, “the bear’s back”', ar: 'ظهر الدب' },
  { en: 'Alkaid', origin: 'al-Qāʾid, “the leader”', ar: 'القائد' },
  { en: 'Mizar', origin: 'al-Miʾzar, “the girdle”', ar: 'المئزر' },
  { en: 'Algol', origin: 'Raʾs al-Ghūl, “the demon’s head”', ar: 'رأس الغول' },
  { en: 'Alnilam', origin: 'al-Niẓām, “the string of pearls”', ar: 'النظام' },
  { en: 'Alnitak', origin: 'al-Niṭāq, “the belt”', ar: 'النطاق' },
  { en: 'Mintaka', origin: 'al-Minṭaqa, “the belt”', ar: 'المنطقة' },
  { en: 'Alpheratz', origin: 'Surrat al-Faras, “the horse’s navel”', ar: 'سرة الفرس' },
  { en: 'Shedar', origin: 'al-Ṣadr, “the breast”', ar: 'الصدر' },
  { en: 'Eltanin', origin: 'Raʾs al-Tinnīn, “the dragon’s head”', ar: 'رأس التنين' },
  { en: 'Rasalhague', origin: 'Raʾs al-Ḥawwāʾ, “the snake charmer’s head”', ar: 'رأس الحواء' },
  { en: 'Alcyone', origin: 'al-Thurayyā, the Pleiades', ar: 'الثريا' },
  { en: 'Mirfak', origin: 'al-Mirfaq, “the elbow”', ar: 'المرفق' },
  { en: 'Alphard', origin: 'al-Fard, “the solitary one”', ar: 'الفرد' },
];

/** Annual meteor showers: peak date (month, day), radiant in degrees. */
export const showers = [
  { en: 'Quadrantids', ar: 'الربعيات', month: 1, day: 3, ra: 230, dec: 49 },
  { en: 'Lyrids', ar: 'القيثاريات', month: 4, day: 22, ra: 271, dec: 34 },
  { en: 'Eta Aquariids', ar: 'إيتا الدلويات', month: 5, day: 6, ra: 338, dec: -1 },
  { en: 'Perseids', ar: 'البرشاويات', month: 8, day: 12, ra: 48, dec: 58 },
  { en: 'Orionids', ar: 'الجباريات', month: 10, day: 21, ra: 95, dec: 16 },
  { en: 'Leonids', ar: 'الأسديات', month: 11, day: 17, ra: 152, dec: 22 },
  { en: 'Geminids', ar: 'التوأميات', month: 12, day: 14, ra: 112, dec: 33 },
];
