export const isStandardFloppyFormat = (bookFormat) =>
  /^(standard floppy comic|single issue)$/i.test(String(bookFormat || '').trim());

export function validatePageCountForFormat(bookFormat, pageCount) {
  const parsedPageCount = Number(pageCount);
  if (!Number.isInteger(parsedPageCount) || parsedPageCount <= 0) {
    return 'Page count must be a positive whole number.';
  }
  if (isStandardFloppyFormat(bookFormat) && parsedPageCount % 4 !== 0) {
    return 'Standard Floppy page count must be divisible by 4.';
  }
  return '';
}
