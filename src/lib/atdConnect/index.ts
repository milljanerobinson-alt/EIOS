// EWO-024 / EWO-024R.1 / EWO-024R.2 — ATD Connect: Barrel Export
// Single entry point for the ATD Connect governed AI integration platform.

export * from './types';
export {
  discoverCapabilities as discoverCapabilitiesRaw,
  inspectCapability as inspectCapabilityRaw,
  getCapabilitiesByCategory,
  getCapabilityCategories,
  getRegisteredCapabilityIds,
  getCapabilityDefinition,
  getSupportedOperations,
} from './capabilityRegistry';
export * from './inspectionServices';
export * from './auditService';
export * from './healthService';
export * from './conversationBridge';
export * from './canonicalReferenceResolver';
export * from './refusalGuidance';
export * from './mcpServer';
export * from './mcpReadiness';
export * from './canonicalResourceUrl';
