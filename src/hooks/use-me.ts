"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Lookups, Me } from "@/lib/types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me"), staleTime: 5 * 60_000 });
}

export function useLookups(enabled = true) {
  return useQuery({
    queryKey: ["admin", "lookups"],
    queryFn: () => api.get<Lookups>("/admin/lookups"),
    staleTime: 60_000,
    enabled,
  });
}
