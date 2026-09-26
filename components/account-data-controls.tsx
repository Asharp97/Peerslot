"use client";

import { Download, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type AccountDataCopy = {
  dataPrivacy: string;
  dataPrivacyDescription: string;
  exportTitle: string;
  exportDescription: string;
  exportAction: string;
  exporting: string;
  exportError: string;
  deleteTitle: string;
  deleteDescription: string;
  deleteAction: string;
  deleteDialogTitle: string;
  deleteWarning: string;
  deleteConfirmation: string;
  deleteConfirmationLabel: string;
  cancel: string;
  deleting: string;
  deleteError: string;
};

export function AccountDataControls({
  accessToken,
  copy,
  className = "",
  redirectAfterDelete = "/",
}: {
  accessToken: string;
  copy: AccountDataCopy;
  className?: string;
  redirectAfterDelete?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function exportData() {
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `peerslot-account-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(copy.exportError);
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });
      if (!response.ok) throw new Error("delete failed");

      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).catch(() => undefined);
      window.location.assign(redirectAfterDelete);
    } catch {
      setError(copy.deleteError);
      setDeleting(false);
    }
  }

  return (
    <section
      className={cn(
        "rounded-[28px] border border-black/10 bg-white p-6 sm:p-8",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lavender-whisper/60">
          <ShieldCheck size={19} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold">{copy.dataPrivacy}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-black/55">
            {copy.dataPrivacyDescription}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <article className="flex min-w-0 flex-col items-start rounded-2xl border border-black/10 bg-white p-5">
          <h3 className="font-bold">{copy.exportTitle}</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-black/55">
            {copy.exportDescription}
          </p>
          <Button
            className="mt-4 min-h-11 rounded-full px-4"
            disabled={exporting}
            onClick={exportData}
            type="button"
            variant="outline"
          >
            {exporting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Download />
            )}
            {exporting ? copy.exporting : copy.exportAction}
          </Button>
        </article>

        <article className="flex min-w-0 flex-col items-start rounded-2xl border border-red-900/15 bg-red-50/50 p-5">
          <h3 className="font-bold text-red-950">{copy.deleteTitle}</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-red-950/65">
            {copy.deleteDescription}
          </p>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button
                className="mt-4 min-h-11 rounded-full px-4"
                type="button"
                variant="destructive"
              >
                <Trash2 /> {copy.deleteAction}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{copy.deleteDialogTitle}</DialogTitle>
                <DialogDescription className="leading-6">
                  {copy.deleteWarning}
                </DialogDescription>
              </DialogHeader>
              <div>
                <Label htmlFor="delete-account-confirmation">
                  {copy.deleteConfirmationLabel}
                </Label>
                <p className="mt-1 text-xs text-black/50">
                  {copy.deleteConfirmation}
                </p>
                <Input
                  autoComplete="off"
                  className="mt-3"
                  id="delete-account-confirmation"
                  onChange={(event) =>
                    setDeleteConfirmation(event.target.value)
                  }
                  value={deleteConfirmation}
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={deleting}
                  onClick={() => setDeleteOpen(false)}
                  type="button"
                  variant="outline"
                >
                  {copy.cancel}
                </Button>
                <Button
                  disabled={deleteConfirmation !== "DELETE" || deleting}
                  onClick={deleteAccount}
                  type="button"
                  variant="destructive"
                >
                  {deleting ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                  {deleting ? copy.deleting : copy.deleteAction}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </article>
      </div>
      {error ? (
        <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>
      ) : null}
    </section>
  );
}
