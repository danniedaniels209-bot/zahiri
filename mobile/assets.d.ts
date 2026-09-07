/** Metro resolves font and image files to an asset module id at build time. */
declare module '*.ttf' {
  const asset: number;
  export default asset;
}
declare module '*.otf' {
  const asset: number;
  export default asset;
}
