import { test, expect } from 'vitest';
import { captionWords } from '../src/ui/caption';

// build_audio.py numbers words by Python str.split(); captions must split the same way.
test('caption words match Python str.split() indexes', () => {
  expect(captionWords('  Yield means:  let\tcars\n go first. ')).toEqual(['Yield', 'means:', 'let', 'cars', 'go', 'first.']);
  expect(captionWords('   ')).toEqual([]);
});
