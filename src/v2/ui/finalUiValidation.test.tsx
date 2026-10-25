// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BeforeAfterComparison } from "./BeforeAfterComparison";
import { FinalImageReview } from "./FinalImageReview";
import { RedactionEditor } from "../../features/editor";
import type { LocalImage, RedactionRect } from "../../types";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
function click(element: Element) {
  act(() => {
    (element as HTMLElement).click();
  });
}
function button(text: string) {
  const found = Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!found) throw Error(`Missing test button: ${text}`);
  return found;
}
function load(image: HTMLImageElement, width = 1000, height = 500) {
  Object.defineProperties(image, {
    naturalWidth: { value: width, configurable: true },
    naturalHeight: { value: height, configurable: true },
  });
  act(() => image.dispatchEvent(new Event("load")));
}
function pointer(
  target: Element,
  type: string,
  id: number,
  x: number,
  y: number,
  primary = true,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    pointerType: { value: "touch" },
    isPrimary: { value: primary },
  });
  act(() => target.dispatchEvent(event));
}
function capture(element: Element) {
  const ids = new Set<number>();
  Object.assign(element, {
    setPointerCapture: (id: number) => ids.add(id),
    hasPointerCapture: (id: number) => ids.has(id),
    releasePointerCapture: (id: number) => ids.delete(id),
  });
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 0,
      width: 500,
      height: 250,
      right: 500,
      bottom: 250,
    }),
  });
}
function images() {
  return Array.from(host.querySelectorAll("img"));
}
function reviewCheckbox() {
  return host.querySelector<HTMLInputElement>("input[type=checkbox]")!;
}
const preview = {
  url: "blob:png-1",
  imageId: "image",
  revision: 1,
  width: 1000,
  height: 500,
};

describe("comparison loading, cancellation and review acknowledgement", () => {
  it.each(["png-first", "original-first"])(
    "requires both matching images before readiness: %s",
    (order) => {
      const ready = vi.fn();
      act(() =>
        root.render(
          <BeforeAfterComparison
            originalUrl="blob:original"
            redactedUrl="blob:png"
            width={1000}
            height={500}
            onReady={ready}
            onError={() => {}}
          />,
        ),
      );
      const [original, png] = images();
      load(order === "png-first" ? png : original);
      expect(ready).not.toHaveBeenCalled();
      load(order === "png-first" ? original : png);
      expect(ready).toHaveBeenCalledTimes(1);
      load(png);
      expect(ready).toHaveBeenCalledTimes(1);
    },
  );
  it("does not accept a valid PNG after a mismatching original failed", () => {
    const ready = vi.fn(),
      error = vi.fn();
    act(() =>
      root.render(
        <BeforeAfterComparison
          originalUrl="blob:original"
          redactedUrl="blob:png"
          width={1000}
          height={500}
          onReady={ready}
          onError={error}
        />,
      ),
    );
    load(images()[0], 999, 500);
    load(images()[1]);
    expect(error).toHaveBeenCalledTimes(1);
    expect(ready).not.toHaveBeenCalled();
  });
  it("ignores secondary touch and recovers after pointer cancellation", () => {
    act(() =>
      root.render(
        <BeforeAfterComparison
          originalUrl="blob:original"
          redactedUrl="blob:png"
          width={1000}
          height={500}
          onReady={() => {}}
          onError={() => {}}
        />,
      ),
    );
    const stage = host.querySelector(".uv-comparison-stage")!;
    capture(stage);
    const range = host.querySelector<HTMLInputElement>("input[type=range]")!;
    pointer(stage, "pointerdown", 1, 100, 0);
    expect(range.value).toBe("20");
    pointer(stage, "pointerdown", 2, 450, 0, false);
    pointer(stage, "pointermove", 2, 400, 0, false);
    pointer(stage, "pointerup", 2, 400, 0, false);
    expect(range.value).toBe("20");
    pointer(stage, "pointermove", 1, 250, 0);
    expect(range.value).toBe("50");
    pointer(stage, "pointercancel", 1, 250, 0);
    pointer(stage, "pointermove", 1, 450, 0);
    expect(range.value).toBe("50");
    pointer(stage, "pointerdown", 3, 375, 0);
    pointer(stage, "pointerup", 3, 400, 0);
    expect(range.value).toBe("80");
  });
  it("reloads failed image presentation without re-encoding or calling the exporter", () => {
    const generate = vi.fn(),
      download = vi.fn();
    act(() =>
      root.render(
        <FinalImageReview
          imageId="image"
          revision={1}
          ready
          originalUrl="blob:original"
          preview={preview}
          onPreview={generate}
          onDownload={download}
        />,
      ),
    );
    act(() => images()[0].dispatchEvent(new Event("error")));
    expect(reviewCheckbox().disabled).toBe(true);
    expect(button("Reload PNG preview").disabled).toBe(false);
    const old = images()[0];
    click(button("Reload PNG preview"));
    expect(images()[0]).not.toBe(old);
    expect(generate).not.toHaveBeenCalled();
    load(images()[0]);
    load(images()[1]);
    expect(reviewCheckbox().disabled).toBe(false);
    click(reviewCheckbox());
    click(button("Download reviewed PNG"));
    expect(download).toHaveBeenCalledTimes(1);
  });
  it("resets acknowledgement on a new revision and ignores old detached load/error events", () => {
    const render = (revision: number) =>
      act(() =>
        root.render(
          <FinalImageReview
            imageId="image"
            revision={revision}
            ready
            originalUrl="blob:original"
            preview={{ ...preview, revision }}
            onPreview={() => {}}
            onDownload={() => {}}
          />,
        ),
      );
    render(1);
    load(images()[0]);
    load(images()[1]);
    click(reviewCheckbox());
    expect(button("Download reviewed PNG").disabled).toBe(false);
    const old = images()[1];
    render(2);
    expect(reviewCheckbox().checked).toBe(false);
    expect(reviewCheckbox().disabled).toBe(true);
    load(images()[0]);
    load(images()[1]);
    act(() => old.dispatchEvent(new Event("error")));
    expect(reviewCheckbox().disabled).toBe(false);
    expect(button("Download reviewed PNG").disabled).toBe(true);
  });
  it("resets acknowledgement when readiness is withdrawn even if the same snapshot is restored", () => {
    const render = (ready: boolean) =>
      act(() =>
        root.render(
          <FinalImageReview
            imageId="image"
            revision={1}
            ready={ready}
            originalUrl="blob:original"
            preview={preview}
            onPreview={() => {}}
            onDownload={() => {}}
          />,
        ),
      );
    render(true);
    load(images()[0]);
    load(images()[1]);
    click(reviewCheckbox());
    render(false);
    expect(images()).toHaveLength(0);
    render(true);
    load(images()[0]);
    load(images()[1]);
    expect(reviewCheckbox().checked).toBe(false);
    expect(button("Download reviewed PNG").disabled).toBe(true);
  });
});

