"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Building2, LoaderCircle, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { PageHeader } from "@/components/shared/page-header";
import { Field, NativeSelect } from "@/components/shared/field";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { departmentSchema } from "@/lib/validators/org";
import { useLookups } from "@/hooks/use-me";
import { api, errorMessage } from "@/lib/api-client";

interface Dept {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string;
  head: { id: string; name: string } | null;
  employeeCount: number;
}

function DeptDialog({ open, onClose, dept }: { open: boolean; onClose: () => void; dept?: Dept }) {
  const qc = useQueryClient();
  const lookups = useLookups(open);
  const form = useForm<z.input<typeof departmentSchema>>({
    resolver: zodResolver(departmentSchema),
    values: dept
      ? { name: dept.name, code: dept.code, description: dept.description ?? "", color: dept.color, headId: dept.head?.id ?? "" }
      : { name: "", code: "", description: "", color: "#6366f1", headId: "" },
  });
  const e = form.formState.errors;
  const submit = form.handleSubmit(async (v) => {
    try {
      if (dept) await api.patch(`/admin/departments/${dept.id}`, v);
      else await api.post("/admin/departments", v);
      toast.success(dept ? "Department updated" : "Department created");
      qc.invalidateQueries({ queryKey: ["admin"] });
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dept ? "Edit department" : "New department"}</DialogTitle>
          <DialogDescription>Departments group employees for filtering and reporting.</DialogDescription>
        </DialogHeader>
        <form id="dept-form" onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Name" htmlFor="dn" error={e.name?.message}><Input id="dn" {...form.register("name")} /></Field>
            <Field label="Code" htmlFor="dc" error={e.code?.message}><Input id="dc" {...form.register("code")} /></Field>
          </div>
          <Field label="Description" htmlFor="dd"><Input id="dd" {...form.register("description")} /></Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Department head" htmlFor="dh">
              <NativeSelect id="dh" {...form.register("headId")}>
                <option value="">— None —</option>
                {lookups.data?.employees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Color" htmlFor="dcol" error={e.color?.message}><Input id="dcol" type="color" className="h-9 p-1" {...form.register("color")} /></Field>
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="dept-form" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <LoaderCircle className="animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DepartmentsPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; dept?: Dept }>({ open: false });
  const { data, isLoading } = useQuery({ queryKey: ["admin", "departments"], queryFn: () => api.get<Dept[]>("/admin/departments") });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/departments/${id}`),
    onSuccess: () => { toast.success("Department deleted"); qc.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const total = data?.reduce((s, d) => s + d.employeeCount, 0) ?? 0;

  return (
    <div className="grid gap-6">
      <PageHeader title="Departments" description={data ? `${data.length} departments · ${total} assigned employees` : undefined} actions={<Button onClick={() => setDialog({ open: true })}><Plus /> New department</Button>} />
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}</div>
      ) : !data?.length ? (
        <EmptyState icon={Building2} title="No departments yet" description="Create departments to organize employees and reports." action={<Button size="sm" onClick={() => setDialog({ open: true })}>New department</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              whileHover={{ y: -2 }}
              className="group relative overflow-hidden rounded-xl bg-card p-5 card-elevated"
            >
              <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: d.color }} />
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg text-xs font-semibold" style={{ background: `${d.color}1f`, color: d.color }}>{d.code.slice(0, 3)}</span>
                  <div>
                    <div className="font-semibold">{d.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{d.code}</div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setDialog({ open: true, dept: d })}><Pencil /></Button>
                  <ConfirmDialog
                    trigger={<Button size="icon-sm" variant="ghost" aria-label="Delete" className="text-danger"><Trash2 /></Button>}
                    title={`Delete ${d.name}?`}
                    description={`${d.employeeCount} employee(s) will become unassigned. Their records are kept.`}
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => remove.mutateAsync(d.id)}
                  />
                </div>
              </div>
              <p className="mt-3 line-clamp-2 min-h-[2.5em] text-[13px] text-muted-foreground">{d.description ?? "No description"}</p>
              <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" /><span className="font-medium text-foreground tabular">{d.employeeCount}</span> employees</span>
                <span>Head: <span className="font-medium text-foreground">{d.head?.name ?? "—"}</span></span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <DeptDialog open={dialog.open} dept={dialog.dept} onClose={() => setDialog({ open: false })} />
    </div>
  );
}
