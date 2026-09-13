import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {countries} from '../lib/arena.ts';
import {CountryLandmark,landmarkNames} from '../components/country-landmark.tsx';

void test('every supported country has one distinct, self-contained SVG illustration',()=>{
 const codes=countries.map(c=>c.code).sort();
 assert.deepEqual(Object.keys(landmarkNames).sort(),codes);
 assert.deepEqual(readdirSync('public/landmarks').filter(f=>f.endsWith('.svg')).map(f=>f.slice(0,-4)).sort(),codes);
 const shapes=new Set<string>();let bytes=0;
 for(const code of codes){
  const svg=readFileSync(`public/landmarks/${code}.svg`,'utf8');bytes+=Buffer.byteLength(svg);
  assert.match(svg,/<svg[^>]+viewBox="0 0 320 230"/);
  assert.match(svg,/<title[\s>]/);
  assert.doesNotMatch(svg,/<(?:script|image|foreignObject)\b|\son\w+=|\bNaN\b|\bundefined\b|\bInfinity\b|(?:href|src)=/i);
  const geometry=svg.replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1>/g,'');
  const hash=createHash('sha256').update(geometry).digest('hex');
  assert.equal(shapes.has(hash),false,`Duplicate artwork: ${code}`);shapes.add(hash);
  const html=renderToStaticMarkup(React.createElement(CountryLandmark,{country:code}));
  assert.ok(html.includes(`/landmarks/${code}.svg`));assert.match(html,/alt="[^"]+"/);
 }
 assert.ok(bytes<1024*1024,'All country artwork should remain lightweight');
 assert.equal(renderToStaticMarkup(React.createElement(CountryLandmark,{country:'../invalid'})),'');
});
