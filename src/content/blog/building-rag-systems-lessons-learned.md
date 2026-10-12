---
title: 'Building RAG Systems in Production: Lessons Learned'
description: 'Lessons from deploying a retrieval-augmented generation system at Altibbi: chunking strategies, embedding pipelines, and why evaluation comes first.'
date: 2026-02-15
tags: ['AI', 'RAG', 'NLP']
draft: true
---

<!--
  Before publishing (set draft: false):
  - Confirm the "200 curated question-answer pairs" figure in section 4.
  - Confirm everything here is fine to share about a former employer.
  - The old version claimed hashing cut the pipeline from 3 hours to 15 minutes. That number
    belongs to the duplicate-detection engine (see the CV), so it was removed here.
-->

Retrieval-Augmented Generation (RAG) has quickly become the go-to architecture for grounding large language models in domain-specific knowledge. But moving from a prototype to a production system surfaces challenges that no tutorial prepares you for.

During my time at **Altibbi**, I built and deployed a 3-layer RAG stack that served medical queries with strict source citation. This article distils the key lessons from that journey.

## 1. Chunking is an art, not a science

The first instinct is to split documents by a fixed token count. That works for homogeneous corpora, but medical literature mixes short Q&A pairs with long clinical guidelines. We ended up building a _hybrid chunker_ that:

- Detects section boundaries via heading patterns and HTML structure.
- Falls back to recursive character splitting when no structure is found.
- Preserves metadata (source URL, section title, last-updated date) in every chunk.

Metadata turned out to be just as important as the text itself. Without it, citations were impossible.

## 2. Embedding pipelines need caching and hashing

Re-embedding 15,000+ articles on every pipeline run is expensive and slow. We introduced a content-hash layer: each chunk gets a SHA-256 hash, and only chunks whose hash changed are re-embedded, so each run only pays for what actually changed.

```python
import hashlib

def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
```

Simple, but it saved real money on API calls and compute.

## 3. The retrieval layer needs multiple strategies

Pure cosine-similarity retrieval works for direct factual queries. But nuanced questions, such as _"What are the contraindications of ibuprofen for a patient with kidney disease?"_, need a refinement step that rewrites the query before retrieval.

Our final architecture used three layers:

1. **Classification**: determine intent and expected answer type.
2. **Refinement**: expand the query with medical context.
3. **Retrieval**: fetch from Milvus and Qdrant with filtered metadata.

## 4. Evaluation is non-negotiable

Without systematic evaluation you're flying blind. We built a test harness of 200 curated question-answer pairs, scored on:

- **Faithfulness**: does the answer stick to the retrieved context?
- **Relevance**: did we retrieve the right chunks?
- **Citation accuracy**: every claim must map to a source.

This harness caught regressions every time we tweaked chunking or retrieval parameters.

## Key takeaway

RAG is deceptively simple in demos and deceptively hard in production. Invest early in **metadata preservation**, **caching**, and **evaluation**. They compound into a system you can actually trust.

If you're working on something similar, feel free to [reach out on LinkedIn](https://www.linkedin.com/in/ezzhamdan/). I'm always happy to talk about RAG architectures.
