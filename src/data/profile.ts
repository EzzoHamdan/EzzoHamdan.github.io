/**
 * Single source of truth for everything the site says about Ezzaldeen.
 *
 * The English page, the Arabic page, the JSON-LD graph, llms.txt, llms-full.txt and the
 * sitemap are all generated from this file, so an edit here updates every human- and
 * machine-readable surface at once. Each language is complete on its own: English pages
 * never show Arabic text and Arabic pages never show the English name (enforced by
 * scripts/check-dist.mjs).
 *
 * Plain strings are technical names (Python, BigQuery, z28.ai) that stay the same in both
 * languages; `T` values are translated.
 */
import htu from '../assets/logos/htu.png';
import z28 from '../assets/logos/z28.png';
import altibbi from '../assets/logos/altibbi.png';
import iiab from '../assets/logos/iiab.png';
import aau from '../assets/logos/aau.png';

export const LANGS = ['en', 'ar'] as const;
export type Lang = (typeof LANGS)[number];
export type T<V = string> = Record<Lang, V>;
export type Tag = string | T;
/** `YYYY-MM` */
export type YearMonth = `${number}-${number}`;

export const site = {
  url: 'https://ezzohamdan.github.io',
  /** Bump on every content change: feeds the sitemap, JSON-LD dateModified and the footer. */
  updated: '2026-10-12',
  email: 'devezzham@gmail.com',
  cv: '/Ezzaldeen_Hamdan_AI_Engineer_CV.pdf',
  links: {
    linkedin: 'https://www.linkedin.com/in/ezzhamdan/',
    github: 'https://github.com/EzzoHamdan',
  },
};

export const person = {
  name: { en: 'Ezzaldeen Hamdan', ar: 'عز الدين حمدان' },
  /** English-only nickname, used in English metadata. */
  alternateName: 'Ezzo Hamdan',
  givenName: { en: 'Ezzaldeen', ar: 'عز الدين' },
  familyName: { en: 'Hamdan', ar: 'حمدان' },
  role: { en: 'AI Engineer', ar: 'مهندس ذكاء اصطناعي' },
  location: { en: 'Amman, Jordan', ar: 'عمّان، الأردن' },
  /** The definitional sentence: hero lede, meta description source and llms.txt summary. */
  summary: {
    en: 'Ezzaldeen Hamdan is an AI engineer in Amman, Jordan, and a 9XAI Fellow at Al Hussein Technical University (HTU), building retrieval-augmented generation systems, data pipelines and machine learning models for production.',
    ar: 'عز الدين حمدان مهندس ذكاء اصطناعي مقيم في عمّان، الأردن، وزميل في برنامج 9XAI في جامعة الحسين التقنية، يبني أنظمة التوليد المعزّز بالاسترجاع وخطوط معالجة البيانات ونماذج تعلّم الآلة الجاهزة للإنتاج.',
  },
  /** Short form for <meta name="description"> (aim for ≤ 160 characters). */
  description: {
    en: 'Ezzaldeen Hamdan is an AI engineer in Amman, Jordan, and a 9XAI Fellow at HTU, building RAG systems, data pipelines and machine learning models.',
    ar: 'عز الدين حمدان مهندس ذكاء اصطناعي في عمّان، الأردن، وزميل في برنامج 9XAI في جامعة الحسين التقنية، يبني أنظمة التوليد المعزّز بالاسترجاع وخطوط البيانات ونماذج تعلّم الآلة.',
  },
  about: {
    en: [
      "I'm one of 20 fellows in the inaugural cohort of 9XAI, Jordan's national AI initiative hosted by the National Council for Future Technology and Al Hussein Technical University, where we develop and validate AI solutions with the country's institutional and governmental partners.",
      'Before that, I built a production medical RAG chatbot and a duplicate-detection engine at Altibbi, and loan-repayment prediction models at z28.ai. In my own time I build open-source tools for AI agents, such as House of Wisdom, an MCP server that consults several model families at once.',
    ],
    ar: [
      'أنا واحد من 20 زميلًا في الدفعة الأولى من 9XAI، المبادرة الوطنية للذكاء الاصطناعي التي يستضيفها المجلس الوطني لتكنولوجيا المستقبل وجامعة الحسين التقنية، حيث نطوّر حلول ذكاء اصطناعي ونختبرها مع الشركاء المؤسسيين والحكوميين في الأردن.',
      'قبل ذلك، بنيت في «الطبي» روبوت محادثة طبيًا قائمًا على التوليد المعزّز بالاسترجاع ومحرّكًا لكشف المحتوى المكرر، وبنيت في z28.ai نماذج للتنبؤ بسداد القروض. وفي وقتي الخاص أطوّر أدوات مفتوحة المصدر لوكلاء الذكاء الاصطناعي، مثل «بيت الحكمة»، وهو خادم MCP يستشير عدة عائلات من النماذج في آنٍ واحد.',
    ],
  },
  knowsAbout: {
    en: [
      'Large Language Models',
      'Retrieval-Augmented Generation',
      'Machine Learning',
      'Natural Language Processing',
      'Data Pipelines',
      'MLOps',
      'Model Context Protocol',
    ],
    ar: [
      'النماذج اللغوية الكبيرة',
      'التوليد المعزّز بالاسترجاع',
      'تعلّم الآلة',
      'معالجة اللغات الطبيعية',
      'خطوط معالجة البيانات',
      'عمليات تعلّم الآلة',
      'بروتوكول سياق النموذج',
    ],
  },
  languages: {
    en: 'Arabic (native), English (C2)',
    ar: 'العربية (اللغة الأم)، الإنجليزية (مستوى C2)',
  },
  openTo: {
    en: 'AI engineering roles, collaborations and interesting projects',
    ar: 'فرص هندسة الذكاء الاصطناعي والتعاون والمشاريع المثيرة للاهتمام',
  },
};

