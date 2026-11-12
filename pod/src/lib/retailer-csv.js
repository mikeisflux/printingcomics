const csvEscape = value => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildLiveRetailerCatalogCycles = titles => {
  const cycles = new Map();
  (titles || []).forEach(title => {
    if (!title.cycleId) return;
    const current = cycles.get(title.cycleId) || {
      cycleId: title.cycleId,
      cycleName: title.catalogCycleName || 'Published catalog',
      catalogDate: title.catalogDate || '',
      focDate: title.focDate || '',
      releaseDate: title.releaseDate || '',
      status: title.catalogCycleStatus || (title.focLocked ? 'FOC Locked' : 'Open for Retailer Ordering'),
      retailerOpen: !title.focLocked,
      downloadEnabled: true,
      retailerDownloadEnabled: true,
      catalogPublicationVersion: Number(title.catalogPublicationVersion) || 1,
      catalogPublishedAt: title.catalogPublishedAt || title.publishedAt || '',
      catalogPdfUrl: title.catalogPdfUrl || '',
      orderingStatus: title.focLocked ? 'FOC Locked' : 'Open for Retailer Ordering',
      titleCount: 0,
      lastUpdated: title.catalogPublishedAt || title.publishedAt || new Date().toISOString()
    };
    current.titleCount += 1;
    current.retailerOpen = current.retailerOpen || !title.focLocked;
    current.orderingStatus = current.retailerOpen ? 'Open for Retailer Ordering' : 'FOC Locked';
    cycles.set(title.cycleId, current);
  });
  return [...cycles.values()].sort((a, b) => String(b.catalogDate).localeCompare(String(a.catalogDate)));
};

export const generateLiveRetailerCatalogCsv = ({ cycleId, titles, tier = 'Tier I', discount = 0.4 }) => {
  const cycleTitles = (titles || []).filter(title => title.cycleId === cycleId);
  if (!cycleTitles.length) throw new Error('No published titles are available for that catalog.');
  const first = cycleTitles[0];
  const headers = [
    'Quantity','PHILBO ID','Publisher','UPC / Barcode / EAN','Title','Series Name','Issue Number','Variant Number','Cover Description',
    'Catalog Release Date','FOC Date','In-Store Date','MSRP','Retailer Wholesale Price','Retailer Discount Tier',
    'Book Format','Series Type','Genre','Series Frequency','Language','Age Rating','Page Count','Color or Black and White',
    'Writer','Artist','Cover Artist','Brief Synopsis','Full Description','BISAC Code 1','BISAC Code 2','BISAC Code 3',
    'Reprint','Printing Number','Width','Height','Weight','Available for Reorder','Downloadable Cover Image URL',
    'Incentive Ratio','Incentive Rules','Orderable','Ordering Status','FOC Lock Status'
  ];
  const rows = cycleTitles.map(title => {
    const msrp = Number(title.msrp || 0);
    return [
      '', title.philboId, title.publisherName, title.barcode, title.title, title.seriesName, title.issueNumber,
      title.variantNumber, title.coverDescription, title.catalogDate, title.focDate, title.releaseDate,
      msrp.toFixed(2), (msrp * (1 - Number(discount || 0))).toFixed(2), tier,
      title.bookFormat, title.seriesType, title.genre, title.seriesFrequency, title.language, title.ageRange,
      title.pageCount, title.colorProfile, title.writer, title.artist, title.coverArtist, title.briefSynopsis,
      title.description, title.bisac1, title.bisac2, title.bisac3, title.reprint, title.printingNumber,
      title.width, title.height, title.weight, title.availableForReorder, title.coverUrl,
      title.incentiveRatio, title.incentiveRules, title.focLocked ? 'No' : 'Yes',
      title.focLocked ? 'FOC Locked' : 'Open for Retailer Ordering', title.focLocked ? 'Locked' : 'Open'
    ];
  });
  const month = String(first.releaseDate || first.catalogDate || cycleId).slice(0, 7);
  return {
    filename: `Philbo_Order_Ready_Catalog_${month}_FOC_${first.focDate || 'unscheduled'}.csv`,
    csv: [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n'),
    titleCount: rows.length,
    tier
  };
};
