import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { ChapterSource } from '../../shared/constants';
import type { ExtractedChapterDraft } from './pdf.processor';

export interface EpubExtractionResult {
  chapters: ExtractedChapterDraft[];
  wordCount: number;
  hasToc: boolean;
  metadata: Record<string, string | number | boolean | null>;
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node === 'object' && node !== null && '#text' in node) {
    return String((node as { '#text': unknown })['#text'] ?? '');
  }
  return '';
}

/**
 * Parse EPUB navigation (nav.xhtml / toc.ncx) and spine for chapter candidates.
 */
export async function extractEpubChapters(buffer: Buffer): Promise<EpubExtractionResult> {
  const zip = await JSZip.loadAsync(buffer);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  });

  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) {
    throw new Error('Invalid EPUB: missing META-INF/container.xml');
  }
  const container = parser.parse(containerXml);
  const rootfile =
    container?.container?.rootfiles?.rootfile?.['@_full-path'] ||
    asArray(container?.container?.rootfiles?.rootfile)[0]?.['@_full-path'];
  if (!rootfile) {
    throw new Error('Invalid EPUB: missing rootfile path');
  }

  const opfDir = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : '';
  const opfXml = await zip.file(rootfile)?.async('string');
  if (!opfXml) throw new Error('Invalid EPUB: missing OPF package');
  const opf = parser.parse(opfXml);

  const metadata = opf?.package?.metadata ?? {};
  const title = textOf(metadata['title']) || textOf(metadata['dc:title']) || 'Untitled';
  const creator = textOf(metadata['creator']) || textOf(metadata['dc:creator']) || null;

  const manifestItems = asArray(opf?.package?.manifest?.item);
  const itemById = new Map<string, { href: string; mediaType?: string; properties?: string }>();
  for (const item of manifestItems) {
    const id = item?.['@_id'];
    const href = item?.['@_href'];
    if (id && href) {
      itemById.set(id, {
        href,
        mediaType: item?.['@_media-type'],
        properties: item?.['@_properties'],
      });
    }
  }

  const chapters: ExtractedChapterDraft[] = [];
  let hasToc = false;

  // Prefer EPUB3 nav document.
  const navItem = [...itemById.values()].find((i) =>
    (i.properties || '').split(/\s+/).includes('nav')
  );
  if (navItem) {
    const navPath = opfDir + navItem.href;
    const navXml = await zip.file(navPath)?.async('string');
    if (navXml) {
      hasToc = true;
      const nav = parser.parse(navXml);
      const navOl =
        nav?.html?.body?.nav?.ol ||
        asArray(nav?.html?.body?.nav).find((n: { '@_type'?: string; '@_epub:type'?: string }) =>
          String(n?.['@_type'] || n?.['@_epub:type'] || '').includes('toc')
        )?.ol ||
        nav?.html?.body?.nav?.ol;

      const walk = (ol: unknown, level: number, parentOrder: number | null) => {
        for (const li of asArray((ol as { li?: unknown })?.li)) {
          const a = (li as { a?: Record<string, unknown> })?.a;
          const label = textOf(a).trim() || 'Untitled';
          const href = String(a?.['@_href'] || '').split('#')[0] || '';
          const order = chapters.length + 1;
          chapters.push({
            title: label.slice(0, 200),
            chapterNumber: order,
            order,
            level,
            parentOrder,
            formatLocations: {
              epub: {
                startHref: href,
                endHref: href,
              },
            } as never,
            source: ChapterSource.IMPORTED_TOC,
          });
          const childOl = (li as { ol?: unknown })?.ol;
          if (childOl) walk(childOl, level + 1, order);
        }
      };
      if (navOl) walk(navOl, 1, null);
    }
  }

  // Fallback: NCX
  if (chapters.length === 0) {
    const ncxItem = [...itemById.values()].find((i) =>
      (i.mediaType || '').includes('ncx')
    );
    if (ncxItem) {
      const ncxXml = await zip.file(opfDir + ncxItem.href)?.async('string');
      if (ncxXml) {
        hasToc = true;
        const ncx = parser.parse(ncxXml);
        const points = asArray(ncx?.ncx?.navMap?.navPoint);
        let order = 1;
        for (const point of points) {
          const label = textOf(point?.navLabel?.text) || `Chapter ${order}`;
          const href = String(point?.content?.['@_src'] || '').split('#')[0];
          chapters.push({
            title: label.slice(0, 200),
            chapterNumber: order,
            order,
            level: 1,
            formatLocations: {
              epub: { startHref: href, endHref: href },
            } as never,
            source: ChapterSource.IMPORTED_TOC,
          });
          order += 1;
        }
      }
    }
  }

  // Fallback: spine order
  if (chapters.length === 0) {
    const spine = asArray(opf?.package?.spine?.itemref);
    let order = 1;
    for (const ref of spine) {
      const idref = ref?.['@_idref'];
      const item = idref ? itemById.get(idref) : undefined;
      if (!item) continue;
      chapters.push({
        title: item.href.split('/').pop() || `Section ${order}`,
        chapterNumber: order,
        order,
        level: 1,
        formatLocations: {
          epub: { startHref: item.href, endHref: item.href },
        } as never,
        source: ChapterSource.AUTO_DETECTED,
      });
      order += 1;
      if (order > 300) break;
    }
  }

  // Rough word count from a few XHTML files.
  let wordCount = 0;
  for (const ch of chapters.slice(0, 20)) {
    const href = ch.formatLocations?.epub?.startHref;
    if (!href) continue;
    const file = zip.file(opfDir + href) || zip.file(href);
    const html = await file?.async('string');
    if (!html) continue;
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    wordCount += text ? text.split(/\s+/).length : 0;
  }

  if (chapters.length === 0) {
    chapters.push({
      title,
      chapterNumber: 1,
      order: 1,
      level: 1,
      source: ChapterSource.AUTO_DETECTED,
    });
  }

  return {
    chapters,
    wordCount,
    hasToc,
    metadata: {
      title,
      creator,
      extractor: 'epub-jszip',
    },
  };
}
