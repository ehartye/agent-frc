/** The Agent FRC theme fonts (Barlow Condensed and Source Sans 3), bundled under the SIL Open Font License. */
import { readFileSync, readdirSync } from 'node:fs';

const directory = new URL('../templates/preliminary-review-fonts/', import.meta.url);

/** Copyright notices and license texts that must travel with any copy of the fonts. */
export const fontLicenseFiles = ['OFL-BarlowCondensed.txt', 'OFL-SourceSans3.txt'];

/** The bundled faces, from the @font-face rules in fonts.css: [{family, weight, file}]. */
export function themeFaces() {
  const css = readFileSync(new URL('fonts.css', directory), 'utf8');
  return [...css.matchAll(/font-family:"([^"]+)";font-style:normal;font-weight:(\d+);[^}]*url\("([^"]+\.woff2)"\)/g)]
    .map(([, family, weight, file]) => ({family, weight: Number(weight), file}));
}

/**
 * A self-contained stylesheet for a single-file page: each face as a base64 data URI, preceded by the
 * fonts' copyright notices and full license texts, so the page renders the theme offline and on any host.
 */
export function inlineThemeFonts() {
  const licenses = fontLicenseFiles.map(name => readFileSync(new URL(name, directory), 'utf8').replace(/\r\n/g, '\n').trim());
  if (licenses.some(text => text.includes('*/'))) throw Error('A font license cannot be embedded in a CSS comment');
  const faces = themeFaces().map(({family, weight, file}) =>
    '@font-face{font-family:"' + family + '";font-style:normal;font-weight:' + weight + ';font-display:swap;src:url("data:font/woff2;base64,' +
    readFileSync(new URL(file, directory)).toString('base64') + '") format("woff2")}');
  return '/* Theme fonts embedded from Agent FRC. Latin subsets as distributed by Fontsource 5.2.5.\n\n' +
    licenses.join('\n\n') + '\n*/\n' + faces.join('\n') + '\n';
}

/** File names to copy beside a multi-file site: the faces, fonts.css, the notice and the licenses. */
export function themeFontFiles() {
  return readdirSync(directory).filter(name => /\.(woff2|css|txt|md)$/.test(name)).map(name => ({name, url: new URL(name, directory)}));
}
