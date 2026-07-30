/**
 * EWO-030: Codex Repository & Command Controls
 *
 * Governed restrictions for repository access, file modifications, and
 * command execution through the Codex provider.
 */

import type {
  CodexRepositoryControls,
  CodexCommandGovernance,
  CodexCommandClassification,
  CodexFileChange,
} from './codexTypes';

const PROHIBITED_COMMANDS = [
  'rm -rf /',
  'rm -rf ~',
  'rm -rf /*',
  'chmod 777',
  'curl | sh',
  'curl | bash',
  'wget | sh',
  'wget | bash',
  'dd if=',
  'mkfs',
  'shutdown',
  'reboot',
  'halt',
  'init 0',
  'init 6',
];

const DESTRUCTIVE_COMMANDS = [
  'drop table',
  'drop database',
  'truncate',
  'delete from',
  'drop schema',
  'drop index',
  'drop view',
  'drop function',
  'drop procedure',
  'drop trigger',
  'drop role',
  'drop user',
];

const DEPLOYMENT_COMMANDS = [
  'deploy',
  'publish',
  'release',
  'push --force',
  'push -f',
  'git push --force',
  'git push -f',
  'supabase db push',
  'supabase deploy',
  'npx supabase',
  'fly deploy',
  'flyctl deploy',
  'vercel --prod',
  'netlify deploy --prod',
];

const MIGRATION_COMMANDS = [
  'migrate',
  'migration',
  'supabase migration',
  'prisma migrate',
  'knex migrate',
  'alembic',
  'flyway',
  'liquibase',
];

const TEST_COMMANDS = [
  'npm test',
  'npm run test',
  'npx vitest',
  'npx jest',
  'pytest',
  'cargo test',
  'go test',
  'dotnet test',
  'mvn test',
  'gradle test',
];

const BUILD_COMMANDS = [
  'npm run build',
  'npm run dev',
  'npx vite build',
  'npx tsc',
  'tsc',
  'cargo build',
  'go build',
  'dotnet build',
  'make',
  'cmake',
  'gcc',
  'g++',
];

const READ_ONLY_COMMANDS = [
  'git status',
  'git log',
  'git diff',
  'git branch',
  'git show',
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'stat',
  'file',
  'du',
  'df',
  'ps',
  'top',
  'env',
  'printenv',
];

const SECRET_FILE_PATTERNS = [
  /\.env$/i,
  /\.env\./i,
  /secrets?\./i,
  /credentials?\./i,
  /api[_-]?key/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.ssh\//i,
];

/**
 * Validate file changes against repository controls.
 * Returns violations for any file that is restricted or protected.
 */
