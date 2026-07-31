#!/usr/bin/env node
/**
 * EWO-045R1 — Re-sync missing EIOS source to canonical GitHub repository.
 * Pushes only files that are absent on GitHub, using the github-bootstrap
 * edge function's bootstrap-commit operation (Contents API).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.argv[2] || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.argv[3] || process.env.VITE_SUPABASE_ANON_KEY;
const OWNER = 'milljanerobinson-alt';
const REPO = 'EIOS';
const BRANCH = 'main';
const BATCH_SIZE = 40;
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
  /^vite\.config\.ts\.timestamp/,
  /^investigation.*\.pdf$/,
  /\.local$/,
  /^scripts\/ewo035-bootstrap-github\.mjs$/,
  /^scripts\/ewo045r1-resync-github\.mjs$/,
];

const SECRET_PATTERNS = [
  /sk-proj-[a-zA-Z0-9]{20,}/,
  /sk-[a-zA-Z0-9]{40,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /github_pat_[a-zA-Z0-9]{82}/,
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[a-zA-Z0-9]/,
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

async function getGithubTree() {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`);
  const data = await res.json();
  if (!data.tree) {
    console.error('Failed to fetch GitHub tree:', data);
    process.exit(1);
  }
  return new Set(data.tree.map(e => e.path));
}

async function main() {
  console.log('Collecting local files...');
  const localFiles = collectFiles('.');
  console.log(`Found ${localFiles.length} local files`);

  console.log('Fetching GitHub tree...');
  const githubPaths = await getGithubTree();
  console.log(`GitHub has ${githubPaths.size} entries`);

  const missing = localFiles.filter(f => !githubPaths.has(f));
  console.log(`\nMissing from GitHub: ${missing.length} files`);
  missing.forEach(f => console.log(`  ${f}`));

  if (missing.length === 0) {
    console.log('Nothing to sync — repository is up to date.');
    return;
  }

  // Secret scan
  const secretHits = [];
  for (const f of missing) {
    try {
      const content = readFileSync(f, 'utf-8');
      if (containsSecret(content)) {
        secretHits.push(f);
      }
    } catch {
      // Binary file — will be base64 encoded
    }
  }
  if (secretHits.length > 0) {
    console.error('\nSECRET SCAN FAILED — refusing to push:');
    secretHits.forEach(f => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log('\nSecret scan passed — no secrets detected');

  // Build file payloads
  const filePayloads = [];
  for (const f of missing) {
    const buffer = readFileSync(f);
    const isBinary = buffer.includes(0) || /[\x80-\xFF]/.test(buffer.toString('latin1').slice(0, 8000));
    if (isBinary) {
      filePayloads.push({ path: f, content: buffer.toString('base64'), encoding: 'base64' });
    } else {
      filePayloads.push({ path: f, content: buffer.toString('utf-8') });
    }
  }

  console.log(`\nTotal files to push: ${filePayloads.length}`);
  const batches = Math.ceil(filePayloads.length / BATCH_SIZE);
  console.log(`Batches: ${batches}`);

  let lastCommitSha = null;
  let totalCommitted = 0;

  for (let i = 0; i < batches; i++) {
    const batch = filePayloads.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const msg = `chore: re-sync missing EIOS source to canonical repository (EWO-045R1 batch ${i + 1}/${batches})`;

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
    totalCommitted += result.files_committed;
    console.log(`Batch ${i + 1} committed: ${result.commit_sha} (${result.files_committed} files)`);
  }

  console.log(`\n✓ Re-sync complete. ${totalCommitted} files committed.`);
  console.log(`  Final commit SHA: ${lastCommitSha}`);
  console.log(`  Repository: https://github.com/${OWNER}/${REPO}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
