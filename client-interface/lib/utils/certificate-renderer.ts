/**
 * Client-side certificate renderer — v3 (Pure 2D Canvas)
 *
 * Completely eliminates canvas tainting and SecurityError:
 * 1. Pre-fetches all images as data URIs.
 * 2. Pre-loads HTMLImageElement objects in RAM.
 * 3. Draws directly to a 2D Canvas context (2x Retina resolution).
 * 4. Export via canvas.toBlob() is 100% clean, fast, and offline-safe.
 */

import type { CertificateTemplate } from '@/lib/services/certificates-api';

export interface CertificateRenderData {
  menteeName:      string;
  programName?:    string;
  fellowshipName?: string;
  dateIssued:      string;
  issuerName:      string;
  issuerTitle:     string;
}

// ==================== ASSET PRE-FETCHING ====================

async function fetchAsDataUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:') || url.trim() === '') return url;
  try {
    const res  = await fetch(url, { mode: 'cors', cache: 'force-cache' });
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

async function prefetchTemplateAssets(
  template: CertificateTemplate,
  badgeUrlOverride?: string | null,
): Promise<Map<string, string>> {
  const urls = new Set<string>();

  if (template.bgImageUrl)  urls.add(template.bgImageUrl);
  if (template.logoUrl)     urls.add(template.logoUrl);

  for (const el of template.config ?? []) {
    if (el.type === 'badge' && (el as any).badgeUrl) urls.add((el as any).badgeUrl);
    if (el.type === 'image' && (el as any).imageUrl) urls.add((el as any).imageUrl);
  }
  if (badgeUrlOverride) urls.add(badgeUrlOverride);

  const entries = await Promise.all(
    Array.from(urls).map(async url => [url, await fetchAsDataUrl(url)] as const)
  );
  return new Map(entries);
}

async function loadHtmlImages(assets: Map<string, string>): Promise<Map<string, HTMLImageElement>> {
  const imageMap = new Map<string, HTMLImageElement>();
  const promises: Promise<void>[] = [];

  for (const [origUrl, dataUri] of assets.entries()) {
    if (!dataUri) continue;
    const promise = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        imageMap.set(origUrl, img);
        imageMap.set(dataUri, img);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = dataUri;
    });
    promises.push(promise);
  }

  await Promise.all(promises);
  return imageMap;
}

// ==================== FONT PRE-LOADING ====================

const GOOGLE_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Alex+Brush&family=Cinzel:wght@400;700' +
  '&family=Great+Vibes&family=Montserrat:wght@400;600;700&family=Oswald:wght@400;700' +
  '&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Sacramento' +
  '&family=Lustria&family=Merriweather&display=swap';

const FONT_FAMILIES = [
  'Montserrat', 'Cinzel', 'Playfair Display', 'Great Vibes',
  'Alex Brush', 'Sacramento', 'Oswald', 'Lustria', 'Merriweather',
];

let fontLoadPromise: Promise<void> | null = null;

