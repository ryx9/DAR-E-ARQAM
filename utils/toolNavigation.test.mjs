import test from 'node:test';
import assert from 'node:assert/strict';
import { findDirectionalTool } from './toolNavigation.mjs';

const rect = (left, top, width = 100, height = 40) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

test('arrow keys follow the visible grid, not DOM order', () => {
  const tiles = [rect(0, 0), rect(110, 0), rect(0, 50), rect(110, 50)];
  assert.equal(findDirectionalTool(tiles, 0, 'ArrowRight'), 1);
  assert.equal(findDirectionalTool(tiles, 0, 'ArrowDown'), 2);
  assert.equal(findDirectionalTool(tiles, 3, 'ArrowUp'), 1);
  assert.equal(findDirectionalTool(tiles, 3, 'ArrowLeft'), 2);
  assert.equal(findDirectionalTool(tiles, 0, 'ArrowUp'), -1);
});

test('works for stacked mobile layouts and uneven panels', () => {
  const tiles = [rect(0, 0), rect(0, 50), rect(0, 130), rect(110, 115)];
  assert.equal(findDirectionalTool(tiles, 0, 'ArrowDown'), 1);
  assert.equal(findDirectionalTool(tiles, 1, 'ArrowDown'), 2);
  assert.equal(findDirectionalTool(tiles, 2, 'ArrowRight'), 3);
  assert.equal(findDirectionalTool(tiles, 2, 'ArrowLeft'), -1);
  assert.equal(findDirectionalTool([], 0, 'ArrowDown'), -1);
});
