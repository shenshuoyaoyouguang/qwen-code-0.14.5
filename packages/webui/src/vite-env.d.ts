/// <reference types="vite/client" />

declare module '*?inline' {
  const content: string;
  export default content;
}
declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
  export = classes;
}
