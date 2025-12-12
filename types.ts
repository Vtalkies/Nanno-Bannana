export interface GeneratedAsset {
  id: string;
  url: string;
  base64: string; // Stored to facilitate re-editing (consistency)
  prompt: string;
  timestamp: number;
  type: 'character' | 'scene';
}

export type ModelTier = 'flash' | 'pro';
export type ImageResolution = '1K' | '2K' | '4K';

export interface GenerationConfig {
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" | "9:16";
  modelTier: ModelTier;
  resolution?: ImageResolution;
}

export enum AppMode {
  CREATE = 'CREATE',
  EDIT = 'EDIT'
}