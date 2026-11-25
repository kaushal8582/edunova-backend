import { PDFParse } from 'pdf-parse';
import { ChapterSource } from '../../shared/constants';
import { getEnv } from '../../../config/env';

export interface ExtractedChapterDraft {
  title: string;
  chapterNumber: number;
  order: number;
  level: number;
  parentOrder?: number | null;
  formatLocations?: {
    pdf?: { startPage: number; endPage: number };
    epub?: {
      startHref?: string;
      endHref?: string;
      startCfi?: string;
      endCfi?: string;
    };
  };
  source?: ChapterSource;
}

export interface PdfExtractionResult {
  pageCount: number;
  hasExtractableText: boolean;
  ocrRequired: boolean;
  ocrStatus: 'NOT_REQUIRED' | 'UNAVAILABLE' | 'REQUIRED';
  chapters: ExtractedChapterDraft[];
  wordCount: number;
  metadata: Record<string, string | number | boolean | null>;
}

const HEADING_RE =
  /^(chapter\s+\d+|unit\s+\d+|part\s+\d+|\d+(\.\d+)*\s+[A-Z].{3,80}|[A-Z][A-Z0-9\s\-:]{6,80})$/i;

function flattenOutline(
  nodes: Array<{ title?: string; items?: unknown[] }> | undefined,
  level = 1,
  parentOrder: number | null = null,
  acc: ExtractedChapterDraft[] = []
): ExtractedChapterDraft[] {
  if (!nodes?.length) return acc;
  for (const node of nodes) {
    const title = String(node.title || '').trim();
    if (!title) continue;
    const order = acc.length + 1;
    acc.push({
      title: title.slice(0, 200),
      chapterNumber: order,
      order,
      level,
      parentOrder,
      formatLocations: {
        // Exact page dest resolution varies by PDF; start with page 1 and refine later.
        pdf: { startPage: 1, endPage: 1 },
      },
      source: ChapterSource.IMPORTED_TOC,
    });
    if (Array.isArray(node.items) && node.items.length) {
      flattenOutline(node.items as Array<{ title?: string; items?: unknown[] }>, level + 1, order, acc);
    }
  }
  return acc;
}

/**
 * Extract PDF metadata + chapter candidates.
 * Priority: outline/bookmarks → heading heuristics.
 * OCR is marked unavailable when not configured — never faked.
 */
export async function extractPdfChapters(buffer: Buffer): Promise<PdfExtractionResult> {
  const parser = new PDFParse({ data: buffer });
  try {
    const info = await parser.getInfo({ parsePageInfo: false });
    const textResult = await parser.getText();
    const pageCount = info.total || textResult.total || 1;
    const text = textResult.text || '';
    const hasExtractableText = text.replace(/\s+/g, '').length > 40;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

    const env = getEnv();
    let ocrRequired = false;
    let ocrStatus: PdfExtractionResult['ocrStatus'] = 'NOT_REQUIRED';

    if (!hasExtractableText) {
      ocrRequired = true;
      ocrStatus = env.OCR_PROVIDER === 'none' ? 'UNAVAILABLE' : 'REQUIRED';
    }

    let chapters: ExtractedChapterDraft[] = [];

    // 1) Internal outline / bookmarks
    const outline = (info as { outline?: Array<{ title?: string; items?: unknown[] }> }).outline;
    if (outline?.length) {
      chapters = flattenOutline(outline);
      // Spread pages evenly across outline entries as a conservative estimate.
      const n = chapters.length;
      for (let i = 0; i < n; i += 1) {
        const start = Math.min(pageCount, Math.floor((i / n) * pageCount) + 1);
        const end = Math.min(
          pageCount,
          i === n - 1 ? pageCount : Math.floor(((i + 1) / n) * pageCount)
        );
        chapters[i]!.formatLocations = { pdf: { startPage: start, endPage: Math.max(start, end) } };
      }
    }

    // 2) Heading heuristics when no outline
    if (!chapters.length && hasExtractableText) {
      const lines = text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean);

      let order = 1;
      let chapterNumber = 1;
      const seen = new Set<string>();

      for (const line of lines) {
        if (!HEADING_RE.test(line)) continue;
        const key = line.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const idx = text.indexOf(line);
        const approxPage = Math.min(
          pageCount,
          Math.max(1, Math.ceil(((idx + 1) / Math.max(text.length, 1)) * pageCount))
        );

        chapters.push({
          title: line.slice(0, 200),
          chapterNumber,
          order,
          level: 1,
          formatLocations: {
            pdf: { startPage: approxPage, endPage: approxPage },
          },
          source: ChapterSource.AUTO_DETECTED,
        });
        order += 1;
        chapterNumber += 1;
        if (chapters.length >= 200) break;
      }

      for (let i = 0; i < chapters.length; i += 1) {
        const current = chapters[i]!;
        const next = chapters[i + 1];
        const start = current.formatLocations!.pdf!.startPage;
        const end = next
          ? Math.max(start, next.formatLocations!.pdf!.startPage - 1)
          : pageCount;
        current.formatLocations!.pdf!.endPage = end;
      }
    }

    if (hasExtractableText && chapters.length === 0) {
      const title =
        (info.info?.Title as string | undefined) ||
        (info.info?.title as string | undefined) ||
        'Full Document';
      chapters.push({
        title,
        chapterNumber: 1,
        order: 1,
        level: 1,
        formatLocations: { pdf: { startPage: 1, endPage: pageCount } },
        source: ChapterSource.AUTO_DETECTED,
      });
    }

    return {
      pageCount,
      hasExtractableText,
      ocrRequired,
      ocrStatus,
      chapters,
      wordCount,
      metadata: {
        title: (info.info?.Title as string) || (info.info?.title as string) || null,
        author: (info.info?.Author as string) || (info.info?.author as string) || null,
        extractor: 'pdf-parse-v2',
        hasOutline: Boolean(outline?.length),
      },
    };
  } finally {
    await parser.destroy();
  }
}
