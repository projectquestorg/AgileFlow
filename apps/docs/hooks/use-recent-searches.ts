"use client"

import * as React from "react"

const STORAGE_KEY = "agileflow-recent-searches"
const MAX_RECENT_SEARCHES = 5

export interface RecentSearch {
  query: string
  timestamp: number
}

/**
 * Hook for managing recent search history in localStorage.
 * Persists searches across sessions with automatic cleanup of old entries.
 */
export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = React.useState<RecentSearch[]>([])

  // Load from localStorage on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as RecentSearch[]
        // Filter out searches older than 7 days
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        const recent = parsed.filter((s) => s.timestamp > weekAgo)
        setRecentSearches(recent.slice(0, MAX_RECENT_SEARCHES))
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [])

  // Save to localStorage whenever recent searches change
  const saveToStorage = React.useCallback((searches: RecentSearch[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(searches))
    } catch {
      // Ignore localStorage errors (quota exceeded, etc.)
    }
  }, [])

  /**
   * Add a search query to recent history.
   * Deduplicates and maintains max count.
   */
  const addSearch = React.useCallback(
    (query: string) => {
      const trimmed = query.trim()
      if (!trimmed || trimmed.length < 2) return

      setRecentSearches((prev) => {
        // Remove existing entry if present
        const filtered = prev.filter(
          (s) => s.query.toLowerCase() !== trimmed.toLowerCase()
        )

        // Add new entry at the beginning
        const updated = [
          { query: trimmed, timestamp: Date.now() },
          ...filtered,
        ].slice(0, MAX_RECENT_SEARCHES)

        saveToStorage(updated)
        return updated
      })
    },
    [saveToStorage]
  )

  /**
   * Remove a specific search from history.
   */
  const removeSearch = React.useCallback(
    (query: string) => {
      setRecentSearches((prev) => {
        const filtered = prev.filter(
          (s) => s.query.toLowerCase() !== query.toLowerCase()
        )
        saveToStorage(filtered)
        return filtered
      })
    },
    [saveToStorage]
  )

  /**
   * Clear all recent searches.
   */
  const clearSearches = React.useCallback(() => {
    setRecentSearches([])
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
  }, [])

  return {
    recentSearches,
    addSearch,
    removeSearch,
    clearSearches,
  }
}
