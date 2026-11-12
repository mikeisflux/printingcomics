export const PHILVIEWS_CATALOGS = [
  {
    cycleId: 'cycle_15',
    issue: 15,
    label: 'September for December 2026',
    catalogDate: '2026-09-01',
    focDate: '2026-11-01',
    releaseDate: '2026-12-16',
    accentColor: '#78df70',
    complementColor: '#9c78d8',
    coverPath: 'catalogs/philviews-15-september-december-2026.webp',
    pdfUrl: 'https://philbodistribution.com/s/SEPT2026-Dec2026_linksm.pdf',
    current: true
  },
  {
    cycleId: 'cycle_14',
    issue: 14,
    label: 'August for November 2026',
    catalogDate: '2026-08-01',
    focDate: '2026-10-01',
    releaseDate: '2026-11-11',
    accentColor: '#f0a8b0',
    complementColor: '#69c7c7',
    coverPath: 'catalogs/philviews-14-august-november-2026.webp',
    pdfUrl: 'https://philbodistribution.com/s/August_NovCatalog_2026sml.pdf',
    current: false
  },
  {
    cycleId: 'cycle_13',
    issue: 13,
    label: 'July for October 2026',
    catalogDate: '2026-07-01',
    focDate: '2026-09-01',
    releaseDate: '2026-10-14',
    accentColor: '#c05249',
    complementColor: '#6b9fc4',
    coverPath: 'catalogs/philviews-13-july-october-2026.webp',
    pdfUrl: 'https://philbodistribution.com/s/July_Oct_Catalog2026__fin-ljfk.pdf',
    current: false
  }
];

export const CURRENT_PHILVIEWS_CATALOG = PHILVIEWS_CATALOGS.find(catalog => catalog.current);
