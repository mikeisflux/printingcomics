export interface PdfPageInfo {
    count: number;
    widthPt: number;
    heightPt: number;
    widthIn: number;
    heightIn: number;
}
export declare function getPdfInfo(bytes: Uint8Array): Promise<PdfPageInfo>;
export interface MarkStyle {
    weight?: number;
    center?: boolean;
    color?: any;
}
export interface BookletOptions {
    rtl: boolean;
    marginIn: number;
    gutterIn: number;
    creepIn: number;
    addMarks: boolean;
    markLenIn: number;
    markOffIn: number;
    centerMarks?: boolean;
    markWeightPt?: number;
    signatureSheets?: number;
}
export declare function imposeBooklet(bytes: Uint8Array, opts: BookletOptions): Promise<Uint8Array>;
export interface NUpBookOptions {
    nUp: number;
    sheetWIn: number;
    sheetHIn: number;
    marginIn: number;
    gutterIn: number;
    creepIn: number;
    rtl: boolean;
    signatureSheets: number;
    addMarks: boolean;
    markLenIn: number;
    markOffIn: number;
    centerMarks?: boolean;
    markWeightPt?: number;
}
export declare function imposeNUpBook(bytes: Uint8Array, opts: NUpBookOptions): Promise<Uint8Array>;
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
    centerMarks?: boolean;
    markWeightPt?: number;
    bleedIn?: number;
    duplex?: boolean;
    duplexFlip?: 'long' | 'short';
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
    centerMarks?: boolean;
    markWeightPt?: number;
}
export declare function imposeTickets(bytes: Uint8Array, opts: TicketOptions): Promise<Uint8Array>;
export interface CropMarksOptions {
    bleedIn: number;
    marginIn: number;
    markLenIn: number;
    markOffIn: number;
    centerMarks?: boolean;
    markWeightPt?: number;
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
interface ShufInstr {
    page: number | null;
    rot: number;
}
export declare function expandShuffle(expr: string, n: number, rot?: number): ShufInstr[];
export declare function shufflePages(bytes: Uint8Array, orderStr: string): Promise<Uint8Array>;
export declare function cropPdf(bytes: Uint8Array, opts: {
    top: number;
    right: number;
    bottom: number;
    left: number;
}): Promise<Uint8Array>;
export interface ResizeOptions {
    mode: 'scale' | 'fit' | 'stretch';
    scalePct: number;
    targetWIn: number;
    targetHIn: number;
}
export declare function resizePdf(bytes: Uint8Array, opts: ResizeOptions): Promise<Uint8Array>;
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
    centerMarks?: boolean;
    markWeightPt?: number;
}): Promise<Uint8Array>;
export declare function generateBleed(bytes: Uint8Array, opts: {
    bleedIn: number;
}): Promise<Uint8Array>;
export interface HeaderFooterOptions {
    header: string;
    footer: string;
    fontSizePt: number;
    marginPt: number;
    align: 'left' | 'center' | 'right';
}
export declare function addHeaderFooter(bytes: Uint8Array, opts: HeaderFooterOptions): Promise<Uint8Array>;
export interface WatermarkOptions {
    text: string;
    opacity: number;
    angleDeg: number;
    fontSizePt: number;
}
export declare function addTextWatermark(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array>;
export interface JobSlugOptions {
    text: string;
    position: 'top' | 'bottom';
    fontSizePt: number;
}
export declare function addJobSlug(bytes: Uint8Array, opts: JobSlugOptions): Promise<Uint8Array>;
export interface CollatingOptions {
    edge: 'left' | 'right';
}
export declare function addCollatingMarks(bytes: Uint8Array, opts: CollatingOptions): Promise<Uint8Array>;
export interface PreflightReport {
    pages: number;
    uniformSize: boolean;
    widthIn: number;
    heightIn: number;
    warnings: string[];
}
export declare function preflight(bytes: Uint8Array): Promise<PreflightReport>;
export interface DielineOptions {
    kind: 'ste' | 'folder';
    widthIn: number;
    heightIn: number;
    depthIn: number;
    glueIn: number;
    marginIn: number;
}
export declare function makeDieline(opts: DielineOptions): Promise<Uint8Array>;
export interface DataMergeOptions {
    cols: number;
    rows: number;
    sheetWIn: number;
    sheetHIn: number;
    marginIn: number;
    gutterIn: number;
    fontSizePt: number;
    showBorder: boolean;
    autoNumber: boolean;
    startNumber: number;
    numberPrefix: string;
    numberPad: number;
    addMarks: boolean;
    markLenIn: number;
    markOffIn: number;
    centerMarks?: boolean;
    markWeightPt?: number;
    qrColumn: string;
    qrSizePt: number;
}
export interface DataMergeResult {
    pdf: Uint8Array;
    records: number;
    columns: string[];
}
export declare function imposeDataMerge(csvText: string, opts: DataMergeOptions): Promise<DataMergeResult>;
export interface RegMarkOptions {
    marginIn: number;
    sizeIn: number;
    style: 'target' | 'crosshair';
}
export declare function addRegistrationMarks(bytes: Uint8Array, opts: RegMarkOptions): Promise<Uint8Array>;
export interface InsertOptions {
    mode: 'at' | 'everyN';
    position: number;
    everyN: number;
    count: number;
}
export declare function insertPages(bytes: Uint8Array, opts: InsertOptions): Promise<Uint8Array>;
export declare function mixPdfs(aBytes: Uint8Array, bBytes: Uint8Array, reverseB?: boolean): Promise<Uint8Array>;
export interface NudgeOptions {
    dxIn: number;
    dyIn: number;
    rotateDeg: number;
}
export declare function nudgePdf(bytes: Uint8Array, opts: NudgeOptions): Promise<Uint8Array>;
export declare function repairPdf(bytes: Uint8Array): Promise<Uint8Array>;
export interface BackdropOptions {
    r: number;
    g: number;
    b: number;
}
export declare function addBackdrop(bytes: Uint8Array, opts: BackdropOptions): Promise<Uint8Array>;
export interface QrStampOptions {
    text: string;
    sizePt: number;
    position: 'br' | 'bl' | 'tr' | 'tl' | 'center';
    marginPt: number;
}
export declare function addQrStamp(bytes: Uint8Array, opts: QrStampOptions): Promise<Uint8Array>;
export declare function addDimensions(bytes: Uint8Array): Promise<Uint8Array>;
export declare function downloadPdf(bytes: Uint8Array, filename: string): void;
export declare function downloadMultiple(files: Uint8Array[], baseName: string): void;
export {};
