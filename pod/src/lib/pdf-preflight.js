import { PDFDocument } from 'pdf-lib';

const POINTS_PER_INCH = 72;
export const REQUIRED_BLEED_INCHES = 0.125;
const SIZE_TOLERANCE_INCHES = 0.04;

const inches = points => Number(points || 0) / POINTS_PER_INCH;
const closeTo = (actual, expected, tolerance = SIZE_TOLERANCE_INCHES) => Math.abs(actual - expected) <= tolerance;
const displaySize = box => `${inches(box.width).toFixed(3)} × ${inches(box.height).toFixed(3)} in`;
const result = (id, label, status, detail) => ({ id, label, status, detail });

const hasExplicitBox = (page, methodName) => {
  try {
    return Boolean(page?.node?.[methodName]?.());
  } catch {
    return false;
  }
};

const orientedBox = (page, box) => {
  const rotation = Number(page.getRotation?.().angle || 0) % 360;
  return Math.abs(rotation) === 90 || Math.abs(rotation) === 270
    ? { ...box, width: box.height, height: box.width }
    : box;
};

export async function inspectInteriorPdf(file, specifications = {}) {
  const expectedWidth = Number(specifications.width);
  const expectedHeight = Number(specifications.height);
  const declaredPageCount = Number(specifications.pageCount);
  const checks = [];

  try {
    const bytes = await file.arrayBuffer();
    const signature = new TextDecoder('latin1').decode(new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength)));
    if (!signature.startsWith('%PDF-')) throw new Error('The selected file does not contain a valid PDF header.');

    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages = pdf.getPages();
    const pageCount = pages.length;
    checks.push(result('opens', 'PDF opens correctly', 'pass', `${file.name} opened successfully.`));
    checks.push(result(
      'page-count-four',
      'Page count is divisible by 4',
      pageCount > 0 && pageCount % 4 === 0 ? 'pass' : 'fail',
      pageCount > 0 && pageCount % 4 === 0
        ? `${pageCount} pages is valid for comic-book binding.`
        : `${pageCount} pages will not bind correctly. Add or remove pages so the total is divisible by 4.`
    ));

    if (Number.isInteger(declaredPageCount) && declaredPageCount > 0) {
      checks.push(result(
        'declared-page-count',
        'PDF matches the submitted page count',
        pageCount === declaredPageCount ? 'pass' : 'fail',
        pageCount === declaredPageCount
          ? `The PDF and submission both contain ${pageCount} pages.`
          : `The submission says ${declaredPageCount} pages, but the PDF contains ${pageCount}. Correct the form or upload the right PDF.`
      ));
    }

    if (!pages.length || !Number.isFinite(expectedWidth) || !Number.isFinite(expectedHeight) || expectedWidth <= 0 || expectedHeight <= 0) {
      checks.push(result('dimensions', 'Trim and single-page dimensions', 'warning', 'Enter a valid trim width and height so page dimensions can be checked.'));
    } else {
      const pageGeometry = pages.map((page, index) => {
        const mediaBox = orientedBox(page, page.getMediaBox());
        const trimBox = orientedBox(page, page.getTrimBox());
        const bleedBox = orientedBox(page, page.getBleedBox());
        return {
          pageNumber: index + 1,
          mediaBox,
          trimBox,
          bleedBox,
          explicitTrim: hasExplicitBox(page, 'TrimBox'),
          explicitBleed: hasExplicitBox(page, 'BleedBox')
        };
      });

      const spreadPages = pageGeometry.filter(({ trimBox, mediaBox, explicitTrim }) => {
        const box = explicitTrim ? trimBox : mediaBox;
        const widthInches = inches(box.width);
        const heightInches = inches(box.height);
        return widthInches >= expectedWidth * 1.55 && closeTo(heightInches, expectedHeight, 0.3);
      });
      checks.push(result(
        'single-pages',
        'Interior is supplied as individual pages',
        spreadPages.length ? 'fail' : 'pass',
        spreadPages.length
          ? `Possible two-page spreads were detected on page${spreadPages.length === 1 ? '' : 's'} ${spreadPages.slice(0, 8).map(item => item.pageNumber).join(', ')}. Export every page separately, including artwork designed as a spread.`
          : 'No oversized two-page spreads were detected.'
      ));

      const wrongTrimPages = pageGeometry.filter(({ trimBox, mediaBox, explicitTrim }) => {
        const box = explicitTrim ? trimBox : mediaBox;
        const widthInches = inches(box.width);
        const heightInches = inches(box.height);
        const directMatch = closeTo(widthInches, expectedWidth) && closeTo(heightInches, expectedHeight);
        const mediaWithBleedMatch = !explicitTrim
          && closeTo(widthInches, expectedWidth + REQUIRED_BLEED_INCHES * 2)
          && closeTo(heightInches, expectedHeight + REQUIRED_BLEED_INCHES * 2);
        return !directMatch && !mediaWithBleedMatch;
      });
      checks.push(result(
        'trim-size',
        `Finished trim matches ${expectedWidth} × ${expectedHeight} in`,
        wrongTrimPages.length ? 'fail' : 'pass',
        wrongTrimPages.length
          ? `Page${wrongTrimPages.length === 1 ? '' : 's'} ${wrongTrimPages.slice(0, 8).map(item => item.pageNumber).join(', ')} do not match the submitted trim size. First detected size: ${displaySize(wrongTrimPages[0].explicitTrim ? wrongTrimPages[0].trimBox : wrongTrimPages[0].mediaBox)}.`
          : 'All PDF pages match the submitted finished size.'
      ));

      const base = pageGeometry[0];
      const mixedSizePages = pageGeometry.filter(({ mediaBox }) =>
        !closeTo(inches(mediaBox.width), inches(base.mediaBox.width))
        || !closeTo(inches(mediaBox.height), inches(base.mediaBox.height))
      );
      checks.push(result(
        'consistent-size',
        'Every interior page uses the same page size',
        mixedSizePages.length ? 'fail' : 'pass',
        mixedSizePages.length
          ? `Page size changes were detected on page${mixedSizePages.length === 1 ? '' : 's'} ${mixedSizePages.slice(0, 8).map(item => item.pageNumber).join(', ')}.`
          : `All ${pageCount} pages use a consistent PDF page size.`
      ));

      const explicitBleedPages = pageGeometry.filter(page => page.explicitTrim && page.explicitBleed);
      const insufficientBleedPages = explicitBleedPages.filter(({ trimBox, bleedBox }) => {
        const left = inches(trimBox.x - bleedBox.x);
        const bottom = inches(trimBox.y - bleedBox.y);
        const right = inches((bleedBox.x + bleedBox.width) - (trimBox.x + trimBox.width));
        const top = inches((bleedBox.y + bleedBox.height) - (trimBox.y + trimBox.height));
        return [left, right, top, bottom].some(value => value < REQUIRED_BLEED_INCHES - SIZE_TOLERANCE_INCHES);
      });
      const pagesWithoutExplicitBoxes = pageGeometry.filter(page => !page.explicitTrim || !page.explicitBleed);
      const mediaShowsNoBleed = pagesWithoutExplicitBoxes.filter(({ mediaBox }) =>
        closeTo(inches(mediaBox.width), expectedWidth)
        && closeTo(inches(mediaBox.height), expectedHeight)
      );

      if (insufficientBleedPages.length || mediaShowsNoBleed.length) {
        const affected = [...new Set([...insufficientBleedPages, ...mediaShowsNoBleed].map(page => page.pageNumber))];
        checks.push(result(
          'bleed',
          `Includes ${REQUIRED_BLEED_INCHES} in bleed on every outer edge`,
          'fail',
          `Required bleed is missing or too small on page${affected.length === 1 ? '' : 's'} ${affected.slice(0, 8).join(', ')}. Extend artwork ${REQUIRED_BLEED_INCHES} in beyond each trim edge.`
        ));
      } else if (pagesWithoutExplicitBoxes.length) {
        checks.push(result(
          'bleed',
          `Includes ${REQUIRED_BLEED_INCHES} in bleed on every outer edge`,
          'warning',
          `The page size appears to include bleed, but ${pagesWithoutExplicitBoxes.length} page${pagesWithoutExplicitBoxes.length === 1 ? '' : 's'} do not contain complete TrimBox and BleedBox settings. Prepress must confirm the artwork reaches the bleed edge.`
        ));
      } else {
        checks.push(result(
          'bleed',
          `Includes ${REQUIRED_BLEED_INCHES} in bleed on every outer edge`,
          'pass',
          `Every page contains TrimBox and BleedBox settings with at least ${REQUIRED_BLEED_INCHES} in bleed.`
        ));
      }
    }

    checks.push(result(
      'manual-production',
      'Human production review still required',
      'manual',
      'Prepress will confirm embedded fonts, CMYK/color setup, image resolution, transparency, and whether artwork truly extends through the bleed.'
    ));

    const failed = checks.filter(check => check.status === 'fail').length;
    const warnings = checks.filter(check => check.status === 'warning').length;
    return {
      fileName: file.name,
      pageCount,
      failed,
      warnings,
      status: failed ? 'changes-required' : 'ready-for-review',
      headline: failed
        ? 'Changes required before this file can go to production'
        : warnings
          ? 'Basic checks passed with items for prepress review'
          : 'Basic file checks passed — ready for prepress review',
      checks
    };
  } catch (error) {
    return {
      fileName: file.name,
      pageCount: null,
      failed: 1,
      warnings: 0,
      status: 'changes-required',
      headline: 'This PDF could not be checked',
      checks: [result('opens', 'PDF opens correctly', 'fail', error.message || 'The file may be damaged, encrypted, or not a valid PDF.')]
    };
  }
}
