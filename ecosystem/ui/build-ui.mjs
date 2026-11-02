import {build} from 'esbuild';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

/** Deterministic bundled custom UI; the private app is not a build dependency. */
export async function buildCustomUi({entry, outputDirectory, css = [], aliases = {}}) {
  const result = await build({absWorkingDir: dirname(resolve(entry)), entryPoints: [resolve(entry)], outdir: resolve(outputDirectory), bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic', minify: true, legalComments: 'eof', alias: aliases, define: {'process.env.NODE_ENV': '"production"'}});
  const module = result.outputFiles.find(file => file.path.endsWith('.js'));
  const generatedCss = result.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
  const style = [...await Promise.all(css.map(path => readFile(path, 'utf8'))), generatedCss].join('\n');
  const script = module.text.replace(/<\/script/gi, '<\\/script');
  await mkdir(outputDirectory, {recursive: true});
  await Promise.all([writeFile(resolve(outputDirectory, 'entry.js'), script), writeFile(resolve(outputDirectory, 'style.css'), style)]);
  return {script, css: style, bodyHtml: '<div id="root"></div>'};
}
