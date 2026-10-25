"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { RevealButton } from "@/components/motion/reveal-button";
import { apiPatch, ApiError } from "@/lib/client/api";

export function SettingsForm({
  knowledgeBaseId,
  initial,
}: {
  knowledgeBaseId: string;
  initial: { name: string; description: string; monitoringFrequency: "MANUAL" | "DAILY" | "WEEKLY" | "MONTHLY" };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await apiPatch(`/api/knowledge-bases/${knowledgeBaseId}`, form);
      setMessage({ kind: "success", text: "Saved." });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof ApiError ? err.message : "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {message && <Alert variant={message.kind === "error" ? "danger" : "default"}>{message.text}</Alert>}
      <div className="flex flex-col gap-1.5">
        <Label>Name</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Monitoring frequency</Label>
        <Select
          value={form.monitoringFrequency}
          onChange={(e) => setForm({ ...form, monitoringFrequency: e.target.value as typeof form.monitoringFrequency })}
          className="w-56"
        >
          <option value="MANUAL">Manual only</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
        </Select>
        <p className="text-xs text-muted">
          Daily/weekly runs are scheduled in-process and only fire while this server is running — see README.
        </p>
      </div>
      <RevealButton delay={0.4} className="self-start">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </Button>
      </RevealButton>
    </div>
  );
}
