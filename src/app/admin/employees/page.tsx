"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Search, UserPlus, Users } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/shared/page-header";
import { NativeSelect } from "@/components/shared/field";
import { Pagination } from "@/components/shared/pagination";
import { PersonCell } from "@/components/shared/user-avatar";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { EmployeeFormDialog } from "@/components/admin/employee-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { useLookups } from "@/hooks/use-me";
import { api } from "@/lib/api-client";
import { fmtDate } from "@/lib/format";
import type { Employee, Paginated } from "@/lib/types";
import { cn } from "@/lib/utils";

type Sort = "name" | "employeeCode" | "department" | "designation" | "joiningDate";

export default function EmployeesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: Sort; order: "asc" | "desc" }>({ key: "name", order: "asc" });
  const [creating, setCreating] = useState(false);
  const q = useDebounce(search);
  const lookups = useLookups();
  const params = { page, pageSize: 15, search: q || undefined, departmentId: dept || undefined, status: status || undefined, sort: sort.key, order: sort.order };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "employees", params],
    queryFn: () => api.get<Paginated<Employee>>("/admin/employees", params),
    placeholderData: (p) => p,
  });

  const Head = ({ k, children, className }: { k: Sort; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setSort((s) => ({ key: k, order: s.key === k && s.order === "asc" ? "desc" : "asc" }))}
      >
        {children}
        {sort.key === k && (sort.order === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </TableHead>
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Employees"
        description={data ? `${data.total} people in your organization` : "Manage your workforce"}
        actions={<Button onClick={() => setCreating(true)}><UserPlus /> Add employee</Button>}
      />
      <SectionCard bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, email, ID, title…" className="h-8 pl-8 text-[13px]" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <NativeSelect value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} className="h-8 w-auto text-xs" aria-label="Department">
            <option value="">All departments</option>
            {lookups.data?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </NativeSelect>
          <NativeSelect value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-8 w-auto text-xs" aria-label="Status">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PROBATION">Probation</option>
            <option value="NOTICE">Notice period</option>
            <option value="INACTIVE">Inactive</option>
            <option value="TERMINATED">Terminated</option>
          </NativeSelect>
        </div>
        <div className={cn("transition-opacity", isFetching && !isLoading && "opacity-70")}>
          {isLoading ? (
            <div className="grid gap-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
          ) : !data?.items.length ? (
            <EmptyState icon={Users} title="No employees found" description={q || dept || status ? "Try clearing your filters." : "Add your first employee to get started."} action={<Button size="sm" variant="outline" onClick={() => setCreating(true)}>Add employee</Button>} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <Head k="name" className="pl-4">Name</Head>
                    <Head k="employeeCode">ID</Head>
                    <Head k="designation" className="hidden md:table-cell">Designation</Head>
                    <Head k="department" className="hidden lg:table-cell">Department</Head>
                    <TableHead className="hidden xl:table-cell">Manager</TableHead>
                    <Head k="joiningDate" className="hidden md:table-cell">Joined</Head>
                    <TableHead className="pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((e) => (
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => router.push(`/admin/employees/${e.id}`)}>
                      <TableCell className="pl-4">
                        <Link href={`/admin/employees/${e.id}`} onClick={(ev) => ev.stopPropagation()}>
                          <PersonCell name={e.name} src={e.avatarUrl} subtitle={e.email} />
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{e.employeeCode}</TableCell>
                      <TableCell className="hidden md:table-cell">{e.designation}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {e.department ? (
                          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: e.department.color }} />{e.department.name}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">{e.manager?.name ?? "—"}</TableCell>
                      <TableCell className="hidden tabular md:table-cell">{fmtDate(e.joiningDate)}</TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={e.status} />
                          {e.role === "ADMIN" && <StatusBadge status="ADMIN" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination {...data} onPageChange={setPage} />
            </>
          )}
        </div>
      </SectionCard>
      <EmployeeFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
