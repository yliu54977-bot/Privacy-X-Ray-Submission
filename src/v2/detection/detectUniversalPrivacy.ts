import { coveringTextRegions } from '../../features/ocr/textRegions';
import { ocrOrientation, layoutBox, originalLayoutBox } from '../../features/ocr/ocrOrientation';
import type { DetectionFamily, DetectionInput, DetectorCapability, PrivacyDetector,
  UniversalDetectionResult, UniversalFinding } from '../contracts';
import { privacyKnowledgeBase } from '../privacyKnowledgeBase';
import { labeledSecretDetector, v1OcrDetector } from './ocrDetectors';
import { verificationCodeDetector } from './verificationCodeDetector';
import { studentCardDetector } from './studentCardDetector';
import { documentPatternDetector } from './documentPatterns';
import { localFaceDetector } from './faceDetector';
import { generalizedOcrDetector } from './generalizedOcrDetector';
import { qrDetector } from './qrDetector';
import { barcodeDetector } from './barcodeDetector';

const families: readonly DetectionFamily[] = ['pattern', 'label_context', 'nlp_entity',
  'visual_object', 'document_structure', 'metadata', 'relationship'];
const activeDetectors: readonly PrivacyDetector[] = [v1OcrDetector, labeledSecretDetector,
  generalizedOcrDetector, qrDetector, barcodeDetector, verificationCodeDetector, studentCardDetector, documentPatternDetector, localFaceDetector];

/** Describes working local detectors and explicitly unsupported detector families. */
export function detectorCapabilities(detectors: readonly PrivacyDetector[] = activeDetectors):
  readonly DetectorCapability[] {
  const supported = detectors.map(detector => detector.capability);
  return [...supported, ...families.filter(family => !supported.some(item => item.family === family))
    .map(family => ({ id: `${family}_not_implemented`, family,
      name: `${family.replaceAll('_', ' ')} inspection`, status: 'unsupported' as const,
      verified: false, supportedTypeIds: [],
      limitation: 'This content is not inspected by the current application.' }))];
}

function validBox(box: { x: number; y: number; width: number; height: number }, input: DetectionInput): boolean {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
    box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 &&
    box.x + box.width <= input.imageWidth && box.y + box.height <= input.imageHeight;
}

function safeFinding(finding: UniversalFinding, input: DetectionInput,
  detector: PrivacyDetector): UniversalFinding | null {
  if (finding.source.kind !== 'image' || finding.source.id !== input.imageId ||
      !finding.id || !finding.evidence?.length) return null;
  const candidateType = finding.typeId ? privacyKnowledgeBase.type(finding.typeId) : undefined;
  const type = candidateType?.validationStatus === 'verified' ? candidateType : undefined;
  const validBoxes = finding.boxes?.filter(box => validBox(box, input));
  const lostLocation = !!finding.boxes?.some(box => !validBox(box, input)) ||
    finding.evidence.some(item => item.boxes?.some(box => !validBox(box, input)));
  const evidence = finding.evidence.map(item => ({ ...item,
    ...(item.boxes ? { boxes: item.boxes.filter(box => validBox(box, input)) } : {}) }));
  const assertion = finding.classificationEvidence;
  const validatedAssertion = !!assertion && assertion.kind === 'validated_rule' &&
    assertion.typeId === type?.id && assertion.detectorId === detector.capability.id &&
    detector.capability.supportedTypeIds.includes(assertion.typeId) &&
    evidence.some(item => item.id === assertion.evidenceId &&
      item.detectorId === assertion.detectorId);
  return {
    ...finding,
    status: !type ? 'UNKNOWN_POTENTIALLY_SENSITIVE' : lostLocation ? 'UNCERTAIN' : finding.status,
    ...(type ? {} : { typeId: undefined }),
    categoryIds: finding.categoryIds.filter(id => privacyKnowledgeBase.category(id)),
    evidence,
    classificationEvidence: validatedAssertion ? assertion : undefined,
    ...(validBoxes?.length ? { boxes: validBoxes } : { boxes: undefined }),
    ...(lostLocation ? { uncertaintyReason: 'The OCR location was outside the image; locate this information manually.' } : {}),
  };
}

function sameLocatedValue(a: UniversalFinding, b: UniversalFinding): boolean {
  if (!a.value?.trim() || a.value.replace(/\s/g, '') !== b.value?.replace(/\s/g, '')) return false;
  return !!a.boxes?.some(first => b.boxes?.some(second =>
    first.x < second.x + second.width && second.x < first.x + first.width &&
    first.y < second.y + second.height && second.y < first.y + first.height));
}

