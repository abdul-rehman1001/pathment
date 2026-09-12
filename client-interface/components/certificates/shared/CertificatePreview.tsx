'use client';

import type { CertificateTemplate } from '@/lib/services/certificates-api';
import { resolveText, type CertificateRenderData } from '@/lib/utils/certificate-renderer';
export type { CertificateRenderData };

interface CertificatePreviewProps {
  template: CertificateTemplate;
  recipientData: CertificateRenderData;
  badgeUrlOverride?: string | null;
  className?: string;
}

// ==================== COMPONENT ====================

export function CertificatePreview({
  template,
  recipientData,
  badgeUrlOverride,
  className,
}: CertificatePreviewProps) {
  const bgImageUrl = template.bgImageUrl || '';
  const logoUrl = template.logoUrl || '';
  const logoConfig = template.logoConfig || { xPercent: 10, yPercent: 10, widthPercent: 15 };
  const elements = Array.isArray(template.config) ? template.config : [];

  return (

    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1200 / 848',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        backgroundImage: bgImageUrl ? `url('${bgImageUrl}')` : undefined,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        fontFamily: 'Montserrat, sans-serif',
        containerType: 'inline-size' as any,
        WebkitFontSmoothing: 'antialiased' as any,
        textRendering: 'geometricPrecision' as any,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Alex+Brush&family=Cinzel:wght@400;700&family=Great+Vibes&family=Montserrat:wght@400;600;700&family=Oswald:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Sacramento&family=Lustria&family=Merriweather&display=swap');`}</style>

      {/* Logo */}
      {logoUrl && (
        <img
          src={logoUrl}
          alt="Logo"
          style={{
            position: 'absolute',
            left: `${logoConfig.xPercent}%`,
            top: `${logoConfig.yPercent}%`,
            width: `${logoConfig.widthPercent}%`,
            height: 'auto',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {/* Elements */}
      {elements.map((el, idx) => {
        const left = el.xPercent ?? 50;
        const top = el.yPercent ?? 50;
        const width = el.widthPercent || 15;

        if (el.type === 'badge') {
          const url = badgeUrlOverride || (el as any).badgeUrl || '';
          if (!url) return null;
          return (
            <div
              key={el.id || idx}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                transform: 'translate(-50%, -50%)',
                boxSizing: 'border-box',
              }}
            >
              <img src={url} alt="Badge" style={{ width: '100%', height: 'auto' }} />
            </div>
          );
        }

        if (el.type === 'image') {
          const url = (el as any).imageUrl || '';
          if (!url) return null;
          return (
            <div
              key={el.id || idx}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: `${top}%`,
                width: `${width}%`,
                transform: 'translate(-50%, -50%)',
                boxSizing: 'border-box',
              }}
            >
              <img src={url} alt="Image" style={{ width: '100%', height: 'auto' }} />
            </div>
          );
        }

        // static / dynamic text
        const text = resolveText(el as any, recipientData);
        const fontSizeNum = el.fontSizePercent ?? 2.0;
        const fontSize = `${(fontSizeNum * 0.7067).toFixed(3)}cqw`;
        const color = el.color || '#1e293b';
        const fontWeight = el.fontWeight || 'normal';
        const alignment = (el.alignment || 'center') as React.CSSProperties['textAlign'];
        const fontFamily = el.fontStyle || 'Montserrat, sans-serif';

        return (
          <div
            key={el.id || idx}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: `${top}%`,
              width: '90%',
              fontFamily,
              fontSize,
              color,
              fontWeight,
              textAlign: alignment,
              transform: 'translate(-50%, -50%)',
              lineHeight: 1.4,
              boxSizing: 'border-box',
              whiteSpace: 'pre-wrap',
            }}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}
