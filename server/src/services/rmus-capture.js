import fs from 'fs';
import path from 'path';
import { rmusConfig } from './rmus-config.js';

async function closeCapturePopups(context, page) {
  const oldCapturePopups = context
    .pages()
    .filter((p) => p !== page && p.url().includes('/RemoteControl/GraphicCaptureImage'));
  for (const oldPopup of oldCapturePopups) {
    await oldPopup.close().catch(() => {});
  }
}

async function getCapturePopupPage(page, context) {
  const { timeouts, featureFlags } = rmusConfig;
  const popup = await page
    .waitForEvent('popup', { timeout: timeouts.popupEventMs ?? 12000 })
    .catch(() => null);
  if (popup) return popup;
  if (featureFlags.enablePopupFallback === false) return null;

  const deadline = Date.now() + (timeouts.popupFallbackLookupMs ?? 20000);
  while (Date.now() < deadline) {
    const capturePage = context.pages().find((p) => p !== page);
    if (capturePage) return capturePage;
    await page.waitForTimeout(250);
  }
  return null;
}

async function waitForLoadingCycleToFinish(page) {
  const { timeouts, selectors } = rmusConfig;
  const firstOverlay = page.locator(selectors.loadingOverlays).first();

  const becameVisible = await firstOverlay
    .waitFor({ state: 'visible', timeout: timeouts.loadingVisibleMs ?? 6000 })
    .then(() => true)
    .catch(() => false);

  if (!becameVisible) return;

  const startedAt = Date.now();
  const hiddenTimeoutMs = timeouts.loadingHiddenMs ?? 45000;
  while (Date.now() - startedAt < hiddenTimeoutMs) {
    const isHidden = await firstOverlay.isHidden().catch(() => true);
    if (isHidden) return;
    await page.waitForTimeout(250);
  }
}

async function waitUntilPopupClosed(context, page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const stillOpen = context
      .pages()
      .some((p) => p !== page && p.url().includes('/RemoteControl/GraphicCaptureImage'));
    if (!stillOpen) return;
    await page.waitForTimeout(200);
  }
}

/**
 * Click #btnGraphicCapture, extract the OSD image from the popup, write to destPath.
 * Ported from TV AUTOMATION triggerRmCapture (without TV remote heartbeat).
 *
 * @returns {Promise<{ saved: boolean, reason: string, destPath?: string }>}
 */