describe("editor gesture ownership", () => {
  const image: LocalImage = {
    id: "image",
    file: {} as File,
    width: 1000,
    height: 500,
    mimeType: "image/png",
    previewUrl: "blob:image",
  };
  const mask: RedactionRect = {
    id: "manual",
    imageId: "image",
    source: "manual",
    shouldRedact: true,
    x: 100,
    y: 100,
    width: 200,
    height: 100,
  };
  function setup() {
    const update = vi.fn(),
      add = vi.fn();
    const render = (input = image, disabled = false) =>
      act(() =>
        root.render(
          <RedactionEditor
            image={input}
            masks={[mask]}
            highlights={[]}
            disabled={disabled}
            onAddManual={add}
            onUpdateMask={update}
            onDeleteMask={() => {}}
          />,
        ),
      );
    render();
    load(images()[0]);
    click(button("Select / Edit"));
    const svg = host.querySelector("svg")!;
    capture(svg);
    return {
      update,
      add,
      render,
      svg,
      mask: host.querySelector('[data-mask="manual"]')!,
    };
  }
  it("selects a region without committing a no-op edit or invalidating preview", () => {
    const s = setup();
    pointer(s.mask, "pointerdown", 1, 75, 75);
    pointer(s.svg, "pointerup", 1, 75, 75);
    expect(s.update).not.toHaveBeenCalled();
    expect(button("Delete Selected").disabled).toBe(false);
  });
  it("does not let a second finger finish or replace a primary drag", () => {
    const s = setup();
    pointer(s.mask, "pointerdown", 1, 75, 75);
    pointer(s.mask, "pointerdown", 2, 150, 100, false);
    pointer(s.svg, "pointerup", 2, 150, 100, false);
    expect(s.update).not.toHaveBeenCalled();
    pointer(s.svg, "pointermove", 1, 125, 100);
    pointer(s.svg, "pointerup", 1, 125, 100);
    expect(s.update).toHaveBeenCalledWith("image", "manual", {
      x: 200,
      y: 150,
      width: 200,
      height: 100,
    });
    expect(s.update).toHaveBeenCalledTimes(1);
  });
  it("cancels a gesture on disable and permits the next gesture after re-enabling", () => {
    const s = setup();
    pointer(s.mask, "pointerdown", 1, 75, 75);
    s.render(image, true);
    pointer(s.svg, "pointerup", 1, 125, 100);
    expect(s.update).not.toHaveBeenCalled();
    s.render();
    pointer(s.mask, "pointerdown", 3, 75, 75);
    pointer(s.svg, "pointerup", 3, 100, 75);
    expect(s.update).toHaveBeenCalledTimes(1);
  });
  it("discards an old-image gesture on image replacement", () => {
    const s = setup();
    pointer(s.mask, "pointerdown", 1, 75, 75);
    s.render({ ...image, id: "replacement", previewUrl: "blob:replacement" });
    pointer(s.svg, "pointerup", 1, 125, 100);
    expect(s.update).not.toHaveBeenCalled();
  });
});

describe("single-image review fallback", () => {
  it("rejects PNG dimensions that do not match the accepted snapshot", () => {
    act(() =>
      root.render(
        <FinalImageReview
          imageId="image"
          revision={1}
          ready
          preview={preview}
          onPreview={() => {}}
          onDownload={() => {}}
        />,
      ),
    );
    load(images()[0], 999, 500);
    expect(reviewCheckbox().disabled).toBe(true);
    expect(button("Reload PNG preview").disabled).toBe(false);
  });
});
