import jsQR from 'jsqr';
import type { PrivacyDetector } from '../contracts';
import { privacyKnowledgeBase } from '../privacyKnowledgeBase';

function decodedType(data: string): 'email' | 'phone' | 'api_key' | 'qr_code' {
  const trimmed = data.trim();
  if (/^(?:mailto:)?[\w.%+-]+@[\w.-]+\.[a-z]{2,}$/i.test(trimmed)) return 'email';
  if (/^tel:\+?\d[\d(). -]{8,20}$/i.test(trimmed)) return 'phone';
  if (/^api[ _-]*key\s*[:=]\s*[A-Za-z0-9_-]{12,}$/i.test(trimmed)) return 'api_key';
  return 'qr_code';
}

/** Local QR decoding only; decoded URLs are text and are never opened or fetched. */
export const qrDetector: PrivacyDetector = {
  capability: { id: 'local_qr', family: 'visual_object', name: 'Browser-local QR inspection',
    status: 'implemented', verified: true, requiresImagePixels: true,
    supportedTypeIds: ['qr_code', 'email', 'phone', 'api_key'],
    limitation: 'One readable QR code in images up to four million pixels; other visual content is not inspected.' },
  async detect(input) {
    if (!input.imagePixels) return [];
    if (input.imageWidth * input.imageHeight > 4_000_000) throw new RangeError('QR image exceeds the supported pixel limit.');
    const image = await input.imagePixels.readPixels({ x: 0, y: 0,
      width: input.imageWidth, height: input.imageHeight });
    const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
    if (!code) return [];
    const corners = [code.location.topLeftCorner, code.location.topRightCorner,
      code.location.bottomLeftCorner, code.location.bottomRightCorner];
    const x = Math.max(0, Math.floor(Math.min(...corners.map(point => point.x))));
    const y = Math.max(0, Math.floor(Math.min(...corners.map(point => point.y))));
    const right = Math.min(input.imageWidth, Math.ceil(Math.max(...corners.map(point => point.x))));
    const bottom = Math.min(input.imageHeight, Math.ceil(Math.max(...corners.map(point => point.y))));
    if (right <= x || bottom <= y) return [];
    const typeId = decodedType(code.data);
    const type = privacyKnowledgeBase.type(typeId);
    const box = { x, y, width: right - x, height: bottom - y };
    const id = `qr:${input.imageId}:${x}:${y}`;
    return [{ id, source: { kind: 'image' as const, id: input.imageId }, status: 'KNOWN' as const,
      typeId, categoryIds: type?.categoryIds ?? [],
      label: typeId === 'qr_code' ? 'QR code' : `QR code containing ${type?.name.toLowerCase() ?? 'information'}`,
      value: code.data.length <= 256 ? code.data : `${code.data.slice(0, 256)}…`,
      evidence: [{ id: `${id}:visual`, detectorId: 'local_qr', method: 'visual_object' as const,
        source: 'image' as const,
        explanation: 'A readable QR symbol was decoded locally. The content was not opened or transmitted.',
        boxes: [box] }], boxes: [box],
      classificationEvidence: { kind: 'validated_rule' as const,
        typeId, detectorId: 'local_qr', evidenceId: `${id}:visual` },
      ...(code.data.length > 256 ? { uncertaintyReason: 'The decoded content is longer than the displayed excerpt; inspect the original code.' } : {}),
    }];
  },
};
