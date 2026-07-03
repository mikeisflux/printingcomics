export interface PdfPageInfo {
    count: number;
    widthPt: number;
    heightPt: number;
    widthIn: number;
    heightIn: number;
}
export declare function getPdfInfo(bytes: Uint8Array): Promise<PdfPageInfo>;
export interface BookletOptions {
    rtl: boolean;
    marginIn: number;
    gutterIn: number;
    creepIn: number;
    addMarks: boolean;
    markLenIn: number;
    markOffIn: number;
}
export declare function imposeBooklet(bytes: Uint8Array, opts: BookletOptions): Promise<Uint8Array>;
export interface NUpOptions {
    cols: number;
    rows: number;
    sheetWIn: number;
    sheetHIn: number;
    marginIn: number;
    gutterIn: number;
    repeatFirst: boolean;
    addMarks: boolean;
    markLenIn: number;
    markOffIn: number;
    cellWIn?: number;
    cellHIn?: number;
    gutterYIn?: number;
    cutStack?: boolean;
}
export interface NUpGrid {
    cols: number;
    rows: number;
    cellWPt: number;
    cellHPt: number;
    leftGapPt: number;
    topGapPt: number;
    gxPt: number;
    gyPt: number;
}
export declare function computeNUpGrid(opts: NUpOptions): NUpGrid;
export declare function imposeNUp(bytes: Uint8Array, opts: NUpOptions): Promise<Uint8Array>;
export interface TicketOptions {
    cols: number;
    rows: number;
    sheetWIn: number;
    sheetHIn: number;
    marginIn: number;
    gutterIn: number;
    startNumber: number;
    count: number;
    prefix: string;
    pad: number;
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'bottom-center' | 'top-center';
    fontSizePt: number;
    addMarks: boolean;
    markLenIn: number;
    markOffIn: number;
}
export declare function imposeTickets(bytes: Uint8Array, opts: TicketOptions): Promise<Uint8Array>;
export interface CropMarksOptions {
    bleedIn: number;
    marginIn: number;
    markLenIn: number;
    markOffIn: number;
}
export declare function addCropMarksOnly(bytes: Uint8Array, opts: CropMarksOptions): Promise<Uint8Array>;
export declare function mergePdfs(files: Uint8Array[]): Promise<Uint8Array>;
export declare function rotatePdf(bytes: Uint8Array, angleDeg: 90 | 180 | 270): Promise<Uint8Array>;
export declare function flipPdf(bytes: Uint8Array, direction: 'h' | 'v'): Promise<Uint8Array>;
export declare function splitPdf(bytes: Uint8Array, ranges: string): Promise<Uint8Array[]>;
export interface OverlayOptions {
    opacity: number;
    mode: 'center' | 'fill' | 'tile';
    tileRows?: number;
    tileCols?: number;
}
export declare function overlayPdf(baseBytes: Uint8Array, stampBytes: Uint8Array, opts: OverlayOptions): Promise<Uint8Array>;
export declare function shufflePages(bytes: Uint8Array, orderStr: string): Promise<Uint8Array>;
export declare function cropPdf(bytes: Uint8Array, opts: {
    top: number;
    right: number;
    bottom: number;
    left: number;
}): Promise<Uint8Array>;
export interface PageNumberOptions {
    position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
    startAt: number;
    prefix: string;
    suffix: string;
    fontSizePt: number;
    marginPt: number;
}
export declare function addPageNumbers(bytes: Uint8Array, opts: PageNumberOptions): Promise<Uint8Array>;
export declare function addColorBar(bytes: Uint8Array, opts: {
    position: 'bottom' | 'top';
    heightIn: number;
}): Promise<Uint8Array>;
export declare function imposeTiledPoster(bytes: Uint8Array, opts: {
    tilesAcross: number;
    tilesDown: number;
    sheetWIn: number;
    sheetHIn: number;
    overlapIn: number;
    addMarks: boolean;
    markLenIn: number;
    markOffIn: number;
}): Promise<Uint8Array>;
export declare function downloadPdf(bytes: Uint8Array, filename: string): void;
export declare function downloadMultiple(files: Uint8Array[], baseName: string): void;