/** Runs only registered local detectors. Failures become coverage warnings, never safety claims. */
export async function detectUniversalPrivacy(
  input: DetectionInput,
  detectors: readonly PrivacyDetector[] = activeDetectors,
): Promise<UniversalDetectionResult> {
  if (!input.imageId || !Number.isFinite(input.imageWidth) || !Number.isFinite(input.imageHeight) ||
      input.imageWidth <= 0 || input.imageHeight <= 0 ||
      (input.imagePixels && (input.imagePixels.imageId !== input.imageId ||
        input.imagePixels.width !== input.imageWidth || input.imagePixels.height !== input.imageHeight)) ||
      (input.ocr && (input.ocr.imageId !== input.imageId ||
        input.ocr.width !== input.imageWidth || input.ocr.height !== input.imageHeight)))
    throw new TypeError('Detection input does not match one valid image.');
  const ids = new Set<string>();
  for (const detector of detectors) {
    const capability = detector.capability;
    if (ids.has(capability.id) || capability.status !== 'implemented' || !capability.verified ||
        capability.supportedTypeIds.some(id => privacyKnowledgeBase.type(id)?.validationStatus !== 'verified'))
      throw new TypeError('Detector registration is invalid.');
    ids.add(capability.id);
  }
  const warnings: string[] = [];
  const findings: UniversalFinding[] = [];
  const completedFamilies = new Set<DetectionFamily>();
  for (const detector of detectors) {
    const capability = detector.capability;
    if (!input.ocr && !capability.requiresImagePixels) continue;
    if (capability.requiresImagePixels && !input.imagePixels) continue;
    try {
      const rotation=capability.requiresImagePixels?'none':ocrOrientation(input.ocr);
      const quarter=rotation==='clockwise'||rotation==='counterclockwise';
      const width=quarter?input.imageHeight:input.imageWidth,height=quarter?input.imageWidth:input.imageHeight;
      const scopedInput = capability.requiresImagePixels ? input : { ...input, imagePixels: undefined,
        ...(rotation!=='none'&&input.ocr?{imageWidth:width,imageHeight:height,ocr:{...input.ocr,width,height,
          words:input.ocr.words.map(word=>({...word,box:layoutBox(word.box,input.imageWidth,input.imageHeight,rotation)}))}}:{}) };
      for (const candidate of await detector.detect(scopedInput)) {
        const restore=(box:NonNullable<UniversalFinding['boxes']>[number])=>originalLayoutBox(box,width,height,rotation);
        const located = !capability.requiresImagePixels && candidate.boxes ? { ...candidate,
          boxes: [...coveringTextRegions(candidate.boxes, width, height),
            ...candidate.boxes.filter(box => !validBox(box, scopedInput))] } : candidate;
        const original=rotation==='none'?located:{...located,boxes:located.boxes?.map(restore),
          evidence:candidate.evidence.map(e=>({...e,boxes:e.boxes?.map(restore)}))};
        const finding = safeFinding(original, input, detector);
        if (finding && !findings.some(item => item.id === finding.id)) findings.push(finding);
      }
      completedFamilies.add(capability.family);
    } catch {
      warnings.push(`${capability.name} could not complete. ${capability.limitation} Inspect the image manually.`);
    }
  }
  if (input.ocr) warnings.push('OCR may miss or misread visible information; inspect the whole image.');
  const uninspected = families.filter(family => !completedFamilies.has(family));
  if (uninspected.length)
    warnings.push(`Not inspected: ${uninspected.map(family => family.replaceAll('_', ' ')).join(', ')}.`);
  // A full address block replaces overlapping first-line/street/postcode candidates.
  // Word identity is required, so separate addresses with the same text stay separate.
  const addressCandidate = (finding: UniversalFinding) => /address|postal code/i.test(finding.label) &&
    finding.categoryIds.some(category => category === 'contact_information' || category === 'geographic_locations');
  const complete = findings.filter(candidate => {
    if (!addressCandidate(candidate)) return true;
    const words = new Set(candidate.evidence.flatMap(item => item.wordIds ?? []));
    if (!words.size) return true;
    return !findings.some(other => {
      if (other === candidate || !/postal address/i.test(other.label)) return false;
      const all = new Set(other.evidence.flatMap(item => item.wordIds ?? []));
      return all.size > words.size && [...words].every(id => all.has(id));
    });
  });
  // The older extractor deliberately emits REVIEW candidates for shipping/billing addresses.
  // Replace only exact overlapping candidates when an explicitly labeled subtype is found.
  const resolved = complete.filter(candidate =>
    candidate.status !== 'UNKNOWN_POTENTIALLY_SENSITIVE' ||
    !complete.some(other => other.typeId && sameLocatedValue(candidate, other)));
  const unique: UniversalFinding[] = [];
  for (const finding of resolved) {
    const existing = unique.findIndex(item => item.status === 'UNKNOWN_POTENTIALLY_SENSITIVE' &&
      finding.status === 'UNKNOWN_POTENTIALLY_SENSITIVE' && sameLocatedValue(item, finding));
    if (existing < 0) unique.push(finding);
    else unique[existing] = { ...unique[existing]!,
      categoryIds: [...new Set([...unique[existing]!.categoryIds, ...finding.categoryIds])],
      evidence: [...unique[existing]!.evidence, ...finding.evidence] };
  }
  return {
    source: { kind: 'image', id: input.imageId }, findings: unique,
    coverage: {
      source: { kind: 'image', id: input.imageId }, warnings,
      areas: families.map(family => ({ family,
        status: completedFamilies.has(family) ? 'partial' as const : 'uninspected' as const,
        explanation: completedFamilies.has(family)
          ? 'Only supported evidence patterns were checked; other content may remain.'
          : 'No verified detector inspected this content.',
      })),
    },
  };
}
