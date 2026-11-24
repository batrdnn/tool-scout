// The README gallery: one card per animal plus the Egg, made by the current renderer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GALLERY, galleryFile, galleryCard } from './gallery.mjs';
import { whoAmI, ORDER } from '../scripts/lib/me.mjs';

const README = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('each gallery profile maps to its own animal (no forcing)', () => {
  assert.deepEqual(Object.keys(GALLERY), [...ORDER, 'Egg']);
  for (const [a, p] of Object.entries(GALLERY)) assert.equal(whoAmI(p).animal, a);
});

test('docs/assets/animals/ has every card, and each matches the current renderer (run `npm run gallery` to update)', () => {
  for (const a of Object.keys(GALLERY)) {
    assert.ok(fs.existsSync(galleryFile(a)), `${a}: ${galleryFile(a)} missing`);
    assert.equal(fs.readFileSync(galleryFile(a), 'utf8'), galleryCard(a), `${a}: out of date`);
  }
});

test('the README shows all 8 cards in a grid under its /tool-scout:me section', () => {
  const sec = README.split(/^## /m).find((s) => s.startsWith('Your Claude Code animal'));
  assert.ok(sec, 'README needs a "## Your Claude Code animal" section');
  assert.match(sec, /\/tool-scout:me/);
  const imgs = [...sec.matchAll(/<img src="docs\/assets\/animals\/([a-z]+)\.svg"/g)].map((m) => m[1]);
  assert.deepEqual(imgs, Object.keys(GALLERY).map((a) => a.toLowerCase()));
  assert.match(sec, /<table>/);
});
