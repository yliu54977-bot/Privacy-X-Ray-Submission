import { useEffect, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import type { SessionAction, SessionState } from '../../types';
import { redactImage } from './redactImage';

/** Canvas runs outside A's reducer. Only its accepted Blob receives a preview URL. */
export function usePngPreview(state: SessionState, dispatch: Dispatch<SessionAction>) {
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resource, setResource] = useState<{ blob: Blob; url: string } | null>(null);
  const generation = useRef(0);
  const blob = state.preview?.blob;
  useEffect(() => {
    generation.current++;
    setRendering(false);
    setError(null);
    return () => { generation.current++; };
  }, [state.image?.id, state.revision]);
  useEffect(() => {
    if (!blob) { setResource(null); return; }
    const url = URL.createObjectURL(blob);
    setResource({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  const readyToPreview = !!state.image && state.scan.status !== 'running' &&
    !Object.values(state.decisions).some((d) => d.action === 'REVIEW');
  const current = readyToPreview && state.preview?.imageId === state.image?.id &&
    state.preview?.revision === state.revision;
  async function generate() {
    if (!readyToPreview || !state.image || rendering || current) return;
    const image = state.image, revision = state.revision, request = ++generation.current;
    setRendering(true);
    setError(null);
    try {
      const output = await redactImage(image, state.masks);
      if (generation.current === request) dispatch({ type: 'PREVIEW_COMPLETED', imageId: image.id, revision, blob: output });
    } catch (e) {
      if (generation.current === request) setError(e instanceof Error ? e.message : 'PNG generation failed.');
    } finally {
      if (generation.current === request) setRendering(false);
    }
  }
  return { generate, rendering, error, readyToPreview,
    previewUrl: current && resource && resource.blob === blob ? resource.url : null,
    previewBlob: current ? blob : undefined };
}