export async function triggerRmCapture(page, context, destPath, options = {}) {
  const { reuseExistingPopup = false } = options;
  const { timeouts, capture, selectors, featureFlags } = rmusConfig;

  if (!reuseExistingPopup) {
    await closeCapturePopups(context, page);
  }

  const captureButton = page.locator(selectors.captureButton).first();
  await captureButton.waitFor({
    state: 'visible',
    timeout: timeouts.popupImageReadyMs ?? 15000,
  });

  let downloadPromise = Promise.resolve(null);
  let popup = context
    .pages()
    .find((p) => p !== page && p.url().includes('/RemoteControl/GraphicCaptureImage'));

  if (!reuseExistingPopup || !popup) {
    const popupPromise = getCapturePopupPage(page, context);
    downloadPromise = context
      .waitForEvent('download', { timeout: timeouts.downloadMs ?? 8000 })
      .catch(() => null);
    await captureButton.evaluate((el) => el.click());
    popup = await popupPromise;
    if (!popup) {
      await waitForLoadingCycleToFinish(page);
      popup = await getCapturePopupPage(page, context);
    }
  }

  let saved = false;
  let reason = 'unknown';
  let writtenPath = destPath;

  if (popup) {
    await popup
      .waitForLoadState('domcontentloaded', { timeout: timeouts.popupDomReadyMs ?? 10000 })
      .catch(() => {});
    await popup.bringToFront().catch(() => {});
    await popup.waitForTimeout(timeouts.popupInitialSettleMs ?? 2000).catch(() => {});

    await popup
      .waitForFunction(
        () => {
          const img = document.querySelector('#previewImg');
          const hasRenderedImg =
            !!img && !!img.getAttribute('src') && img.complete && img.naturalWidth > 0;
          const hasBlobBuffer = !!window.blobImg;
          return hasRenderedImg || hasBlobBuffer;
        },
        { timeout: timeouts.popupImageReadyMs ?? 15000 }
      )
      .catch(() => {});

    const popupEvaluateMs = timeouts.popupEvaluateMs ?? 120000;
    const popupBlobFetchMs = timeouts.popupBlobFetchMs ?? 45000;
    const popupBlobImgWaitMs = timeouts.popupBlobImgWaitMs ?? 12000;
    const popupExtractAttempts = Math.max(1, capture.popupExtractAttempts ?? 6);
    const enablePreviewScreenshotFallback =
      capture.enablePreviewScreenshotFallback === true;

    let captureData = null;
    let previewScreenshotBuf = null;
    let lastExtractFailure = null;

    for (let attempt = 1; attempt <= popupExtractAttempts; attempt += 1) {
      const extractEvaluatePromise = popup.evaluate(
        async ({ fetchMs, blobImgWaitMs }) => {
          async function timedFetch(url, init = {}) {
            try {
              if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
                return await fetch(url, { ...init, signal: AbortSignal.timeout(fetchMs) });
              }
              const ac = new AbortController();
              const timer = setTimeout(() => ac.abort(), fetchMs);
              try {
                return await fetch(url, { ...init, signal: ac.signal });
              } finally {
                clearTimeout(timer);
              }
            } catch {
              return null;
            }
          }

          async function blobToPayload(blob, stage) {
            const mime = blob.type || 'image/png';
            let readerErr = '';
            try {
              const dataUrl = await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onload = () => resolve(fr.result);
                fr.onerror = () => reject(fr.error || new Error('FileReader failed'));
                fr.readAsDataURL(blob);
              });
              const str = String(dataUrl);
              const comma = str.indexOf(',');
              if (comma >= 0) return { ok: true, base64: str.slice(comma + 1), mime };
              readerErr = 'dataUrl-no-comma';
            } catch (e) {
              readerErr = String(e?.message || e);
            }
            try {
              const buffer = await blob.arrayBuffer();
              let binary = '';
              const bytes = new Uint8Array(buffer);
              const sliceLen = 8192;
              for (let i = 0; i < bytes.length; i += sliceLen) {
                const part = bytes.subarray(i, Math.min(i + sliceLen, bytes.length));
                binary += String.fromCharCode.apply(null, part);
              }
              return { ok: true, base64: btoa(binary), mime };
            } catch (e2) {
              return {
                ok: false,
                stage,
                detail: `FileReader:${readerErr};binary:${String(e2?.message || e2)}`,
              };
            }
          }

          async function waitForBlobImg(maxWaitMs) {
            const step = 250;
            const deadline = Date.now() + maxWaitMs;
            while (Date.now() < deadline) {
              if (window.blobImg instanceof Blob) return window.blobImg;
              await new Promise((r) => setTimeout(r, step));
            }
            return window.blobImg instanceof Blob ? window.blobImg : null;
          }

          function payloadFromPreviewCanvas(imgEl) {
            if (!imgEl?.complete || imgEl.naturalWidth <= 0) return null;
            try {
              const cnv = document.createElement('canvas');
              cnv.width = imgEl.naturalWidth;
              cnv.height = imgEl.naturalHeight;
              const ctx = cnv.getContext('2d');
              if (!ctx) return null;
              ctx.drawImage(imgEl, 0, 0);
              const dataUrl = cnv.toDataURL('image/png');
              const comma = dataUrl.indexOf(',');
              if (comma < 0) return null;
              return { base64: dataUrl.slice(comma + 1), mime: 'image/png' };
            } catch {
              return null;
            }
          }

          const imgEl = document.querySelector('#previewImg');
          const directUrl = typeof window.imgUrl === 'string' ? window.imgUrl : '';
          const renderedSource = imgEl?.getAttribute('src') || '';
          const hints = [];

          const rmBlob =
            (await waitForBlobImg(blobImgWaitMs)) ||
            (window.blobImg instanceof Blob ? window.blobImg : null);
          if (rmBlob) {
            const br = await blobToPayload(rmBlob, 'window.blobImg-read');
            if (br.ok) return br;
          }

          const fromCanvas = payloadFromPreviewCanvas(imgEl);
          if (fromCanvas) return { ok: true, base64: fromCanvas.base64, mime: fromCanvas.mime };

          if (!imgEl) hints.push('no-#previewImg');
          if (!rmBlob) hints.push(`no-window.blobImg-after-${blobImgWaitMs}ms`);

          let blob = null;
          if (renderedSource) {
            const resFromPreview = await timedFetch(renderedSource);
            if (resFromPreview?.ok) {
              blob = await resFromPreview.blob().catch(() => null);
            } else {
              hints.push(`preview-fetch:${resFromPreview?.status ?? 'null-or-aborted'}`);
            }
          }

          if (!blob && directUrl) {
            const url = `${directUrl}${directUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
            const resFromEndpoint = await timedFetch(url, { cache: 'no-store' });
            if (resFromEndpoint?.ok) {
              blob = await resFromEndpoint.blob().catch(() => null);
            } else {
              hints.push(`imgUrl-fetch:${resFromEndpoint?.status ?? 'null-or-aborted'}`);
            }
          }

          if (!blob) {
            return {
              ok: false,
              stage: 'no-image-bytes',
              detail: hints.filter(Boolean).join('; ') || undefined,
            };
          }

          return blobToPayload(blob, 'fetched-blob-read');
        },
        { fetchMs: popupBlobFetchMs, blobImgWaitMs: popupBlobImgWaitMs }
      );

      let extractResult;
      try {
        extractResult = await Promise.race([
          extractEvaluatePromise,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`evaluate-timeout-after-${popupEvaluateMs}ms`)),
              popupEvaluateMs
            )
          ),
        ]);
      } catch (e) {
        extractResult = {
          ok: false,
          stage: 'evaluate-exception',
          detail: String(e?.message || e || 'unknown'),
        };
      }

      if (extractResult?.ok === true) {
        captureData = { base64: extractResult.base64, mime: extractResult.mime };
        break;
      }

      lastExtractFailure =
        extractResult && extractResult.ok === false
          ? extractResult
          : { ok: false, stage: 'evaluate-null', detail: 'non-object-result' };

      console.warn(
        `[RMUS] extract attempt ${attempt}/${popupExtractAttempts} → ${lastExtractFailure.stage}` +
          (lastExtractFailure.detail ? `: ${lastExtractFailure.detail}` : '')
      );

      if (enablePreviewScreenshotFallback) {
        try {
          const previewLoc = popup.locator('#previewImg').first();
          await previewLoc.waitFor({
            state: 'visible',
            timeout: timeouts.popupImageReadyMs ?? 15000,
          });
          previewScreenshotBuf = await previewLoc.screenshot({
            type: 'png',
            timeout: timeouts.previewScreenshotMs ?? 30000,
          });
          if (previewScreenshotBuf && previewScreenshotBuf.length > 50) break;
        } catch {
          previewScreenshotBuf = null;
        }
      }

      await popup.waitForTimeout(capture.popupWaitMs ?? 1500).catch(() => {});
    }

    if (captureData?.base64) {
      const extension = captureData.mime.includes('jpeg') ? 'jpg' : 'png';
      writtenPath = destPath.replace(/\.(jpg|jpeg|png|webp)$/i, '') + `.${extension}`;
      fs.mkdirSync(path.dirname(writtenPath), { recursive: true });
      fs.writeFileSync(writtenPath, Buffer.from(captureData.base64, 'base64'));
      saved = true;
      reason = 'saved-from-popup';
      await popup.close().catch(() => {});
      await waitUntilPopupClosed(context, page, timeouts.popupPostCloseMs ?? 5000);
    } else if (previewScreenshotBuf && previewScreenshotBuf.length > 50) {
      writtenPath = destPath.replace(/\.(jpg|jpeg|png|webp)$/i, '') + '.png';
      fs.mkdirSync(path.dirname(writtenPath), { recursive: true });
      fs.writeFileSync(writtenPath, previewScreenshotBuf);
      saved = true;
      reason = 'saved-from-preview-screenshot';
      await popup.close().catch(() => {});
      await waitUntilPopupClosed(context, page, timeouts.popupPostCloseMs ?? 5000);
    } else {
      reason = 'popup-image-extraction-failed';
      if (lastExtractFailure) {
        console.warn(
          `[RMUS] extract exhausted → ${lastExtractFailure.stage}` +
            (lastExtractFailure.detail ? `: ${lastExtractFailure.detail}` : '')
        );
      }
    }
  } else {
    reason = 'no-popup-detected';
  }

  const download = await downloadPromise;
  if (!saved && download) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    await download.saveAs(destPath);
    writtenPath = destPath;
    saved = true;
    reason = 'saved-from-download';
  }

  return { saved, reason, destPath: writtenPath };
}

/**
 * Retry wrapper around triggerRmCapture.
 */
export async function captureWithRetries(page, context, destPath) {
  const { capture } = rmusConfig;
  const attempts = Math.max(1, capture.retryAttempts ?? 3);
  let last = { saved: false, reason: 'not-attempted' };

  for (let i = 1; i <= attempts; i += 1) {
    const reuseExistingPopup =
      last.reason === 'popup-image-extraction-failed' && i > 1;
    last = await triggerRmCapture(page, context, destPath, { reuseExistingPopup });
    if (last.saved) return last;
    console.warn(`[RMUS] capture attempt ${i}/${attempts} failed: ${last.reason}`);
    if (i < attempts) {
      await page.waitForTimeout(capture.retryWaitMs ?? 800);
    }
  }

  return last;
}
