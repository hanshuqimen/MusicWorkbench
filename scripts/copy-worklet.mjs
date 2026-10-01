import {copyFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('public',{recursive:true});
await build({entryPoints:['src/audio/processor.ts'],outfile:'public/audio-worklet.js',bundle:true,format:'esm',target:'es2022',minify:true});
await copyFile('node_modules/spessasynth_lib/dist/spessasynth_processor.min.js','public/spessasynth_processor.min.js');
await mkdir('dist',{recursive:true});
await copyFile('public/spessasynth_processor.min.js','dist/spessasynth_processor.min.js');
await copyFile('public/audio-worklet.js','dist/audio-worklet.js');
