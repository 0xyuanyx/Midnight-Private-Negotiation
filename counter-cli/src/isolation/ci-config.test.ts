import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CI integration test isolation', () => {
  it('runs Docker-backed integration suites sequentially', async () => {
    const repositoryRoot = path.resolve(process.cwd(), '..');
    const cliPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'counter-cli', 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const workflow = await readFile(path.join(repositoryRoot, '.github', 'workflows', 'ci.yaml'), 'utf8');

    expect(cliPackage.scripts['test-api']).toContain('src/test/counter.api.test.ts');

    const singleRuntimeTest = workflow.indexOf('npm run test-api');
    const isolatedRuntimeTest = workflow.indexOf('npm run test:isolated');
    expect(singleRuntimeTest).toBeGreaterThan(-1);
    expect(isolatedRuntimeTest).toBeGreaterThan(singleRuntimeTest);
  });
});
