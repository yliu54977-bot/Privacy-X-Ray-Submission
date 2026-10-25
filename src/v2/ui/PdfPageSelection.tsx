import { useId, useState } from 'react';
export function PdfPageSelection({ page, total, disabled, onOpen }: {
  page: number; total: number; disabled: boolean; onOpen(page: number): void;
}) {
  const id = useId();
  const [selected, setSelected] = useState(String(page));
  return <section className="uv-panel" aria-label="PDF page selection">
    <h2>PDF page {page} of {total}</h2>
    <p>Only this selected page is inspected and exported as a PNG. Other pages and the original PDF have not been redacted.</p>
    <label htmlFor={id}>Page number</label>
    <input id={id} type="number" min={1} max={total} value={selected} disabled={disabled}
      onChange={event => setSelected(event.target.value)} />
    <button type="button" disabled={disabled || !Number.isInteger(Number(selected)) || Number(selected) < 1 || Number(selected) > total || Number(selected) === page}
      onClick={() => onOpen(Number(selected))}>Open selected page</button>
  </section>;
}
