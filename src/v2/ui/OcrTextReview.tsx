import { coveringTextRegions } from '../../features/ocr/textRegions';
import { layoutBox, ocrOrientation, originalLayoutBox } from '../../features/ocr/ocrOrientation';
import { useId, useMemo, useState } from 'react';
import type { OcrResult, PixelRect, RedactionRect } from '../../types';
import type { UniversalFinding } from '../contracts';
import { recognizeContent, selectionBoxes } from '../../features/recognition/content';
import type { ContentSelection } from '../../features/recognition/content';

export interface OcrTextReviewProps {
  allContent?: boolean;
  ocr: OcrResult;
  findings: readonly UniversalFinding[];
  masks: readonly RedactionRect[];
  disabled?: boolean;
  onMask(boxes: readonly PixelRect[]): void;
}

/** A fallback for readable text the classifiers missed; never assigns a privacy type. */
export function OcrTextReview(props: OcrTextReviewProps) {
  return props.allContent ? <AllTextReview {...props} /> : <UnclassifiedTextReview {...props} />;
}
function UnclassifiedTextReview({ ocr, findings, masks, disabled, onMask }: OcrTextReviewProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const rotation = ocrOrientation(ocr);
  const quarterTurn = rotation === 'clockwise' || rotation === 'counterclockwise';
  const layoutWidth = quarterTurn ? ocr.height : ocr.width;
  const layoutHeight = quarterTurn ? ocr.width : ocr.height;
  const inLayout = (box: PixelRect) => layoutBox(box, ocr.width, ocr.height, rotation);
  const assigned = new Set(findings.flatMap(finding => finding.evidence.flatMap(item => item.wordIds ?? [])));
  const lines = new Map<string, typeof ocr.words[number][]>();
  for (const word of ocr.words) {
    if (assigned.has(word.id)) continue;
    const { x, y, width, height } = word.box;
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
      x + width > ocr.width || y + height > ocr.height) continue;
    const line = lines.get(word.lineId) ?? [];
    line.push(word);
    lines.set(word.lineId, line);
  }
  const rows = [...lines.entries()].map(([key, words]) => {
    const ordered = [...words].sort((a, b) => inLayout(a.box).x - inLayout(b.box).x);
    return { key, words: ordered, text: ordered.map(word => word.text).join(' ') };
  }).sort((a, b) => inLayout(a.words[0]!.box).y - inLayout(b.words[0]!.box).y)
    .filter(row => row.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  const current = Math.min(page, pages - 1);
  const covered = (box: PixelRect) => masks.some(mask => mask.imageId === ocr.imageId && mask.shouldRedact &&
    mask.x <= box.x && mask.y <= box.y && mask.x + mask.width >= box.x + box.width &&
    mask.y + mask.height >= box.y + box.height);
  return <details className="uv-panel" open={findings.length === 0} aria-label="Recognized text review">
    <summary>Check text the privacy scan did not classify ({lines.size} lines)</summary>
    <p>The scanner read {ocr.words.length} words. These words have no linked finding; they are not automatically safe.
      Check the original image. Names, identifiers and portraits can be missed.</p>
    {ocr.words.length === 0 ? <p role="status">No readable text was found. Try a sharper, upright image or use Add Mask to cover information manually.</p> : <>
      <label htmlFor={id}>Search recognized text</label>
      <input id={id} type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
      <p role="status">{rows.length} matching lines. Text and searches stay in this browser session.</p>
      {rows.slice(current * 8, current * 8 + 8).map((row, index) => {
        const remaining = row.words.filter(word => !covered(word.box));
        const confidence = row.words.reduce((sum, word) => sum + word.confidence, 0) / row.words.length;
        return <article key={row.key} aria-label={`Unclassified text line ${current * 8 + index + 1}`}>
          <p style={{ overflowWrap: 'anywhere' }}>{row.text}</p>
          <p className="uv-muted">{confidence < 0.7 ? 'Text may be misread. Check the original.' : 'Recognized text; privacy category not established.'}</p>
          <button type="button" disabled={disabled || !remaining.length}
            onClick={() => onMask(coveringTextRegions(remaining.map(word => inLayout(word.box)), layoutWidth, layoutHeight)
              .map(box => originalLayoutBox(box, layoutWidth, layoutHeight, rotation)))}>{remaining.length ? 'Mask this text' : 'Text is covered'}</button>
        </article>;
      })}
      {pages > 1 && <nav aria-label="Recognized text pages">
        <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous text</button>
        <span> Page {current + 1} of {pages} </span>
        <button type="button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next text</button>
      </nav>}
    </>}
  </details>;
}


/** Reuses B's review panel, pagination and manual-mask callback. No policy dependency. */
function AllTextReview({ ocr, masks, disabled, onMask }: OcrTextReviewProps) {
  const searchId = useId();
  const content = useMemo(() => recognizeContent(ocr), [ocr]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<'word' | 'line' | 'group'>('line');
  const items = kind === 'word' ? content.words : kind === 'line' ? content.lines : content.groups;
  const matching = items.filter(item => item.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const pages = Math.max(1, Math.ceil(matching.length / 8));
  const current = Math.min(page, pages - 1);
  const boxesFor = (id: string) => selectionBoxes(content, [{ kind, id } satisfies ContentSelection], ocr.imageId, masks);
  return <details className="uv-panel" open aria-label="Recognized text review">
    <summary>All recognized text ({content.words.length} words)</summary>
    <p>Select any text, whether or not a privacy category was found. Recognition can miss or misread content. Check the whole image. Text masks include a safety margin; inspect and adjust their edges before exporting.</p>
    {!content.words.length ? <p role="status">No readable text was found. Try a sharper, upright image or draw masks manually.</p> : <>
      <label className="simple-search" htmlFor={searchId}>Search recognized text
      <input id={searchId} type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <fieldset className="simple-text-granularity"><legend>Select text by</legend>{(['word', 'line', 'group'] as const).map(mode =>
        <label key={mode}><input type="radio" name={`${searchId}-kind`} checked={kind === mode}
          onChange={() => { setKind(mode); setPage(0); }} />{mode === 'word' ? 'Words' : mode === 'line' ? 'Lines' : 'Text groups'}</label>)}</fieldset>
      <p role="status">{matching.length} matching {kind === 'word' ? 'words' : kind === 'line' ? 'lines' : 'groups'}. Text stays in this browser session.</p>
      {matching.slice(current * 8, current * 8 + 8).map((item, index) => {
        const boxes = boxesFor(item.id);
        return <article key={item.id} aria-label={`Recognized ${kind} ${current * 8 + index + 1}`}>
          <p style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{item.text}</p>
          {item.uncertain && <p className="uv-muted">Text or its location may be inaccurate. Check the original image and adjust the mask.</p>}
          {'geometryUncertain' in item && item.geometryUncertain && <p className="uv-muted">This word’s box may miss strokes. Mask the complete line or draw a larger mask.</p>}
          <button className="app-button" type="button" disabled={disabled || !boxes.length} onClick={() => onMask(boxes)}>
            {boxes.length ? `Mask this ${kind}` : 'Text is covered'}</button>
        </article>;
      })}
      {pages > 1 && <nav aria-label="Recognized text pages">
        <button className="app-button" type="button" disabled={!current} onClick={() => setPage(current - 1)}>Previous text</button>
        <span> Page {current + 1} of {pages} </span>
        <button className="app-button" type="button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next text</button>
      </nav>}
    </>}
  </details>;
}
