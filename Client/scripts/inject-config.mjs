import { readFileSync, writeFileSync } from 'fs';

const hubUrl = process.env.HUB_URL ?? 'http://localhost:5000/hubs/grid';
const path = new URL('../src/index.html', import.meta.url).pathname;
const html = readFileSync(path, 'utf8').replace('REPLACE_HUB_URL', hubUrl);
writeFileSync(path, html);
console.log('Injected HUB_URL:', hubUrl);