/** Organizations, referenced by key from experience, education and certifications. */
export const orgs = {
  htu: {
    name: { en: 'Al Hussein Technical University', ar: 'جامعة الحسين التقنية' },
    short: { en: 'HTU', ar: 'جامعة الحسين التقنية' },
    url: 'https://www.htu.edu.jo/',
    sameAs: ['https://ar.wikipedia.org/wiki/جامعة_الحسين_التقنية'],
    type: 'CollegeOrUniversity',
  },
  ncft: {
    name: { en: 'National Council for Future Technology', ar: 'المجلس الوطني لتكنولوجيا المستقبل' },
    short: { en: 'NCFT', ar: 'المجلس الوطني لتكنولوجيا المستقبل' },
    type: 'GovernmentOrganization',
  },
  z28: { name: { en: 'z28.ai', ar: 'z28.ai' }, url: 'https://z28.ai/', type: 'Organization' },
  altibbi: {
    name: { en: 'Altibbi', ar: 'الطبي' },
    url: 'https://altibbi.com/',
    type: 'Organization',
  },
  iiab: {
    name: { en: 'Islamic International Arab Bank', ar: 'البنك العربي الإسلامي الدولي' },
    url: 'https://www.iiabank.com.jo/',
    type: 'BankOrCreditUnion',
  },
  aau: {
    name: { en: 'Al-Ahliyya Amman University', ar: 'جامعة عمّان الأهلية' },
    url: 'https://www.ammanu.edu.jo/',
    sameAs: [
      'https://en.wikipedia.org/wiki/Al-Ahliyya_Amman_University',
      'https://ar.wikipedia.org/wiki/جامعة_عمان_الأهلية',
    ],
    type: 'CollegeOrUniversity',
  },
  samsung: { name: { en: 'Samsung Innovation Campus', ar: 'برنامج سامسونج للابتكار' }, type: 'Organization' },
  shai: { name: { en: 'SHAI', ar: 'SHAI' }, type: 'Organization' },
  github: { name: { en: 'GitHub', ar: 'GitHub' }, url: 'https://github.com/', type: 'Organization' },
  efset: { name: { en: 'EF SET', ar: 'EF SET' }, url: 'https://www.efset.org/', type: 'Organization' },
} as const satisfies Record<
  string,
  { name: T; short?: T; url?: string; sameAs?: readonly string[]; type: string }
>;
export type OrgKey = keyof typeof orgs;