export function validateFileChanges(
  fileChanges: CodexFileChange[],
  controls: CodexRepositoryControls,
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const change of fileChanges) {
    // Check protected files
    for (const protectedFile of controls.protected_files) {
      if (matchPath(change.path, protectedFile)) {
        violations.push(`Protected file accessed: ${change.path} (matches pattern: ${protectedFile})`);
      }
    }

    // Check if file is in permitted files (if list is non-empty)
    if (controls.permitted_files.length > 0) {
      const isPermitted = controls.permitted_files.some(pf => matchPath(change.path, pf));
      if (!isPermitted) {
        violations.push(`File not in permitted list: ${change.path}`);
      }
    }

    // Check restricted files (from the request, not the controls)
    // Note: restricted_files is part of the execution request, not the repository controls
    // This check is handled at the pipeline level

    // Check secret-bearing files
    if (!controls.allow_secret_bearing_files && SECRET_FILE_PATTERNS.some(p => p.test(change.path))) {
      violations.push(`Secret-bearing file accessed: ${change.path}`);
    }

    // Check action permissions
    if (change.action === 'create' && !controls.allow_file_creation) {
      violations.push(`File creation not permitted: ${change.path}`);
    }
    if (change.action === 'modify' && !controls.allow_file_modification) {
      violations.push(`File modification not permitted: ${change.path}`);
    }
    if (change.action === 'delete' && !controls.allow_file_deletion) {
      violations.push(`File deletion not permitted: ${change.path}`);
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Classify a command and determine if it is authorised.
 */
export function classifyCommand(
  command: string,
  permittedCommands: string[],
  restrictedCommands: string[],
): CodexCommandGovernance {
  const cmdLower = command.toLowerCase().trim();

  // Check prohibited commands first
  for (const prohibited of PROHIBITED_COMMANDS) {
    if (cmdLower.includes(prohibited.toLowerCase())) {
      return {
        classification: 'prohibited',
        is_authorised: false,
        requires_po_approval: false,
        requires_environment_approval: false,
        rejection_reason: `Command matches prohibited pattern: ${prohibited}`,
      };
    }
  }

  // Check destructive commands
  for (const destructive of DESTRUCTIVE_COMMANDS) {
    if (cmdLower.includes(destructive.toLowerCase())) {
      return {
        classification: 'destructive',
        is_authorised: false,
        requires_po_approval: true,
        requires_environment_approval: true,
        rejection_reason: `Command is destructive and requires PO + environment approval: ${destructive}`,
      };
    }
  }

  // Check deployment commands
  for (const deploy of DEPLOYMENT_COMMANDS) {
    if (cmdLower.includes(deploy.toLowerCase())) {
      return {
        classification: 'deployment',
        is_authorised: false,
        requires_po_approval: true,
        requires_environment_approval: true,
        rejection_reason: `Deployment command requires PO + environment approval: ${deploy}`,
      };
    }
  }

  // Check migration commands
  for (const migration of MIGRATION_COMMANDS) {
    if (cmdLower.includes(migration.toLowerCase())) {
      return {
        classification: 'migration',
        is_authorised: false,
        requires_po_approval: true,
        requires_environment_approval: false,
        rejection_reason: `Migration command requires PO approval: ${migration}`,
      };
    }
  }

  // Check restricted commands
  for (const restricted of restrictedCommands) {
    if (cmdLower.includes(restricted.toLowerCase())) {
      return {
        classification: 'prohibited',
        is_authorised: false,
        requires_po_approval: false,
        requires_environment_approval: false,
        rejection_reason: `Command is in restricted list: ${restricted}`,
      };
    }
  }

  // Check test commands
  for (const test of TEST_COMMANDS) {
    if (cmdLower.startsWith(test.toLowerCase()) || cmdLower.includes(test.toLowerCase())) {
      return {
        classification: 'test',
        is_authorised: true,
        requires_po_approval: false,
        requires_environment_approval: false,
        rejection_reason: null,
      };
    }
  }

  // Check build commands
  for (const build of BUILD_COMMANDS) {
    if (cmdLower.startsWith(build.toLowerCase()) || cmdLower.includes(build.toLowerCase())) {
      return {
        classification: 'build',
        is_authorised: true,
        requires_po_approval: false,
        requires_environment_approval: false,
        rejection_reason: null,
      };
    }
  }

  // Check read-only commands
  for (const readonly of READ_ONLY_COMMANDS) {
    if (cmdLower.startsWith(readonly.toLowerCase())) {
      return {
        classification: 'read_only',
        is_authorised: true,
        requires_po_approval: false,
        requires_environment_approval: false,
        rejection_reason: null,
      };
    }
  }

  // Check permitted commands
  for (const permitted of permittedCommands) {
    if (cmdLower.includes(permitted.toLowerCase())) {
      return {
        classification: 'allowed',
        is_authorised: true,
        requires_po_approval: false,
        requires_environment_approval: false,
        rejection_reason: null,
      };
    }
  }

  // Default: conditionally allowed (needs review)
  return {
    classification: 'conditionally_allowed',
    is_authorised: false,
    requires_po_approval: true,
    requires_environment_approval: false,
    rejection_reason: 'Command not in permitted list — requires PO approval',
  };
}

/**
 * Validate that a repository and branch match the permitted controls.
 */
export function validateRepositoryAccess(
  repository: string,
  branch: string,
  controls: CodexRepositoryControls,
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  if (controls.permitted_repository && repository !== controls.permitted_repository) {
    violations.push(`Repository ${repository} does not match permitted repository ${controls.permitted_repository}`);
  }

  if (controls.permitted_branch && branch !== controls.permitted_branch) {
    violations.push(`Branch ${branch} does not match permitted branch ${controls.permitted_branch}`);
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Get default repository controls for an environment.
 */
export function getDefaultRepositoryControls(environment: 'staging' | 'production'): CodexRepositoryControls {
  return {
    permitted_repository: environment === 'staging' ? 'eios-staging' : 'eios-production',
    permitted_branch: environment === 'staging' ? 'staging' : 'main',
    permitted_directories: ['src/', 'supabase/', 'public/'],
    permitted_files: [],
    protected_files: ['.env', '.env.*', '*.pem', '*.key', 'secrets.*', 'credentials.*'],
    allow_file_creation: true,
    allow_file_modification: true,
    allow_file_deletion: false,
    allow_generated_migrations: environment === 'staging',
    allow_dependency_changes: environment === 'staging',
    allow_env_config_changes: false,
    allow_secret_bearing_files: false,
  };
}

function matchPath(path: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'));
    return regex.test(path);
  }
  return path === pattern || path.startsWith(pattern);
}
