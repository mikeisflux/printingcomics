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
    dash?: number[];
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
export interface CalendarOptions {
    halfSheet: boolean;
    rotateBack: boolean;
    addMarks: boolean;
    markLenIn: number;
    markOffIn: number;
    centerMarks?: boolean;
    markWeightPt?: number;
}
export declare function imposeCalendar(bytes: Uint8Array, opts: CalendarOptions): Promise<Uint8Array>;
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
    snake?: boolean;
    rtl?: boolean;
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
    cutType?: 'thru' | 'kiss' | 'crease' | 'perf';
    knockout?: boolean;
    overshootIn?: number;
    keyMark?: boolean;
}
export declare function addCropMarksOnly(bytes: Uint8Array, opts: CropMarksOptions): Promise<Uint8Array>;
export declare function mergePdfs(files: Uint8Array[]): Promise<Uint8Array>;
export declare function parsePageRange(expr: string, n: number): Set<number>;
export declare function rotatePdf(bytes: Uint8Array, angleDeg: number, pages?: string): Promise<Uint8Array>;
export declare function flipPdf(bytes: Uint8Array, direction: 'h' | 'v', pages?: string): Promise<Uint8Array>;
export declare function splitPdf(bytes: Uint8Array, ranges: string): Promise<Uint8Array[]>;
export declare function splitPdfChunks(bytes: Uint8Array, size: number): Promise<Uint8Array[]>;
export declare function makeZip(files: {
    name: string;
    data: Uint8Array;
}[]): Uint8Array;
export interface OverlayOptions {
    opacity: number;
    mode: 'center' | 'fill' | 'tile';
    tileRows?: number;
    tileCols?: number;
    anchor?: 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';
    paddingPt?: number;
    blend?: 'normal' | 'multiply';
}
export declare function overlayPdf(baseBytes: Uint8Array, stampBytes: Uint8Array, opts: OverlayOptions): Promise<Uint8Array>;
export interface DistortOptions {
    factorPct: number;
    direction: 'circ' | 'cross' | 'both';
    pages?: string;
}
export declare function distortPdf(bytes: Uint8Array, opts: DistortOptions): Promise<Uint8Array>;
export declare function distortFactorFromCylinder(cylinderDiaMm: number, plateThickMm: number): number;
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
}, pages?: string): Promise<Uint8Array>;
export interface ResizeOptions {
    mode: 'scale' | 'fit' | 'stretch';
    scalePct: number;
    targetWIn: number;
    targetHIn: number;
}
export declare function resizePdf(bytes: Uint8Array, opts: ResizeOptions, pages?: string): Promise<Uint8Array>;
export interface PageNumberOptions {
    position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
    startAt: number;
    prefix: string;
    suffix: string;
    fontSizePt: number;
    marginPt: number;
}
export declare function addPageNumbers(bytes: Uint8Array, opts: PageNumberOptions): Promise<Uint8Array>;
export interface ColorBarOpts {
    edge: 'bottom' | 'top' | 'left' | 'right';
    heightIn: number;
    shape?: 'square' | 'circle' | 'rect';
    spot?: boolean;
    pages?: string;
}
export declare function addColorBar(bytes: Uint8Array, opts: ColorBarOpts): Promise<Uint8Array>;
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
export interface BleedOptions {
    bleedIn: number;
    mode?: 'scale' | 'solid' | 'mirror' | 'repeat';
    color?: {
        r: number;
        g: number;
        b: number;
    };
    pages?: string;
}
export declare function generateBleed(bytes: Uint8Array, opts: BleedOptions): Promise<Uint8Array>;
export interface HeaderFooterOptions {
    header: string;
    footer: string;
    fontSizePt: number;
    marginPt: number;
    align: 'left' | 'center' | 'right';
    fileName?: string;
    alternate?: boolean;
    font?: 'helvetica' | 'times' | 'courier';
    rotationDeg?: 0 | 90 | 180 | 270;
}
export declare function addHeaderFooter(bytes: Uint8Array, opts: HeaderFooterOptions): Promise<Uint8Array>;
export interface WatermarkOptions {
    text: string;
    opacity: number;
    angleDeg: number;
    fontSizePt: number;
    color?: {
        r: number;
        g: number;
        b: number;
    };
    pages?: string;
}
export declare function addTextWatermark(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array>;
export interface JobSlugOptions {
    text: string;
    position: 'top' | 'bottom';
    fontSizePt: number;
    fileName?: string;
}
export declare function addJobSlug(bytes: Uint8Array, opts: JobSlugOptions): Promise<Uint8Array>;
export interface CollatingOptions {
    edge: 'left' | 'right';
    startOffsetPt?: number;
    markWpt?: number;
    markHpt?: number;
    smallMarks?: boolean;
    pagesPerSig?: number;
    sigsPerSet?: number;
    stepPt?: number;
    color?: {
        r: number;
        g: number;
        b: number;
    };
    color2?: {
        r: number;
        g: number;
        b: number;
    };
    opacity?: number;
    pages?: string;
}
export declare function addCollatingMarks(bytes: Uint8Array, opts: CollatingOptions): Promise<Uint8Array>;
export interface OmrOptions {
    edge: 'top' | 'bottom' | 'left' | 'right';
    encoding: 'binary' | 'barheight';
    program: number;
    bitCount: number;
    repeats?: number;
    widthPt?: number;
    heightPt?: number;
    spacingPt?: number;
    startOffsetPt?: number;
    edgeOffsetPt?: number;
    sync?: boolean;
    color?: {
        r: number;
        g: number;
        b: number;
    };
    opacity?: number;
    pages?: string;
}
export declare function addOmrMarks(bytes: Uint8Array, opts: OmrOptions): Promise<Uint8Array>;
export interface GatheringOptions {
    edge: 'top' | 'bottom';
    startOffsetPt?: number;
    edgeOffsetPt?: number;
    markWpt?: number;
    markHpt?: number;
    pagesPerSection?: number;
    sectionsPerSet?: number;
    stepPt?: number;
    color?: {
        r: number;
        g: number;
        b: number;
    };
    color2?: {
        r: number;
        g: number;
        b: number;
    };
    opacity?: number;
    pages?: string;
}
export declare function addGatheringMarks(bytes: Uint8Array, opts: GatheringOptions): Promise<Uint8Array>;
export interface FoldMarksOptions {
    scheme: 'half' | 'letter' | 'zfold' | 'gate' | 'doubleparallel' | 'roll' | 'accordion' | 'custom';
    orientation: 'vertical' | 'horizontal';
    panels?: number;
    positions?: string;
    edge: 'top' | 'bottom' | 'both';
    markLenPt?: number;
    offsetPt?: number;
    style: 'dashed' | 'solid' | 'dotted';
    weightPt?: number;
    fullLine?: boolean;
    color?: {
        r: number;
        g: number;
        b: number;
    };
    pages?: string;
}
export declare function addFoldMarks(bytes: Uint8Array, opts: FoldMarksOptions): Promise<Uint8Array>;
export interface LayMarksOptions {
    markType: 'arrow' | 'line' | 'cross';
    edges: 'gripper' | 'sideguide' | 'both';
    gripperEdge?: 'top' | 'bottom';
    sideGuideSide: 'left' | 'right';
    sizePt?: number;
    thicknessPt?: number;
    offsetPt?: number;
    color?: {
        r: number;
        g: number;
        b: number;
    };
    pages?: string;
}
export declare function addLayMarks(bytes: Uint8Array, opts: LayMarksOptions): Promise<Uint8Array>;
export interface PreflightReport {
    pages: number;
    uniformSize: boolean;
    widthIn: number;
    heightIn: number;
    boxes: {
        media: string;
        trim: string;
        bleed: string;
        crop: string;
    };
    fonts: {
        name: string;
        embedded: boolean;
    }[];
    colorSpaces: string[];
    images: number;
    minImagePx: number | null;
    annotations: number;
    embeddedFiles: number;
    hasJavaScript: boolean;
    hasLayers: boolean;
    warnings: string[];
}
export declare function preflight(bytes: Uint8Array): Promise<PreflightReport>;
export interface PreflightCleanOptions {
    deleteEmbeddedFiles?: boolean;
    flattenLayers?: boolean;
    removeAnnotations?: boolean;
    removeJavaScript?: boolean;
    stripMetadata?: boolean;
    pages?: string;
}
export declare function preflightClean(bytes: Uint8Array, opts: PreflightCleanOptions): Promise<Uint8Array>;
export interface GangPlan {
    itemsPerSheet: number;
    setsPerSheet: number;
    runSheets: number;
    makereadySheets: number;
    spoilageSheets: number;
    totalSheets: number;
}
export declare function computeGangPlan(distinctItems: number, itemsPerSheet: number, quantity: number, makeready?: number, spoilagePct?: number): GangPlan;
export interface OptimizeOptions {
    objectStreams?: boolean;
    removeUnused?: boolean;
    pages?: string;
}
export declare function optimizePdf(bytes: Uint8Array, opts?: OptimizeOptions): Promise<Uint8Array>;
export declare function decryptPdf(bytes: Uint8Array): Promise<Uint8Array>;
export interface PdfLayer {
    name: string;
    forcedOn: boolean;
    forcedOff: boolean;
}
export declare function readLayers(bytes: Uint8Array): Promise<PdfLayer[]>;
export interface LayerState {
    name: string;
    state: 'on' | 'off' | 'default';
}
export declare function setLayers(bytes: Uint8Array, states: LayerState[]): Promise<Uint8Array>;
export interface CustomCell {
    page: number | null;
    rotation?: 0 | 90 | 180 | 270;
}
export interface CustomImposeOptions {
    cols: number;
    rows: number;
    sheetWIn: number;
    sheetHIn: number;
    sheets: (CustomCell | null)[][];
    gutterIn?: number;
    marginIn?: number;
    addMarks?: boolean;
}
export declare function imposeCustomGrid(bytes: Uint8Array, opts: CustomImposeOptions): Promise<Uint8Array>;
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
    symbology?: 'qr' | 'code128' | 'ean13';
}
export interface DataMergeResult {
    pdf: Uint8Array;
    records: number;
    columns: string[];
}
export interface DataMatrixResult {
    size: number;
    matrix: boolean[][];
    codewords: number[];
    ecc: number[];
}
export declare function encodeDataMatrix(text: string): DataMatrixResult;
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
    pages?: string;
}
export declare function nudgePdf(bytes: Uint8Array, opts: NudgeOptions): Promise<Uint8Array>;
export interface RepairOptions {
    reserialize?: boolean;
    stripMetadata?: boolean;
    removeAnnotations?: boolean;
    removeJavaScript?: boolean;
    pages?: string;
}
export declare function repairPdf(bytes: Uint8Array, opts?: RepairOptions): Promise<Uint8Array>;
export interface ColorEffectsOptions {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    grayscale?: number;
    warmTone?: number;
    invert?: number;
    hueRotate?: number;
    dpi?: number;
    pages?: string;
}
export declare function colorEffectsFilter(o: ColorEffectsOptions): string;
export declare function colorEffectsIsIdentity(o: ColorEffectsOptions): boolean;
export declare function applyColorEffects(bytes: Uint8Array, opts: ColorEffectsOptions): Promise<Uint8Array>;
export declare function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number];
export declare function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number];
export declare function cmykRoundTrip(r: number, g: number, b: number): [number, number, number];
export declare function isOutOfCmykGamut(r: number, g: number, b: number, thresh?: number): boolean;
export declare function mapPixelCmyk(r: number, g: number, b: number, intent: string): [number, number, number];
export declare function assignOutputIntent(baseBytes: Uint8Array, iccBytes: Uint8Array, conditionName: string): Promise<Uint8Array>;
export interface ColorManageOptions {
    sourceProfile?: string;
    destProfile?: string;
    intent?: 'perceptual' | 'relative' | 'saturation' | 'absolute';
    dpi?: number;
    convert?: boolean;
    gamutWarning?: boolean;
    warningColor?: {
        r: number;
        g: number;
        b: number;
    };
    pages?: string;
}
export declare function applyColorManagement(bytes: Uint8Array, opts: ColorManageOptions): Promise<Uint8Array>;
export interface BackdropOptions {
    r: number;
    g: number;
    b: number;
}
export declare function addBackdrop(bytes: Uint8Array, opts: BackdropOptions): Promise<Uint8Array>;
export interface BackdropFileOptions {
    offsetXPt?: number;
    offsetYPt?: number;
    scalePct?: number;
    opacity?: number;
    repeat?: boolean;
    pages?: string;
}
export declare function addBackdropFile(baseBytes: Uint8Array, backdropBytes: Uint8Array, opts: BackdropFileOptions): Promise<Uint8Array>;
export interface QrStampOptions {
    text: string;
    sizePt: number;
    position: 'br' | 'bl' | 'tr' | 'tl' | 'center';
    marginPt: number;
    symbology?: 'qr' | 'code128' | 'ean13';
}
export declare function addQrStamp(bytes: Uint8Array, opts: QrStampOptions): Promise<Uint8Array>;
export interface BarcodeStampOptions {
    text: string;
    symbology: 'qr' | 'code128' | 'datamatrix' | 'ean13';
    scale?: number;
    quietZone?: number;
    barHeightMm?: number;
    position: 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';
    marginPt?: number;
    xOffsetPt?: number;
    yOffsetPt?: number;
    rotationDeg?: 0 | 90 | 180 | 270;
    barColor?: {
        r: number;
        g: number;
        b: number;
    };
    bgColor?: {
        r: number;
        g: number;
        b: number;
    };
    transparent?: boolean;
    showText?: boolean;
    pages?: string;
}
export declare function addBarcodeStamp(bytes: Uint8Array, opts: BarcodeStampOptions): Promise<Uint8Array>;
export declare function addDimensions(bytes: Uint8Array): Promise<Uint8Array>;
export interface CutContourOptions {
    shape: 'rectangle' | 'rounded' | 'ellipse';
    target: 'trim' | 'bleed' | 'media' | 'custom';
    customWpt?: number;
    customHpt?: number;
    spotName: string;
    thicknessPt?: number;
    dashed?: boolean;
    dashLenPt?: number;
    dashGapPt?: number;
    cornerRadiusPt?: number;
    xOffsetPt?: number;
    yOffsetPt?: number;
    previewColor?: {
        r: number;
        g: number;
        b: number;
    };
    pages?: string;
}
export declare function addCutContour(bytes: Uint8Array, opts: CutContourOptions): Promise<Uint8Array>;
export interface WhiteVarnishOptions {
    spotName: string;
    coverage: 'flood' | 'trim' | 'bleed' | 'custom';
    customWpt?: number;
    customHpt?: number;
    tint?: number;
    under?: boolean;
    xOffsetPt?: number;
    yOffsetPt?: number;
    previewColor?: {
        r: number;
        g: number;
        b: number;
    };
    pages?: string;
}
export declare function addWhiteVarnish(bytes: Uint8Array, opts: WhiteVarnishOptions): Promise<Uint8Array>;
export interface BrailleOptions {
    text: string;
    xPt?: number;
    yPt?: number;
    dotDiaPt?: number;
    dotPitchPt?: number;
    cellSpacePt?: number;
    lineSpacePt?: number;
    spotName?: string;
    tint?: number;
    previewColor?: {
        r: number;
        g: number;
        b: number;
    };
    pages?: string;
}
export declare function addBraille(bytes: Uint8Array, opts: BrailleOptions): Promise<Uint8Array>;
export interface NestOptions {
    sheetWIn: number;
    sheetHIn: number;
    roll: boolean;
    paddingIn: number;
    marginIn: number;
    allowRotate: boolean;
    copies: number;
    fillSheet: boolean;
    trueShape?: boolean;
    dpi?: number;
}
export declare function nestPdf(bytes: Uint8Array, opts: NestOptions): Promise<Uint8Array>;
export declare function downloadPdf(bytes: Uint8Array, filename: string): void;
export declare function downloadMultiple(files: Uint8Array[], baseName: string): void;
export {};
