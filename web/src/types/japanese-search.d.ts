declare module "kuroshiro" {
  interface ConvertOptions {
    to?: "hiragana" | "katakana" | "romaji";
    mode?: "normal" | "spaced" | "okurigana" | "furigana";
    romajiSystem?: "nippon" | "passport" | "hepburn";
    delimiter_start?: string;
    delimiter_end?: string;
  }
  class Kuroshiro {
    constructor();
    init(analyzer: unknown): Promise<void>;
    convert(text: string, options?: ConvertOptions): Promise<string>;
  }
  export default Kuroshiro;
}

declare module "kuroshiro-analyzer-kuromoji" {
  class KuromojiAnalyzer {
    constructor(options?: { dictPath?: string });
    init(): Promise<void>;
  }
  export default KuromojiAnalyzer;
}

declare module "wanakana" {
  export function toRomaji(input: string, options?: Record<string, unknown>): string;
  export function toHiragana(input: string, options?: Record<string, unknown>): string;
  export function toKatakana(input: string, options?: Record<string, unknown>): string;
  export function isJapanese(input: string): boolean;
  export function isRomaji(input: string): boolean;
  export function isKana(input: string): boolean;
  export function isHiragana(input: string): boolean;
  export function isKatakana(input: string): boolean;
  export function isKanji(input: string): boolean;
}