async function ensureFontsLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (fontLoadPromise) return fontLoadPromise;

  fontLoadPromise = (async () => {
    if (!document.querySelector(`link[data-cert-fonts]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = GOOGLE_FONTS_URL;
      link.setAttribute('data-cert-fonts', '');
      document.head.appendChild(link);
    }

    await document.fonts.ready;

    const loads = FONT_FAMILIES.flatMap(family => [
      document.fonts.load(`400 16px "${family}"`),
      document.fonts.load(`700 16px "${family}"`),
    ]);

    await Promise.race([
      Promise.allSettled(loads),
      new Promise(r => setTimeout(r, 4000)),
    ]);
  })();

  return fontLoadPromise;
}

// ==================== TEXT RESOLVER ====================

export function resolveText(el: Record<string, any>, data: CertificateRenderData): string {
  let text = el.text || '';

  if (el.dynamicKey) {
    switch (el.dynamicKey) {
      case 'mentee_name':
        text = data.menteeName || text;
        break;
      case 'program_name':
      case 'fellowship_name':
        text = data.programName || data.fellowshipName || text;
        break;
      case 'date_issued':
        text = data.dateIssued || text;
        break;
      case 'issuer_name':
      case 'mentor_name':
        text = data.issuerName || text;
        break;
      case 'issuer_title':
        text = data.issuerTitle || text;
        break;
    }
  }

  if (text) {
    text = text
      .replace(/\{\{\s*mentee_name\s*\}\}/gi, data.menteeName || '')
      .replace(/\{\{\s*program_name\s*\}\}/gi, data.programName || data.fellowshipName || '')
      .replace(/\{\{\s*fellowship_name\s*\}\}/gi, data.programName || data.fellowshipName || '')
      .replace(/\{\{\s*date_issued\s*\}\}/gi, data.dateIssued || '')
      .replace(/\{\{\s*issuer_name\s*\}\}/gi, data.issuerName || '')
      .replace(/\{\{\s*mentor_name\s*\}\}/gi, data.issuerName || '')
      .replace(/\{\{\s*issuer_title\s*\}\}/gi, data.issuerTitle || '');
  }

  return text;
}

// ==================== 2D CANVAS RENDERER ====================

const WIDTH  = 1200;
const HEIGHT = 848;

export async function renderCertificateToBlobUrl(
  template: CertificateTemplate,
  data: CertificateRenderData,
  badgeUrlOverride?: string | null,
): Promise<string> {
  const [assets] = await Promise.all([
    prefetchTemplateAssets(template, badgeUrlOverride),
    ensureFontsLoaded(),
  ]);

  const imageMap = await loadHtmlImages(assets);

  const canvas = document.createElement('canvas');
  canvas.width  = WIDTH * 2;  // 2x Retina
  canvas.height = HEIGHT * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.scale(2, 2);
  ctx.textBaseline = 'middle';

  // Fill background white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 1. Draw Background Image
  const bgImg = imageMap.get(template.bgImageUrl || '');
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, WIDTH, HEIGHT);
  }

  // 2. Draw Logo
  const logoUrl = template.logoUrl || '';
  const logoImg = imageMap.get(logoUrl);
  if (logoImg) {
    const logoConfig = template.logoConfig || { xPercent: 10, yPercent: 10, widthPercent: 15 };
    const lx = ((logoConfig.xPercent ?? 10) / 100) * WIDTH;
    const ly = ((logoConfig.yPercent ?? 10) / 100) * HEIGHT;
    const lw = ((logoConfig.widthPercent ?? 15) / 100) * WIDTH;
    const lh = logoImg.naturalWidth ? (lw / logoImg.naturalWidth) * logoImg.naturalHeight : lw * 0.5;
    ctx.drawImage(logoImg, lx - lw / 2, ly - lh / 2, lw, lh);
  }

  // 3. Draw Elements (Badges, Images, Text)
  const elements = Array.isArray(template.config) ? template.config : [];

  for (const el of elements) {
    const left  = ((el.xPercent  ?? 50) / 100) * WIDTH;
    const top   = ((el.yPercent  ?? 50) / 100) * HEIGHT;
    const width = ((el.widthPercent || 15) / 100) * WIDTH;

    if (el.type === 'badge') {
      const rawUrl = badgeUrlOverride || (el as any).badgeUrl || '';
      const badgeImg = imageMap.get(rawUrl);
      if (badgeImg) {
        const height = badgeImg.naturalWidth ? (width / badgeImg.naturalWidth) * badgeImg.naturalHeight : width;
        ctx.drawImage(badgeImg, left - width / 2, top - height / 2, width, height);
      }
      continue;
    }

    if (el.type === 'image') {
      const rawUrl = (el as any).imageUrl || '';
      const customImg = imageMap.get(rawUrl);
      if (customImg) {
        const height = customImg.naturalWidth ? (width / customImg.naturalWidth) * customImg.naturalHeight : width;
        ctx.drawImage(customImg, left - width / 2, top - height / 2, width, height);
      }
      continue;
    }

    // Text (dynamic or static)
    const text = resolveText(el as any, data);
    if (!text) continue;

    const fontSize   = el.fontSizePercent ? (el.fontSizePercent / 100) * HEIGHT : 24;
    const color      = el.color      || '#1e293b';
    const fontWeight = el.fontWeight || 'normal';
    const alignment  = (el.alignment  || 'center') as CanvasTextAlign;
    const fontFamily = el.fontStyle  || 'Montserrat, sans-serif';

    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = alignment;

    const lines = text.split('\n');
    const lineHeight = fontSize * 1.4;
    const totalHeight = lines.length * lineHeight;
    const startY = top - (totalHeight / 2) + (lineHeight / 2);

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], left, startY + (i * lineHeight));
    }
    ctx.restore();
  }

  return new Promise<string>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Canvas export to blob failed'));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}

// ==================== DOWNLOAD HELPER ====================

export async function downloadCertificateAsPng(
  template: CertificateTemplate,
  data: CertificateRenderData,
  filename: string,
  badgeUrlOverride?: string | null,
): Promise<void> {
  const blobUrl = await renderCertificateToBlobUrl(template, data, badgeUrlOverride);

  const a = document.createElement('a');
  a.href     = blobUrl;
  a.download = filename;

  if (typeof a.download === 'undefined' || /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    window.open(blobUrl, '_blank');
  } else {
    a.click();
  }

  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}
