import { readFile, writeFile } from 'node:fs/promises';

// Keep source deployments and drag-and-drop static deployments equally protected.
const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const staticConfig = { ...config, framework: null, buildCommand: '', installCommand: '', outputDirectory: '.' };
await writeFile(new URL('../dist/vercel.json', import.meta.url), `${JSON.stringify(staticConfig, null, 2)}\n`);
console.log('Prepared static deployment with the source security headers.');
