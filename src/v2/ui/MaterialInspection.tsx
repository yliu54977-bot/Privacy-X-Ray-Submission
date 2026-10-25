import { identifyMaterials, materialProfiles } from '../detection/materialProfiles';
import type { OcrResult } from '../../types';

export function MaterialInspection({ ocr }: { ocr?: OcrResult | null }) {
  const matched = ocr ? identifyMaterials(ocr.text) : [];
  return <section className="uv-panel" aria-label="Material recognition coverage">
    <h2>What can this upload reveal?</h2>
    <p>{!ocr ? 'Images, document pages and screenshots can contain different kinds of private information.' :
      matched.length ? `Possible material: ${matched.map(item => item.name).join(' · ')}. This is a keyword-based guide, not a verified document classification.` :
      'No material type was established. General text, supported formats, QR, possible barcode regions and available face inspection still apply.'}</p>
    {matched.map(profile => <div key={profile.id}>
      <strong>{profile.name}</strong><p>Checks: {profile.fields}.</p><p className="uv-muted">Still check manually: {profile.gaps}.</p>
    </div>)}
    <details><summary>View supported material families and limits</summary>
      {materialProfiles.map(profile => <p key={profile.id}><strong>{profile.name}:</strong> {profile.fields}. Limits: {profile.gaps}.</p>)}
    </details>
    <p className="uv-muted">No inspection covers every possible upload. Handwriting, signatures, hidden metadata, damaged or tilted barcodes, background clues and unsupported languages may remain. Possible barcode regions are located, not decoded. Nothing here verifies identity or official recipient requirements.</p>
  </section>;
}
