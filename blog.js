/**
 * blog.js — Handles blog listing, filtering, article rendering,
 *           and homepage preview. Works entirely client-side.
 * 
 * Structure:
 * - blogs/blog.html – shared template for all articles
 * - blogs/[slug]/data.js – contains BLOG_POST for each article
 * - blog-data.js – BLOG_REGISTRY with post metadata and paths
 * 
 * Article pages are accessed via: blogs/blog.html?article=[slug]
 * The template dynamically loads the corresponding data.js file
 */
(function () {
  'use strict';

  /* ───────── Helpers ───────── */

  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function getQueryParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  }

  /* ───────── Card HTML ───────── */

  function blogCardHTML(post, from = 'blog') {
    const tagsHTML = post.tags.map(t => `<span class="blog-tag">${t}</span>`).join('');
    // post.path already contains '?article=...', so append with '&' not '?'
    const linkHref = `${post.path}&from=${from}`;
    return `
      <a href="${linkHref}" class="blog-card fade-in">
        <div class="blog-card-inner">
          <div class="blog-card-meta">
            <time datetime="${post.date}">${formatDate(post.date)}</time>
            <span class="blog-card-dot">·</span>
            <span>${post.readTime}</span>
          </div>
          <h3 class="blog-card-title">${post.title}</h3>
          <p class="blog-card-excerpt">${post.excerpt}</p>
          <div class="blog-card-tags">${tagsHTML}</div>
          <span class="blog-card-read">Read article &rarr;</span>
        </div>
      </a>`;
  }

  /* ───────── Blog Listing Page ───────── */

  function initBlogListing() {
    const grid = document.getElementById('blog-grid');
    const filtersContainer = document.getElementById('blog-filters');
    const emptyMsg = document.getElementById('blog-empty');
    if (!grid) return;
    if (typeof BLOG_REGISTRY === 'undefined' || BLOG_REGISTRY.length === 0) return;

    // Collect unique tags
    const allTags = [...new Set(BLOG_REGISTRY.flatMap(p => p.tags))].sort();

    // Build filter buttons
    allTags.forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'blog-filter-btn';
      btn.dataset.filter = tag;
      btn.textContent = tag;
      filtersContainer.appendChild(btn);
    });

    // Sort posts newest-first
    const sorted = [...BLOG_REGISTRY].sort((a, b) => new Date(b.date) - new Date(a.date));

    function renderCards(filter) {
      const filtered = filter === 'all' ? sorted : sorted.filter(p => p.tags.includes(filter));
      grid.innerHTML = filtered.map(blogCardHTML).join('');
      emptyMsg.style.display = filtered.length === 0 ? 'block' : 'none';

      // Re-observe for fade-in
      grid.querySelectorAll('.fade-in').forEach(el => {
        el.classList.add('visible');
      });
    }

    renderCards('all');

    // Filter click handling
    filtersContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.blog-filter-btn');
      if (!btn) return;
      filtersContainer.querySelectorAll('.blog-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCards(btn.dataset.filter);
    });
  }

  /* ───────── Single Article Page ───────── */

  function initBlogArticle() {
    const headerEl = document.getElementById('blog-article-header');
    const bodyEl = document.getElementById('blog-article-body');
    const shareEl = document.getElementById('blog-share-links');
    if (!headerEl || !bodyEl) return;

    const slug = getQueryParam('article');
    if (!slug) return; // Not on an article page

    // The slug becomes a script URL, so only allow folder-style names
    // (blocks ?article=https://other.site/x from loading foreign scripts)
    if (!/^[a-z0-9-]+$/.test(slug)) {
      bodyEl.innerHTML = '<p style="color: #ff6b6b;">Article not found.</p>';
      return;
    }

    // Dynamically load the data.js for this article
    // Path is relative to the current page (blogs/blog.html), so just [slug]/data.js
    const script = document.createElement('script');
    script.src = `${slug}/data.js`;
    script.onload = () => {
      if (typeof BLOG_POST !== 'undefined') {
        populateArticle(headerEl, bodyEl, shareEl);
      }
    };
    script.onerror = () => {
      console.error(`Failed to load article data: ${slug}/data.js`);
      bodyEl.innerHTML = '<p style="color: #ff6b6b;">Error loading article content.</p>';
    };
    document.head.appendChild(script);
  }

  function populateArticle(headerEl, bodyEl, shareEl) {
    if (typeof BLOG_POST === 'undefined') return;

    const post = BLOG_POST;

    // Update page title
    document.title = `${post.title} | Ezzaldeen Hamdan`;

    // Update meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = post.excerpt;

    const tagsHTML = post.tags.map(t => `<span class="blog-tag">${t}</span>`).join('');

    headerEl.innerHTML = `
      <div class="blog-article-tags">${tagsHTML}</div>
      <h1 class="blog-article-title">${post.title}</h1>
      <div class="blog-article-meta">
        <time datetime="${post.date}">${formatDate(post.date)}</time>
        <span class="blog-card-dot">·</span>
        <span>${post.readTime}</span>
      </div>
    `;

    bodyEl.innerHTML = post.content;

    // Share links
    if (shareEl) {
      const url = encodeURIComponent(window.location.href);
      const title = encodeURIComponent(post.title);
      shareEl.innerHTML = `
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${url}" target="_blank" rel="noopener noreferrer" class="blog-share-btn" aria-label="Share on LinkedIn">
          <img src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/linkedin.svg" alt="" class="icon">
          LinkedIn
        </a>
        <a href="https://twitter.com/intent/tweet?url=${url}&text=${title}" target="_blank" rel="noopener noreferrer" class="blog-share-btn" aria-label="Share on X/Twitter">
          <img src="https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/x.svg" alt="" class="icon">
          X / Twitter
        </a>
        <button class="blog-share-btn" id="copy-link-btn" aria-label="Copy link">
          📋 Copy Link
        </button>
      `;

      document.getElementById('copy-link-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          const btn = document.getElementById('copy-link-btn');
          btn.textContent = '✓ Copied!';
          setTimeout(() => { btn.textContent = '📋 Copy Link'; }, 2000);
        });
      });
    }

    // Set intelligent back link
    updateBackLink();
  }

  /* ───────── Intelligent Back Link ───────── */

  function updateBackLink() {
    const backLink = document.querySelector('.blog-back-link');
    if (!backLink) return;

    const from = getQueryParam('from');
    let backHref = '../blogs.html'; // Default fallback
    let backText = '&larr; Back to Blog'; // Default text

    if (from === 'home') {
      backHref = '../index.html#blog-preview';
      backText = '&larr; Back to Home';
    } else if (from === 'blog') {
      backHref = '../blogs.html';
      backText = '&larr; Back to Blog';
    }

    backLink.href = backHref;
    backLink.innerHTML = backText;
  }

  /* ───────── Homepage Preview (latest 3) ───────── */

  function initBlogPreview() {
    const grid = document.getElementById('blog-preview-grid');
    if (!grid) return;
    if (typeof BLOG_REGISTRY === 'undefined' || BLOG_REGISTRY.length === 0) return;

    const latest = [...BLOG_REGISTRY]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);

    grid.innerHTML = latest.map(post => blogCardHTML(post, 'home')).join('');

    grid.querySelectorAll('.fade-in').forEach(el => {
      el.classList.add('visible');
    });
  }

  /* ───────── Init ───────── */

  document.addEventListener('DOMContentLoaded', () => {
    initBlogListing();
    initBlogArticle();
    initBlogPreview();
  });

})();