export interface Role {
  id: string;
  title: T;
  orgs: OrgKey[];
  logo: ImageMetadata;
  start: YearMonth;
  /** `null` = present. Equal to `start` for a single-month role. */
  end: YearMonth | null;
  summary?: T;
  groups?: { title?: T; bullets: T<string[]> }[];
  tags: Tag[];
}

export const experience: Role[] = [
  {
    id: '9xai',
    title: { en: '9XAI Fellow (Lighthouse Cohort)', ar: 'زميل 9XAI (دفعة المنارة)' },
    orgs: ['htu', 'ncft'],
    logo: htu,
    start: '2026-02',
    end: null,
    summary: {
      en: "Selected as 1 of 20 fellows for the inaugural national AI initiative, following a competitive, multi-stage evaluation process. The initiative, hosted by the National Council for Future Technology (NCFT) and Al Hussein Technical University (HTU), develops and validates AI solutions across Jordan's institutional and governmental partners while tackling nationwide challenges.",
      ar: 'تم اختياري ضمن 20 زميلًا في الدفعة الأولى من المبادرة الوطنية للذكاء الاصطناعي، بعد عملية تقييم تنافسية متعددة المراحل. تستضيف المبادرةَ المجلسُ الوطني لتكنولوجيا المستقبل وجامعةُ الحسين التقنية، وتعمل على تطوير حلول الذكاء الاصطناعي واختبارها مع الشركاء المؤسسيين والحكوميين في الأردن لمعالجة تحديات على المستوى الوطني.',
    },
    tags: [{ en: 'Applied AI', ar: 'الذكاء الاصطناعي التطبيقي' }, { en: 'Project Management', ar: 'إدارة المشاريع' }],
  },
  {
    id: 'z28',
    title: { en: 'Junior Artificial Intelligence Engineer', ar: 'مهندس ذكاء اصطناعي مبتدئ' },
    orgs: ['z28'],
    logo: z28,
    start: '2026-02',
    end: '2026-02',
    groups: [
      {
        bullets: {
          en: [
            'Engineered memory-efficient ETL pipelines using Pandas chunking and BigQuery, processing multi-GB datasets (1M+ records).',
            'Built an engine to identify and extract thousands of attributes from an unstructured HTML blob embedded in a database column.',
            'Implemented automated data quality profiling, calculating null-rates and distribution statistics across dynamic schema columns.',
            'Designed a snapshot modeling pipeline to generate training datasets for borrowers, loans, payments, and call-history features.',
            'Conducted segment-level lift analysis to quantify repayment probability uplift across behavioral cohorts relative to baseline.',
            'Implemented LightGBM models with class imbalance calibration, feature auditing, and cohort breakdowns, achieving 0.91 AUC.',
            'Developed an ML interpretability pipeline to bridge the gap between high-performing ML models and business stakeholder trust.',
          ],
          ar: [
            'هندسة خطوط ETL موفّرة للذاكرة باستخدام المعالجة المجزّأة في Pandas وBigQuery، لمعالجة بيانات بحجم عدة غيغابايتات (أكثر من مليون سجل).',
            'بناء محرّك يحدّد آلاف السمات ويستخرجها من كتلة HTML غير مهيكلة مخزّنة داخل عمود في قاعدة البيانات.',
            'تنفيذ فحص آلي لجودة البيانات يحسب نسب القيم الفارغة وإحصاءات التوزيع عبر أعمدة ذات مخطط متغيّر.',
            'تصميم خط نمذجة باللقطات الزمنية لتوليد بيانات تدريب لميزات المقترضين والقروض والدفعات وسجل المكالمات.',
            'إجراء تحليل الرفع على مستوى الشرائح لقياس تحسّن احتمالية السداد عبر الفئات السلوكية مقارنةً بخط الأساس.',
            'تطوير نماذج LightGBM مع معايرة عدم توازن الفئات وتدقيق الميزات وتحليل الفئات، بمؤشر AUC بلغ 0.91.',
            'تطوير خط لتفسير نماذج تعلّم الآلة يردم الفجوة بين أداء النماذج العالي وثقة أصحاب القرار في الأعمال.',
          ],
        },
      },
    ],
    tags: [
      'BigQuery',
      'Pandas',
      'NumPy',
      'LightGBM',
      { en: 'Feature Engineering', ar: 'هندسة الميزات' },
      { en: 'Data Quality', ar: 'جودة البيانات' },
    ],
  },
  {
    id: 'altibbi',
    title: { en: 'Artificial Intelligence Engineer', ar: 'مهندس ذكاء اصطناعي' },
    orgs: ['altibbi'],
    logo: altibbi,
    start: '2025-09',
    end: '2026-01',
    groups: [
      {
        title: { en: 'Duplicates Detector System', ar: 'نظام كشف المحتوى المكرر' },
        bullets: {
          en: [
            'Built an end-to-end ETL pipeline for 10+ MySQL tables with data cleaning, content consolidation, and resumable processing.',
            'Created a scalable embedding workflow with batching, caching, and storage of 100k+ vectors and metadata in ChromaDB.',
            'Reduced the detection process from 3 hours to 15 minutes by building a rapid engine with cosine similarity and star clustering.',
            'Added production safeguards, read-only DB access, metadata handling, a Streamlit UI, and config-based automated runs.',
          ],
          ar: [
            'بناء خط ETL متكامل لأكثر من 10 جداول MySQL يشمل تنظيف البيانات ودمج المحتوى ومعالجة قابلة للاستئناف.',
            'إنشاء سير عمل قابل للتوسّع لتوليد التضمينات مع المعالجة على دفعات والتخزين المؤقت، وتخزين أكثر من 100 ألف متجه مع بياناتها الوصفية في ChromaDB.',
            'تقليص زمن الكشف من 3 ساعات إلى 15 دقيقة ببناء محرّك سريع يعتمد على تشابه جيب التمام والتجميع النجمي.',
            'إضافة ضمانات للإنتاج، ووصول للقراءة فقط إلى قاعدة البيانات، ومعالجة للبيانات الوصفية، وواجهة Streamlit، وتشغيل آلي قائم على ملفات الإعداد.',
          ],
        },
      },
      {
        title: { en: 'Medical RAG Chatbot', ar: 'روبوت محادثة طبي بالتوليد المعزّز بالاسترجاع' },
        bullets: {
          en: [
            'Built an asynchronous web-scraping pipeline to collect and chunk 15k+ Altibbi news and articles with fault tolerance.',
            'Designed and deployed a production embedding pipeline storing vectors in both Milvus and Qdrant for semantic search.',
            'Implemented a 3-layer RAG stack (classification, refinement, retrieval) with OpenAI models and strict source citation.',
            'Set up CI/CD pipelines with Jenkins and Bitbucket, integrating Docker-based builds to streamline deployment workflows.',
          ],
          ar: [
            'بناء خط غير متزامن لجمع أكثر من 15 ألف خبر ومقال من «الطبي» وتقسيمها، مع قدرة على تحمّل الأعطال.',
            'تصميم خط تضمينات إنتاجي ونشره، يخزّن المتجهات في Milvus وQdrant معًا للبحث الدلالي.',
            'تنفيذ منظومة توليد معزّز بالاسترجاع من 3 طبقات (التصنيف، التحسين، الاسترجاع) بنماذج OpenAI مع إسناد صارم للمصادر.',
            'إعداد خطوط CI/CD باستخدام Jenkins وBitbucket، ودمج عمليات بناء قائمة على Docker لتبسيط سير النشر.',
          ],
        },
      },
    ],
    tags: [
      { en: 'NLP', ar: 'معالجة اللغات الطبيعية' },
      { en: 'LLMs', ar: 'النماذج اللغوية الكبيرة' },
      'RAG',
      'MLOps',
      'Docker',
    ],
  },
  {
    id: 'iiab',
    title: { en: 'Rotational Intern', ar: 'متدرّب متنقّل بين الأقسام' },
    orgs: ['iiab'],
    logo: iiab,
    start: '2024-08',
    end: '2024-09',
    groups: [
      {
        bullets: {
          en: [
            'Assisted in an Oracle 21c installation, learned Oracle RAC, and managed backups, LTO tapes, and card issuance.',
            'Assisted in database administration and SDLC across 11 IT departments, focusing on middleware and API management.',
            'Had exposure to enterprise banking systems (iMAL) and security frameworks, including ArcSight and intrusion prevention.',
          ],
          ar: [
            'المساعدة في تثبيت Oracle 21c، والتعرّف على Oracle RAC، وإدارة النسخ الاحتياطية وأشرطة LTO وإصدار البطاقات.',
            'المساعدة في إدارة قواعد البيانات ودورة حياة تطوير البرمجيات عبر 11 قسمًا لتقنية المعلومات، مع التركيز على البرمجيات الوسيطة وإدارة واجهات API.',
            'اكتساب خبرة في الأنظمة المصرفية المؤسسية (iMAL) وأطر الأمن، بما فيها ArcSight وأنظمة منع التسلل.',
          ],
        },
      },
    ],
    tags: ['Oracle', 'SDLC', { en: 'Database Administration', ar: 'إدارة قواعد البيانات' }, { en: 'Security', ar: 'أمن المعلومات' }],
  },
];

