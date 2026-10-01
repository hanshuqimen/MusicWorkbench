import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const child=spawn(require('electron'),['.',...process.argv.slice(2)],{stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
