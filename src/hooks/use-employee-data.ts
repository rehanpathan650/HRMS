"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AttendanceRecord, EmployeeSummary, LeaveBalance, LeaveRequest, Paginated } from "@/lib/types";

export function useMySummary(from: string, to: string) {
  return useQuery({
    queryKey: ["attendance", "me", from, to],
    queryFn: () => api.get<EmployeeSummary>("/attendance/me", { from, to }),
  });
}

export function useMyRecords(params: { page: number; pageSize?: number; from?: string; to?: string; status?: string }) {
  return useQuery({
    queryKey: ["attendance", "records", params],
    queryFn: () =>
      api.get<Paginated<AttendanceRecord & { evidence: { type: string; distanceMeters: number | null; withinGeofence: boolean; accuracyMeters: number }[] }>>(
        "/attendance/me/records",
        { pageSize: 10, ...params },
      ),
    placeholderData: (prev) => prev,
  });
}

export function useMyBalances(year?: number) {
  return useQuery({
    queryKey: ["leaves", "balances", year],
    queryFn: () => api.get<LeaveBalance[]>("/leaves/balances", { year }),
  });
}

export function useMyLeaves(params: { page: number; status?: string; pageSize?: number }) {
  return useQuery({
    queryKey: ["leaves", "mine", params],
    queryFn: () => api.get<Paginated<LeaveRequest>>("/leaves", { pageSize: 10, ...params }),
    placeholderData: (prev) => prev,
  });
}
