"use client";

import { useState, useEffect, useCallback } from "react";
import type { LibItem } from "../lib/types";
import { API } from "../lib/constants";

interface UseLibraryReturn {
  library: LibItem[];
  libLoading: boolean;
  expandedLib: string | null;
  setExpandedLib: (id: string | null) => void;
  fetchLibrary: () => Promise<void>;
}

export function useLibrary(): UseLibraryReturn {
  const [library, setLibrary]       = useState<LibItem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [expandedLib, setExpandedLib] = useState<string | null>(null);

  const fetchLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const r = await fetch(`${API}/api/library`);
      setLibrary(await r.json());
    } catch { /* ignore */ }
    setLibLoading(false);
  }, []);

  useEffect(() => { fetchLibrary(); }, [fetchLibrary]);

  return { library, libLoading, expandedLib, setExpandedLib, fetchLibrary };
}
