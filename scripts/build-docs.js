#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

const mdPath = path.resolve('docs', 'TRACES-AND-ANOMALY-MONITORING.md');
const tplPath = path.resolve('docs', 'template.html');
const outPath = path.resolve('docs', 'traces-and-anomaly.html');

if (!fs.existsSync(mdPath)) {
  console.error('Markdown source not found:', mdPath);
  process.exit(1);
}
if (!fs.existsSync(tplPath)) {
  console.error('Template not found:', tplPath);
  process.exit(1);
}

const mdRaw = fs.readFileSync(mdPath, 'utf8');
// Remove leading H1 in the markdown (the template includes the page title already)
const md = mdRaw.replace(/^\s*#\s.*(?:\r?\n)+/, '');
if (md !== mdRaw) console.log('Removed leading H1 from markdown during build.');
const htmlBody = marked(md, { mangle: false, headerIds: true });
let tpl = fs.readFileSync(tplPath, 'utf8');

tpl = tpl.replace('{{content}}', htmlBody);
fs.writeFileSync(outPath, tpl, 'utf8');
console.log('Wrote', outPath);
