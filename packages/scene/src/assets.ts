export type ArtSource = 'library' | 'seedream';
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
  source: 'free' | 'upload' | 'seedream';
  credit: string;
  sourceUrl?: string;
}
export interface AssetRequest { id:string; name:string; role:ImageRole; prompt:string; references?:string[] }
export interface ArtSelection { artSource?:ArtSource; assetIds?:string[]; allowUploadReferences?:boolean }
