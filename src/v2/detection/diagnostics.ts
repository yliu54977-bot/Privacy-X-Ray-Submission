import type { OcrResult } from '../../types';
import type { UniversalDetectionResult } from '../contracts';

/** Test-only visible-text annotations. Never derive these from a user's unannotated image. */
export interface FictionalAnnotation { readonly text: string; readonly typeId?: string }
export interface OcrDiagnostics {
  readonly visibleItems: number | null;
  readonly recognizedItems: number;
  readonly recognitionMisses: number | null;
  readonly classificationMisses: number | null;
  readonly detectedFindings: number;
  readonly unclassifiedFindings: number;
  readonly unassignedOcrWords: number;
  readonly characterAccuracy: number | null;
  readonly wordAccuracy: number | null;
}

const normalized = (text: string) => text.normalize('NFKC').toLocaleLowerCase()
  .replace(/\s+/g, ' ').trim();

function editDistance(a: readonly string[], b: readonly string[]): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length]!;
}

/** Counts only. Neither recognized text nor finding values enter returned diagnostics or logs. */
export function summarizeOcrDiagnostics(ocr: OcrResult,
  result: UniversalDetectionResult,
  fictional?: { readonly annotations: readonly FictionalAnnotation[]; readonly visibleText: string },
): OcrDiagnostics {
  const assigned = new Set(result.findings.flatMap(finding =>
    finding.evidence.flatMap(evidence => evidence.wordIds ?? [])));
  const recognized = normalized(ocr.text);
  const recognizedItems = fictional?.annotations.filter(item =>
    recognized.includes(normalized(item.text))).length ?? ocr.words.length;
  const classified = fictional?.annotations.filter(item => {
    const value = normalized(item.text);
    return result.findings.some(finding => normalized(finding.value ?? '') === value &&
      (!item.typeId || finding.typeId === item.typeId));
  }).length;
  const visible = fictional ? normalized(fictional.visibleText) : null;
  const characterAccuracy = visible === null ? null : Math.max(0, 1 -
    editDistance([...visible], [...recognized]) / Math.max(1, [...visible].length));
  const wordAccuracy = visible === null ? null : Math.max(0, 1 -
    editDistance(visible.split(' '), recognized.split(' ')) /
    Math.max(1, visible.split(' ').length));
  return {
    visibleItems: fictional?.annotations.length ?? null,
    recognizedItems,
    recognitionMisses: fictional ? fictional.annotations.length - recognizedItems : null,
    classificationMisses: fictional ? Math.max(0, recognizedItems - (classified ?? 0)) : null,
    detectedFindings: result.findings.length,
    unclassifiedFindings: result.findings.filter(finding => !finding.typeId).length,
    unassignedOcrWords: ocr.words.filter(word => !assigned.has(word.id)).length,
    characterAccuracy, wordAccuracy,
  };
}