export interface Project {
  id: string;
  name: T;
  context: T;
  featured?: boolean;
  description: T;
  tech: string[];
  /** Primary language for SoftwareSourceCode JSON-LD. */
  language?: string;
  repo?: string;
  links: { kind: 'github' | 'demo' | 'listing' | 'package'; href: string; label: T }[];
}

const githubLabel = { en: 'Source on GitHub', ar: 'الشيفرة على GitHub' };

export const projects: Project[] = [
  {
    id: 'house-of-wisdom',
    name: { en: 'House of Wisdom MCP', ar: 'بيت الحكمة' },
    context: { en: 'Personal project', ar: 'مشروع شخصي' },
    featured: true,
    description: {
      en: "An MCP server that sends one question to several AI model families in parallel (OpenAI, Anthropic, Google, DeepSeek or local Ollama) and returns every answer separately, unmerged, so the calling agent weighs independent perspectives instead of one blended reply. Three modes control how far each model may read the codebase, always read-only. Named after Baghdad's medieval House of Wisdom and published on PyPI.",
      ar: 'خادم MCP يرسل السؤال نفسه إلى عدة عائلات من نماذج الذكاء الاصطناعي بالتوازي (OpenAI وAnthropic وGoogle وDeepSeek أو Ollama محليًا)، ويعيد كل إجابة منفصلة دون دمج، ليوازن الوكيل المستدعي بين آراء مستقلة بدل ردّ واحد ممزوج. ثلاثة أوضاع تحدد مدى اطلاع كل نموذج على الشيفرة، وبصلاحية قراءة فقط دائمًا. مستوحى من بيت الحكمة في بغداد، ومنشور على PyPI.',
    },
    tech: ['Python', 'MCP', 'OpenRouter', 'Ollama'],
    language: 'Python',
    repo: 'https://github.com/EzzoHamdan/house-of-wisdom-mcp',
    links: [
      { kind: 'github', href: 'https://github.com/EzzoHamdan/house-of-wisdom-mcp', label: githubLabel },
      { kind: 'listing', href: 'https://glama.ai/mcp/servers/EzzoHamdan/house-of-wisdom-mcp', label: { en: 'Listing on Glama', ar: 'الصفحة على Glama' } },
      { kind: 'package', href: 'https://pypi.org/project/house-of-wisdom-mcp/', label: { en: 'Package on PyPI', ar: 'الحزمة على PyPI' } },
    ],
  },
  {
    id: 'duplicate-detection',
    name: { en: 'Duplicate Detection Platform', ar: 'منصة كشف المحتوى المكرر' },
    context: { en: 'At Altibbi', ar: 'في الطبي' },
    description: {
      en: 'An end-to-end system for finding near-duplicate medical content: a secure sync pipeline, a vector-based detection layer with cosine similarity and star clustering, and a Streamlit dashboard. It cut a 3-hour detection run to 15 minutes across 100k+ vectors.',
      ar: 'نظام متكامل لاكتشاف المحتوى الطبي شبه المكرر: خط مزامنة آمن، وطبقة كشف قائمة على المتجهات بتشابه جيب التمام والتجميع النجمي، ولوحة Streamlit. قلّص زمن الكشف من 3 ساعات إلى 15 دقيقة على أكثر من 100 ألف متجه.',
    },
    tech: ['Python', 'ChromaDB', 'Streamlit', 'Docker'],
    language: 'Python',
    repo: 'https://github.com/EzzoHamdan/duplicate-detection-platform',
    links: [{ kind: 'github', href: 'https://github.com/EzzoHamdan/duplicate-detection-platform', label: githubLabel }],
  },
  {
    id: 'medical-rag',
    name: { en: 'Medical RAG Chatbot', ar: 'روبوت المحادثة الطبي' },
    context: { en: 'At Altibbi', ar: 'في الطبي' },
    description: {
      en: 'Answers Arabic medical questions from 15,000+ scraped Altibbi articles through a 3-layer RAG pipeline (classification, refinement, retrieval) with strict source citation. Vectors live in both Milvus and Qdrant, and builds ship through Jenkins and Docker.',
      ar: 'يجيب عن الأسئلة الطبية بالعربية اعتمادًا على أكثر من 15 ألف مقال من «الطبي» عبر خط توليد معزّز بالاسترجاع من 3 طبقات (التصنيف، التحسين، الاسترجاع) مع إسناد صارم للمصادر. تُخزَّن المتجهات في Milvus وQdrant، ويُنشر عبر Jenkins وDocker.',
    },
    tech: ['Python', 'Milvus', 'Qdrant', 'OpenAI', 'Jenkins'],
    language: 'Python',
    repo: 'https://github.com/EzzoHamdan/MedicalChatbot',
    links: [{ kind: 'github', href: 'https://github.com/EzzoHamdan/MedicalChatbot', label: githubLabel }],
  },
  {
    id: 'ai-learning-engine',
    name: { en: 'AI Learning Engine', ar: 'محرّك التعلّم الذكي' },
    context: { en: 'Personal project', ar: 'مشروع شخصي' },
    description: {
      en: 'Turns PDF, Word and PowerPoint files into study materials and exams: summaries, flashcards, and quizzes with adjustable difficulty and AI scoring. It works with local models through Ollama, or with Google AI and OpenAI.',
      ar: 'يحوّل ملفات PDF وWord وPowerPoint إلى مواد دراسية واختبارات: ملخصات وبطاقات تعليمية واختبارات بصعوبة قابلة للتعديل وتصحيح بالذكاء الاصطناعي. يعمل مع نماذج محلية عبر Ollama، أو مع Google AI وOpenAI.',
    },
    tech: ['Python', 'LangChain', 'Streamlit', 'Ollama'],
    language: 'Python',
    repo: 'https://github.com/EzzoHamdan/AI-Learning-Engine',
    links: [
      { kind: 'demo', href: 'https://ai-learning-engine.streamlit.app/', label: { en: 'Live demo', ar: 'تجربة مباشرة' } },
      { kind: 'github', href: 'https://github.com/EzzoHamdan/AI-Learning-Engine', label: githubLabel },
    ],
  },
  {
    id: 'uni-archives',
    name: { en: 'Uni-Archives', ar: 'Uni-Archives' },
    context: { en: 'Graduation project', ar: 'مشروع التخرج' },
    description: {
      en: 'An academic content-sharing platform that uses GPT models and Tesseract OCR to analyze uploaded course material, with integrated payments. Honoree graduation project at Al-Ahliyya Amman University.',
      ar: 'منصة لمشاركة المحتوى الأكاديمي تستخدم نماذج GPT والتعرّف الضوئي على النصوص لتحليل المواد الدراسية المرفوعة، مع نظام دفع مدمج. مشروع تخرج مكرَّم في جامعة عمّان الأهلية.',
    },
    tech: ['C#', '.NET Core', 'SQL Server', 'Bootstrap'],
    language: 'C#',
    repo: 'https://github.com/Uni-Archives',
    links: [{ kind: 'github', href: 'https://github.com/Uni-Archives', label: githubLabel }],
  },
  {
    id: 'securescope',
    name: { en: 'SecureScope', ar: 'SecureScope' },
    context: { en: 'University project', ar: 'مشروع جامعي' },
    description: {
      en: 'A machine-learning intrusion detection system that classifies live network traffic captured with PyShark using a LightGBM model.',
      ar: 'نظام لكشف التسلل قائم على تعلّم الآلة، يصنّف حركة الشبكة الحيّة الملتقطة عبر PyShark باستخدام نموذج LightGBM.',
    },
    tech: ['Python', 'PyShark', 'LightGBM'],
    language: 'Python',
    repo: 'https://github.com/EzzoHamdan/SecureScope',
    links: [{ kind: 'github', href: 'https://github.com/EzzoHamdan/SecureScope', label: githubLabel }],
  },
];

