/**
 * Tiny shared-state module for WebSocket metrics.
 * Avoids circular imports between index.ts (which owns `wss`) and routes.
 */
let _wsClientCount = 0;

export function incWsClients(): void  { _wsClientCount++; }
export function decWsClients(): void  { _wsClientCount = Math.max(0, _wsClientCount - 1); }
export function getWsClientCount(): number { return _wsClientCount; }
