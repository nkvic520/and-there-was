export type ImageProvider = 'seedream' | 'openai';
// 'seedream' is the AI selection sent by clients before v0.6.
export type ArtSource = 'library' | 'ai' | 'seedream';
export const usesImageModel = (source?: ArtSource) => source === 'ai' || source === 'seedream';
export type ImageRole = 'character' | 'background' | 'illustration';
export interface SceneAsset {
  id: string;
  imageId: string;
  hash: string;
  originalHash: string;
  mediaType: 'image/png';
  width: number;
  height: number;
  name: string;
  role: ImageRole;
  source: 'free' | 'upload' | ImageProvider;
  credit: string;
  sourceUrl?: string;
}
export interface AssetRequest { id:string; name:string; role:ImageRole; prompt:string; references?:string[] }
export interface CanvasSize { width: number; height: number }
export interface ArtSelection { artSource?:ArtSource; assetIds?:string[]; allowUploadReferences?:boolean; referenceProvider?:ImageProvider; viewport?:CanvasSize }
