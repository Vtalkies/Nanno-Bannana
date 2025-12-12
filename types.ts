export interface GeneratedAsset {
  id: string;
  url: string;
  base64: string; // Stored to facilitate re-editing (consistency)
  prompt: string;
  timestamp: number;
  type: 'character' | 'scene';
}

export interface Character {
  id: string;
  name: string;
  base64: string;
  timestamp: number;
}

export type ModelTier = 'flash' | 'pro';
export type ImageResolution = '1K' | '2K' | '4K';

export interface PhotographicConfig {
  lighting?: string;
  camera?: string;
  depth?: string;
}

export interface GenerationConfig {
  aspectRatio: "1:1" | "3:4" | "4:3" | "16:9" | "9:16" | "21:9";
  modelTier: ModelTier;
  resolution?: ImageResolution;
  useGrounding?: boolean;
  style?: string;
  photographic?: PhotographicConfig;
  consistencyStrength?: 'Low' | 'Medium' | 'High';
}

export enum AppMode {
  CREATE = 'CREATE',
  EDIT = 'EDIT'
}