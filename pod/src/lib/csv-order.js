const normalizeHeader = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

export const parseCsvRows = text => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
};

export const csvRowsToOrderLines = text => {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const normalizedHeaders = rows[0].map(normalizeHeader);
  const identifierNames = ['productcode', 'philboid', 'upc', 'isbn', 'ean', 'upcisbn', 'upcisbnean'];
  const quantityNames = ['qty', 'quantity', 'orderqty', 'orderquantity'];
  const identifierIndex = normalizedHeaders.findIndex(header => identifierNames.includes(header));
  const quantityIndex = normalizedHeaders.findIndex(header => quantityNames.includes(header));
  const hasHeader = identifierIndex >= 0 || quantityIndex >= 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows.map((values, index) => ({
    line: index + (hasHeader ? 2 : 1),
    rawCode: values[identifierIndex >= 0 ? identifierIndex : 0] || '',
    qty: values[quantityIndex >= 0 ? quantityIndex : 1] || '',
  })).filter(line => {
    // An order-ready catalog contains every title, but retailers enter a
    // quantity only for the titles they want. Ignore untouched catalog rows.
    if (hasHeader && quantityIndex >= 0 && !String(line.qty).trim()) return false;
    return line.rawCode || line.qty;
  });
};
