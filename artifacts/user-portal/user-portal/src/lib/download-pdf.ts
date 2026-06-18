/**
 * Cross-platform PDF download helper.
 *
 * Problem: On iOS Safari, pdf.save() silently fails because programmatic
 * anchor.click() is blocked after async/await breaks the user-gesture chain.
 * On Android the same thing can happen in some browsers.
 *
 * Strategy:
 *  - Capture the element as a JPEG via html-to-image (skipFonts avoids
 *    cross-origin font-fetch failures on mobile).
 *  - Build a jsPDF document sized to the image.
 *  - iOS → open the PDF blob URL in a new tab (Share sheet lets user save).
 *  - Android / Desktop → programmatic anchor.click() download.
 */

export interface PdfOptions {
  /** Background fill colour for the captured element (default: "#ffffff") */
  backgroundColor?: string;
  /** Device-pixel ratio for the capture (default: 2.5 — high-DPI for sharp text) */
  pixelRatio?: number;
  /** JPEG quality 0-1 (default: 0.95 — near-lossless for premium output) */
  quality?: number;
}

/** Returns true when running inside iOS Safari / WKWebView. */
function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as Record<string, unknown>).MSStream
  );
}

/**
 * Capture `element` as a JPEG and save it as a PDF file.
 *
 * @param element   The DOM node to capture.
 * @param filename  Suggested filename including `.pdf` extension.
 * @param options   Optional overrides for quality / background colour.
 */
export async function downloadElementAsPdf(
  element: HTMLElement,
  filename: string,
  options: PdfOptions = {}
): Promise<void> {
  const { backgroundColor = "#ffffff", pixelRatio = 2.5, quality = 0.95 } = options;

  const { toJpeg } = await import("html-to-image");
  const { default: jsPDF } = await import("jspdf");

  const dataUrl = await toJpeg(element, {
    cacheBust: true,
    pixelRatio,
    quality,
    backgroundColor,
    // Skip font embedding — avoids cross-origin fetch failures on mobile
    // networks; system fonts are used as fallback in the rendered output.
    skipFonts: true,
  });

  // Measure real pixel dimensions so the PDF page fits exactly.
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>(resolve => { img.onload = () => resolve(); });

  const w = img.naturalWidth  / pixelRatio;
  const h = img.naturalHeight / pixelRatio;

  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [w, h] });
  pdf.addImage(dataUrl, "JPEG", 0, 0, w, h);

  if (isIOS()) {
    // iOS Safari blocks programmatic downloads; open blob URL in new tab so
    // the user can save via the Share sheet → Save to Files.
    const blobUrl = pdf.output("bloburl") as unknown as string;
    const win = window.open(blobUrl, "_blank");
    if (!win) {
      // Pop-up was blocked — navigate the current tab instead.
      window.location.href = blobUrl;
    }
  } else {
    // Android Chrome + all desktop browsers support anchor-click download.
    const blob    = pdf.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    a.href         = blobUrl;
    a.download     = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  }
}
