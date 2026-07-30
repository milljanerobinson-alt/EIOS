#!/usr/bin/env node
/**
 * EWO-035 — Bootstrap script: pushes all project files to GitHub via edge function.
 * Reads files from the Bolt project, excludes unsafe paths, and sends in batches.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';

const SUPABASE_URL = process.argv[2] || process.env.VITE_SUPABASE_URL || execSync('grep VITE_SUPABASE_URL .env | cut -d= -f2', { encoding: 'utf-8' }).trim();
const ANON_KEY = process.argv[3] || process.env.VITE_SUPABASE_ANON_KEY || execSync('grep VITE_SUPABASE_ANON_KEY .env | cut -d= -f2', { encoding: 'utf-8' }).trim();
const OWNER = 'milljanerobinson-alt';
const REPO = 'EIOS';
const BATCH_SIZE = 50;
const BOOTSTRAP_URL = `${SUPABASE_URL}/functions/v1/github-bootstrap/bootstrap-commit`;

const EXCLUDE_PATTERNS = [
  /^\.env$/,
  /^\.env\./,
  /^\.git\//,
  /^node_modules\//,
  /^dist\//,
  /^dist-ssr\//,
  /\.log$/,
  /npm-debug\.log/,
  /^\.bolt\//,
  /^\.vscode\//,
  /^\.idea\//,
  /\.DS_Store$/,
  /vite\.config\.ts\.timestamp/,
  /^investigation.*\.pdf$/,
  /\.local$/,
  /^scripts\/ewo035-bootstrap-github\.mjs$/,
];

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /github_pat_[a-zA-Z0-9]{22}/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[a-zA-Z0-9]/,
  /BEGIN.*PRIVATE KEY/,
];

function shouldExclude(path) {
  return EXCLUDE_PATTERNS.some(p => p.test(path));
}

function containsSecret(content) {
  return SECRET_PATTERNS.some(p => p.test(content));
}

function collectFiles(dir, base = '') {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relPath = base ? `${base}/${entry}` : entry;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (shouldExclude(relPath + '/')) continue;
      files.push(...collectFiles(fullPath, relPath));
    } else {
      if (shouldExclude(relPath)) continue;
      files.push(relPath);
    }
  }
  return files;
}

async function main() {
  console.log('Collecting files...');
  const allFiles = collectFiles('.');
  console.log(`Found ${allFiles.length} files`);

  // Safety scan — skip files that contain the patterns as code (not actual secrets)
  const SCAN_SKIP = ['scripts/ewo035-bootstrap-github.mjs', 'supabase/functions/github-bootstrap/index.ts'];
  const secretHits = [];
  for (const f of allFiles) {
    if (SCAN_SKIP.includes(f)) continue;
    try {
      const content = readFileSync(f, 'utf-8');
      if (containsSecret(content)) {
        secretHits.push(f);
      }
    } catch {
      // Binary file, skip content scan
    }
  }
  if (secretHits.length > 0) {
    console.error('SECRET SCAN FAILED — refusing to push:');
    secretHits.forEach(f => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log('Secret scan passed — no secrets detected');

  // Build file payloads — detect binary files and encode as base64
  const filePayloads = [];
  for (const f of allFiles) {
    const buffer = readFileSync(f);
    // Check if file is binary by looking for null bytes or non-UTF-8 sequences
    const isBinary = buffer.includes(0) || /[\x80-\xFF]/.test(buffer.toString('latin1').slice(0, 8000));
    if (isBinary) {
      filePayloads.push({ path: f, content: buffer.toString('base64'), encoding: 'base64' });
    } else {
      filePayloads.push({ path: f, content: buffer.toString('utf-8') });
    }
  }

  console.log(`Total files to push: ${filePayloads.length}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  const batches = Math.ceil(filePayloads.length / BATCH_SIZE);
  console.log(`Batches: ${batches}`);

  let lastCommitSha = null;

  for (let i = 0; i < batches; i++) {
    const batch = filePayloads.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const isFirst = i === 0;
    const msg = isFirst
      ? 'chore: bootstrap EIOS canonical GitHub repository'
      : `chore: bootstrap EIOS canonical GitHub repository (batch ${i + 1}/${batches})`;

    console.log(`\nPushing batch ${i + 1}/${batches} (${batch.length} files)...`);

    const response = await fetch(BOOTSTRAP_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner: OWNER,
        repo: REPO,
        files: batch,
        commitMessage: msg,
        credential_ref: 'github_token',
      }),
    });

    const result = await response.json();
    if (!result.success) {
      console.error(`Batch ${i + 1} FAILED:`, JSON.stringify(result, null, 2));
      process.exit(1);
    }

    lastCommitSha = result.commit_sha;
    console.log(`Batch ${i + 1} committed: ${result.commit_sha} (${result.files_committed} files)`);
  }

  console.log(`\n✓ Bootstrap complete. Final commit SHA: ${lastCommitSha}`);
  console.log(`  Repository: https://github.com/${OWNER}/${REPO}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
