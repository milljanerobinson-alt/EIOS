// EWO-014.19A.6 — Import Capability Matrix
// Re-exports the import capability model from historicalRecoveryService so
// UI modules can import from a single, purpose-named module.

export {
  IMPORT_CAPABILITY_MATRIX,
  getImportCapability,
  isImportSupported,
  classifyRecoveryBucket,
  RECOVERY_SUMMARY_BUCKETS,
  type ImportCapability,
  type RecoverySummaryBucket,
  type RecoveryBucketLabel,
} from './historicalRecoveryService';
