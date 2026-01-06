// URL content extraction using a CORS proxy and Readability
import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';

export interface ExtractedArticle {
    title: string;
    content: string; // HTML content
    textContent: string;
    excerpt: string;
    byline: string | null;
    siteName: string | null;
    length: number;
}

// CORS proxies to try (in order)
const CORS_PROXIES = [
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

async function fetchWithProxy(url: string): Promise<string> {
    let lastError: Error | null = null;

    for (const makeProxyUrl of CORS_PROXIES) {
        try {
            const proxyUrl = makeProxyUrl(url);
            const response = await fetch(proxyUrl, {
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.text();
        } catch (err) {
            lastError = err as Error;
            continue;
        }
    }

    throw lastError || new Error('Failed to fetch URL');
}

export async function extractFromUrl(url: string): Promise<ExtractedArticle> {
    // Validate URL
    try {
        new URL(url);
    } catch {
        throw new Error('Invalid URL format');
    }

    const html = await fetchWithProxy(url);

    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Set the base URL for relative links
    const baseEl = doc.createElement('base');
    baseEl.href = url;
    doc.head.prepend(baseEl);

    // Use Readability to extract main content
    const reader = new Readability(doc, {
        charThreshold: 20,
        keepClasses: false,
        disableJSONLD: false,
    });

    const article = reader.parse();

    if (!article) {
        throw new Error('Could not extract readable content from this page');
    }

    // Sanitize the HTML content
    const sanitizedContent = DOMPurify.sanitize(article.content ?? '', {
        ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'img'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title'],
    });

    return {
        title: article.title || 'Untitled Article',
        content: sanitizedContent,
        textContent: article.textContent || '',
        excerpt: article.excerpt || '',
        byline: article.byline ?? null,
        siteName: article.siteName ?? null,
        length: article.length ?? 0,
    };
}

// Convert extracted article to blocks format compatible with the reader
export function articleToBlocks(article: ExtractedArticle): { kind: 'p' | 'h'; level?: 1 | 2 | 3; text: string }[] {
    const blocks: { kind: 'p' | 'h'; level?: 1 | 2 | 3; text: string }[] = [];

    // Add title as h1
    if (article.title) {
        blocks.push({ kind: 'h', level: 1, text: article.title });
    }

    // Add byline/site info as paragraph
    if (article.byline || article.siteName) {
        const meta = [article.byline, article.siteName].filter(Boolean).join(' • ');
        blocks.push({ kind: 'p', text: `<em>${meta}</em>` });
    }

    // Parse the HTML content into blocks
    const parser = new DOMParser();
    const doc = parser.parseFromString(article.content, 'text/html');

    function processNode(node: Node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const tagName = el.tagName.toLowerCase();

            switch (tagName) {
                case 'h1':
                    blocks.push({ kind: 'h', level: 1, text: el.innerHTML });
                    break;
                case 'h2':
                    blocks.push({ kind: 'h', level: 2, text: el.innerHTML });
                    break;
                case 'h3':
                case 'h4':
                case 'h5':
                case 'h6':
                    blocks.push({ kind: 'h', level: 3, text: el.innerHTML });
                    break;
                case 'p':
                    const text = el.innerHTML.trim();
                    if (text) {
                        blocks.push({ kind: 'p', text });
                    }
                    break;
                case 'blockquote':
                    blocks.push({ kind: 'p', text: `<em>"${el.textContent?.trim()}"</em>` });
                    break;
                case 'ul':
                case 'ol':
                    el.querySelectorAll('li').forEach((li) => {
                        blocks.push({ kind: 'p', text: `• ${li.innerHTML.trim()}` });
                    });
                    break;
                case 'pre':
                case 'code':
                    blocks.push({ kind: 'p', text: `<code>${el.textContent}</code>` });
                    break;
                case 'div':
                case 'article':
                case 'section':
                    // Process children for container elements
                    el.childNodes.forEach(processNode);
                    break;
            }
        }
    }

    doc.body.childNodes.forEach(processNode);

    return blocks;
}
