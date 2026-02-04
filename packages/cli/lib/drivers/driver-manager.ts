/**
 * Driver Manager
 *
 * Manages multiple CLI drivers and provides a unified interface
 * for the dashboard to interact with any supported CLI.
 */

import { Driver, DriverManager, IREventHandler } from "../protocol/driver";
import { IRSource, IREnvelope } from "../protocol/ir";

/**
 * Default driver manager implementation
 */
export class DefaultDriverManager implements DriverManager {
  private _drivers: Map<IRSource, Driver> = new Map();
  private _defaultId: IRSource | null = null;
  private _globalHandlers: Set<IREventHandler> = new Set();

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  register(driver: Driver): void {
    this._drivers.set(driver.id, driver);

    // Set first registered driver as default
    if (!this._defaultId) {
      this._defaultId = driver.id;
    }

    // Forward driver events to global handlers
    driver.onEvent((envelope) => {
      this._emitGlobal(envelope);
    });

    console.log(`[DriverManager] Registered driver: ${driver.name} (${driver.id})`);
  }

  // -------------------------------------------------------------------------
  // Access
  // -------------------------------------------------------------------------

  get(id: IRSource): Driver | undefined {
    return this._drivers.get(id);
  }

  all(): Driver[] {
    return Array.from(this._drivers.values());
  }

  async available(): Promise<Driver[]> {
    const results: Driver[] = [];
    const drivers = Array.from(this._drivers.values());

    for (const driver of drivers) {
      try {
        const isAvailable = await driver.isAvailable();
        if (isAvailable) {
          results.push(driver);
        }
      } catch {
        // Skip unavailable drivers
      }
    }

    return results;
  }

  default(): Driver | undefined {
    if (!this._defaultId) return undefined;
    return this._drivers.get(this._defaultId);
  }

  setDefault(id: IRSource): void {
    if (this._drivers.has(id)) {
      this._defaultId = id;
      console.log(`[DriverManager] Default driver set to: ${id}`);
    } else {
      throw new Error(`Driver not registered: ${id}`);
    }
  }

  // -------------------------------------------------------------------------
  // Global Event Handling
  // -------------------------------------------------------------------------

  /**
   * Register a global event handler that receives events from all drivers
   */
  onEvent(handler: IREventHandler): void {
    this._globalHandlers.add(handler);
  }

  /**
   * Remove a global event handler
   */
  offEvent(handler: IREventHandler): void {
    this._globalHandlers.delete(handler);
  }

  private _emitGlobal(envelope: IREnvelope): void {
    Array.from(this._globalHandlers).forEach((handler) => {
      try {
        handler(envelope);
      } catch (error) {
        console.error("[DriverManager] Global handler error:", error);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /**
   * Get provider info for all registered drivers
   */
  getProviderInfo(): Array<{
    id: IRSource;
    name: string;
    status: string;
    available: boolean;
    capabilities: string[];
  }> {
    return this.all().map(driver => ({
      id: driver.id,
      name: driver.name,
      status: driver.status.state,
      available: driver.status.state !== "error",
      capabilities: driver.capabilities()
        .filter(c => c.available)
        .map(c => c.name),
    }));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let _instance: DefaultDriverManager | null = null;

/**
 * Get the global driver manager instance
 */
export function getDriverManager(): DefaultDriverManager {
  if (!_instance) {
    _instance = new DefaultDriverManager();
  }
  return _instance;
}

/**
 * Reset the global driver manager (for testing)
 */
export function resetDriverManager(): void {
  _instance = null;
}