export const education = {
  degree: { en: 'B.Sc. in Computer Science', ar: 'بكالوريوس علم الحاسوب' },
  org: 'aau' as OrgKey,
  logo: aau,
  start: '2021',
  end: '2025',
  badges: [
    { en: 'GPA 3.69/4.00 (Excellence)', ar: 'المعدل 3.69 من 4.00 (امتياز)' },
    { en: '2nd in cohort', ar: 'الثاني على الدفعة' },
  ],
  highlights: {
    en: [
      'Ranked 2nd in the Computer Science cohort, one of three students with an Excellence GPA.',
      'Awarded a merit-based partial academic scholarship.',
      'Honoree graduation project: Uni-Archives.',
      'Member of the AAU IT and Data Science & AI clubs.',
    ],
    ar: [
      'الثاني على دفعة علم الحاسوب، وواحد من ثلاثة طلاب بمعدل امتياز.',
      'حاصل على منحة دراسية جزئية على أساس التفوق.',
      'مشروع تخرج مكرَّم: Uni-Archives.',
      'عضو في ناديي تقنية المعلومات وعلم البيانات والذكاء الاصطناعي في الجامعة.',
    ],
  },
};

export const certifications: { name: T; org: OrgKey; date: YearMonth; note: T }[] = [
  {
    name: { en: 'Artificial Intelligence', ar: 'الذكاء الاصطناعي' },
    org: 'samsung',
    date: '2025-10',
    note: {
      en: 'AI program, The Levant 2025. Capstone project ranked 6th regionally with a score of 91.5/100.',
      ar: 'برنامج الذكاء الاصطناعي، بلاد الشام 2025. حلّ مشروع التخرج في المركز السادس إقليميًا بعلامة 91.5 من 100.',
    },
  },
  {
    name: { en: 'Agentic AI Certificate', ar: 'شهادة الذكاء الاصطناعي الوكيلي' },
    org: 'shai',
    date: '2025-06',
    note: { en: 'Specialization in autonomous agent systems.', ar: 'تخصص في أنظمة الوكلاء المستقلين.' },
  },
  {
    name: { en: 'GitHub Foundations', ar: 'أساسيات GitHub' },
    org: 'github',
    date: '2025-05',
    note: { en: 'Git version control and collaboration on GitHub.', ar: 'التحكم بالإصدارات عبر Git والتعاون على GitHub.' },
  },
  {
    name: { en: 'EF SET English Certificate', ar: 'شهادة EF SET للغة الإنجليزية' },
    org: 'efset',
    date: '2023-11',
    note: { en: 'C2 Proficient, the highest level.', ar: 'مستوى C2 (متقن)، وهو أعلى مستوى.' },
  },
];

/** The three quotable numbers in the hero. */
export const highlights: { value: T; label: T }[] = [
  {
    value: { en: '1 of 20', ar: 'واحد من 20' },
    label: { en: "fellows selected for Jordan's national AI initiative", ar: 'زميلًا اختيروا للمبادرة الوطنية للذكاء الاصطناعي' },
  },
  {
    value: { en: '3 h → 15 min', ar: '3 ساعات ← 15 دقيقة' },
    label: { en: 'duplicate-detection time cut at Altibbi', ar: 'تقليص زمن كشف المحتوى المكرر في الطبي' },
  },
  {
    value: { en: '2nd in cohort', ar: 'الثاني على الدفعة' },
    label: { en: 'B.Sc. Computer Science, 3.69 GPA', ar: 'بكالوريوس علم الحاسوب، معدل 3.69' },
  },
];
