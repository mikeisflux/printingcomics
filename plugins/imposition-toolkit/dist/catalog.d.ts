import type { NUpOptions, BookletOptions, TicketOptions, ResizeOptions } from './impose';
interface PosterOptions {
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
}
export interface TemplatePreset {
    nup?: Partial<NUpOptions>;
    booklet?: Partial<BookletOptions>;
    poster?: Partial<PosterOptions>;
    ticket?: Partial<TicketOptions>;
    resize?: Partial<ResizeOptions>;
}
export interface TemplateDef {
    id: string;
    name: string;
    industry: string;
    toolId: string;
    specs: string;
    preset?: TemplatePreset;
}
export declare const TEMPLATE_INDUSTRIES: string[];
export declare const TEMPLATES: TemplateDef[];
export interface RecipeStep {
    kind: string;
    label: string;
    opts?: Record<string, unknown>;
}
export interface RecipeDef {
    id: string;
    name: string;
    desc: string;
    cat: string;
    input: string;
    tip: string;
    tags: string[];
    steps: RecipeStep[];
}
export declare const RECIPES: RecipeDef[];
export {};
