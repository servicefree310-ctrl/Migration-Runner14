import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, patch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/premium/PageHeader";
import { SectionCard } from "@/components/premium/SectionCard";
import { StatusPill } from "@/components/premium/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Plus, Trash2, ArrowUp, ArrowDown, Settings2, ShieldCheck, Lock,
  CreditCard, IndianRupee, ArrowDownToLine, ArrowUpFromLine, ImageIcon,
  Type as TypeIcon, AlignLeft, Calendar as CalendarIcon, Hash, ListChecks,
} from "lucide-react";

type FieldType = "text" | "textarea" | "date" | "number" | "identity" | "image" | "select";

type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  regex?: string;
  placeholder?: string;
  helperText?: string;
  options?: string[];
};

type Template = {
  level: number;
  name: string;
  description: string;
  depositLimit: string;
  withdrawLimit: string;
  tradeLimit: string;
  features: string;
  fields: string;
  enabled: boolean;
};

const ALL_FEATURES = ["deposit", "withdraw", "trade", "futures", "earn", "p2p", "card"] as const;

const FIELD_PRESETS: Array<{ key: string; label: string; type: FieldType; regex?: string; placeholder?: string; helperText?: string }> = [
  { key: "fullName", label: "Full Name", type: "text", placeholder: "RAVI KUMAR SHARMA" },
  { key: "dob", label: "Date of Birth", type: "date" },
  { key: "address", label: "Residential Address", type: "textarea", placeholder: "House / Street / City / State / PIN" },
  { key: "panNumber", label: "PAN Number", type: "identity", regex: "^[A-Z]{5}[0-9]{4}[A-Z]$", placeholder: "ABCDE1234F", helperText: "10 characters, format AAAAA1111A" },
  { key: "aadhaarNumber", label: "Aadhaar Number", type: "identity", regex: "^\\d{12}$", placeholder: "1234 5678 9012", helperText: "12-digit Aadhaar" },
  { key: "panDoc", label: "PAN Card Image", type: "image" },
  { key: "aadhaarDoc", label: "Aadhaar Card Image", type: "image" },
  { key: "selfie", label: "Selfie holding PAN Card", type: "image" },
];

const TYPE_ICON: Record<FieldType, typeof TypeIcon> = {
  text: TypeIcon,
  textarea: AlignLeft,
  date: CalendarIcon,
  number: Hash,
  identity: ShieldCheck,
  image: ImageIcon,
  select: ListChecks,
};

function parseList(raw: string): string[] {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}
function parseFields(raw: string): FieldDef[] {
  try {
    const v = JSON.parse(raw || "[]");
    if (!Array.isArray(v)) return [];
    return v.map((f) => ({
      key: String(f.key ?? ""),
      label: String(f.label ?? f.key ?? ""),
      type: (f.type ?? "text") as FieldType,
      required: Boolean(f.required),
      regex: typeof f.regex === "string" ? f.regex : undefined,
      placeholder: typeof f.placeholder === "string" ? f.placeholder : undefined,
      helperText: typeof f.helperText === "string" ? f.helperText : undefined,
      options: Array.isArray(f.options) ? f.options.map(String) : undefined,
    }));
  } catch { return []; }
}
function fmtINR(v: string) {
  const n = Number(v);
  if (!isFinite(n)) return v;
  return "₹" + n.toLocaleString("en-IN");
}

export default function KycTemplatesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/admin/kyc-settings"],
    queryFn: () => get<Template[]>("/admin/kyc-settings"),
  });
  const [editing, setEditing] = useState<Template | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Users & Compliance"
        title="KYC Templates"
        description="Configure verification levels users see in the app — name, description, daily limits, unlocked features and the form fields they must submit."
      />

      {!isAdmin && (
        <div className="flex items-center gap-2 text-xs text-amber-300/80 px-3 py-2 rounded-md border border-amber-400/20 bg-amber-400/5">
          <Lock className="w-3.5 h-3.5" />
          You have read-only access. Editing requires admin or superadmin role.
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="premium-card p-6 h-56 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {templates.map((t) => (
            <TemplateCard key={t.level} template={t} onEdit={() => setEditing(t)} canEdit={isAdmin} />
          ))}
        </div>
      )}

      <SectionCard
        title="How it works"
        description="The fields you list here are what users see in the mobile and web KYC forms. The submit endpoint validates against this configuration — no code change needed when you tweak a level."
      >
        <div className="grid gap-3 sm:grid-cols-3 text-xs text-muted-foreground">
          <div className="rounded-md border border-border/50 p-3">
            <div className="text-amber-300/90 text-[11px] uppercase tracking-wide mb-1">Field types</div>
            <code className="text-foreground/85">text · textarea · date · number · identity · image · select</code>
          </div>
          <div className="rounded-md border border-border/50 p-3">
            <div className="text-amber-300/90 text-[11px] uppercase tracking-wide mb-1">Validation</div>
            Optional regex per field is applied server-side on submit. Identity fields auto-uppercase and strip spaces.
          </div>
          <div className="rounded-md border border-border/50 p-3">
            <div className="text-amber-300/90 text-[11px] uppercase tracking-wide mb-1">Custom fields</div>
            Any field key outside the core 8 (PAN, Aadhaar, etc.) is stored in <code>kyc_records.extra</code> as JSON.
          </div>
        </div>
      </SectionCard>

      <EditSheet
        template={editing}
        onClose={() => setEditing(null)}
        canEdit={isAdmin}
      />
    </div>
  );
}

function TemplateCard({ template, onEdit, canEdit }: { template: Template; onEdit: () => void; canEdit: boolean }) {
  const fields = useMemo(() => parseFields(template.fields), [template.fields]);
  const features = useMemo(() => parseList(template.features), [template.features]);
  return (
    <div className="premium-card p-5 flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="stat-orb shrink-0">
          <span className="text-amber-300 font-bold text-base">L{template.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-foreground truncate">{template.name || `Level ${template.level}`}</div>
            <StatusPill status={template.enabled ? "active" : "inactive"} />
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description || "No description set."}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <LimitChip icon={ArrowDownToLine} label="Deposit" value={fmtINR(template.depositLimit)} />
        <LimitChip icon={ArrowUpFromLine} label="Withdraw" value={fmtINR(template.withdrawLimit)} />
        <LimitChip icon={CreditCard} label="Trade" value={fmtINR(template.tradeLimit)} />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Fields ({fields.length})</div>
        <div className="flex flex-wrap gap-1">
          {fields.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">No fields configured</span>
          ) : (
            fields.slice(0, 6).map((f) => {
              const Icon = TYPE_ICON[f.type] ?? TypeIcon;
              return (
                <Badge key={f.key} variant="secondary" className="text-[10px] gap-1 font-normal">
                  <Icon className="w-2.5 h-2.5" />
                  {f.label}
                  {f.required && <span className="text-amber-400">*</span>}
                </Badge>
              );
            })
          )}
          {fields.length > 6 && (
            <Badge variant="outline" className="text-[10px] font-normal">+{fields.length - 6} more</Badge>
          )}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Unlocked features</div>
        <div className="flex flex-wrap gap-1">
          {features.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">None</span>
          ) : features.map((f) => (
            <Badge key={f} className="text-[10px] gold-bg-soft text-amber-300 border border-amber-400/20 font-normal capitalize">{f}</Badge>
          ))}
        </div>
      </div>

      <Button onClick={onEdit} className="w-full mt-auto" size="sm" variant={canEdit ? "default" : "outline"}>
        <Settings2 className="w-4 h-4 mr-2" />
        {canEdit ? "Edit template" : "View template"}
      </Button>
    </div>
  );
}

function LimitChip({ icon: Icon, label, value }: { icon: typeof IndianRupee; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-[hsl(222_18%_8%)] px-2 py-1.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Icon className="w-2.5 h-2.5" />
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-[12px] font-medium text-amber-200/90 truncate">{value}</div>
    </div>
  );
}

function EditSheet({ template, onClose, canEdit }: { template: Template | null; onClose: () => void; canEdit: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Template | null>(null);

  useEffect(() => {
    setDraft(template ? { ...template } : null);
  }, [template]);

  const features = useMemo(() => (draft ? parseList(draft.features) : []), [draft]);
  const fields = useMemo(() => (draft ? parseFields(draft.fields) : []), [draft]);

  const setFields = (next: FieldDef[]) =>
    setDraft((d) => (d ? { ...d, fields: JSON.stringify(next) } : d));
  const setFeatures = (next: string[]) =>
    setDraft((d) => (d ? { ...d, features: JSON.stringify(next) } : d));

  const save = useMutation({
    mutationFn: async (body: Partial<Template>) =>
      patch(`/admin/kyc-settings/${template!.level}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/kyc-settings"] });
      toast({ title: "KYC template updated", description: `Level ${template!.level} saved successfully.` });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    },
  });

  if (!template || !draft) return null;

  const handleSave = () => {
    save.mutate({
      name: draft.name,
      description: draft.description,
      depositLimit: draft.depositLimit,
      withdrawLimit: draft.withdrawLimit,
      tradeLimit: draft.tradeLimit,
      features: draft.features,
      fields: draft.fields,
      enabled: draft.enabled,
    });
  };

  return (
    <Sheet open={!!template} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto bg-[hsl(222_22%_5%)]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="stat-orb">
              <span className="text-amber-300 font-bold text-sm">L{draft.level}</span>
            </span>
            <span>Level {draft.level} Template</span>
          </SheetTitle>
          <SheetDescription>
            Changes apply immediately to the KYC submit endpoint and to every client that fetches{" "}
            <code className="text-amber-300/80">/kyc/settings</code>.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="general" className="mt-6">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="limits">Limits</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="fields">Fields ({fields.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label>Display Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Basic Verification"
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Shown to users when they pick this level."
                rows={3}
                disabled={!canEdit}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2.5">
              <div>
                <div className="text-sm font-medium">Enabled for users</div>
                <div className="text-[11px] text-muted-foreground">Disabled levels are rejected on submit and hidden from the level picker.</div>
              </div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                disabled={!canEdit}
              />
            </div>
          </TabsContent>

          <TabsContent value="limits" className="space-y-4 mt-4">
            <LimitInput label="Daily Deposit (INR)" value={draft.depositLimit} onChange={(v) => setDraft({ ...draft, depositLimit: v })} disabled={!canEdit} />
            <LimitInput label="Daily Withdraw (INR)" value={draft.withdrawLimit} onChange={(v) => setDraft({ ...draft, withdrawLimit: v })} disabled={!canEdit} />
            <LimitInput label="Daily Trade (INR)" value={draft.tradeLimit} onChange={(v) => setDraft({ ...draft, tradeLimit: v })} disabled={!canEdit} />
          </TabsContent>

          <TabsContent value="features" className="space-y-2 mt-4">
            <p className="text-xs text-muted-foreground">Toggle which surfaces unlock when a user reaches this level.</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_FEATURES.map((f) => {
                const on = features.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setFeatures(on ? features.filter((x) => x !== f) : [...features, f])}
                    className={
                      "flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm transition-colors " +
                      (on
                        ? "bg-amber-400/10 border-amber-400/40 text-amber-200"
                        : "bg-[hsl(222_18%_8%)] border-border/50 text-muted-foreground hover-elevate")
                    }
                  >
                    <span className="capitalize">{f}</span>
                    <span className={"w-2 h-2 rounded-full " + (on ? "bg-amber-300 shadow-[0_0_6px_2px_rgba(245,180,0,0.5)]" : "bg-muted")} />
                  </button>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="fields" className="space-y-3 mt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Drag-free reorder with the arrow buttons. Required fields show an amber asterisk to users.</p>
              <AddFieldMenu
                disabled={!canEdit}
                existingKeys={fields.map((f) => f.key)}
                onAdd={(f) => setFields([...fields, f])}
              />
            </div>
            {fields.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No fields yet — add at least one required field so users can submit this level.
              </div>
            ) : (
              <div className="space-y-2">
                {fields.map((f, idx) => (
                  <FieldEditor
                    key={`${f.key}-${idx}`}
                    field={f}
                    canEdit={canEdit}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < fields.length - 1}
                    onChange={(next) => {
                      const arr = fields.slice();
                      arr[idx] = next;
                      setFields(arr);
                    }}
                    onRemove={() => setFields(fields.filter((_, i) => i !== idx))}
                    onMoveUp={() => {
                      const arr = fields.slice();
                      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                      setFields(arr);
                    }}
                    onMoveDown={() => {
                      const arr = fields.slice();
                      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                      setFields(arr);
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 -mx-6 px-6 py-4 mt-6 bg-[hsl(222_22%_5%)]/95 backdrop-blur border-t border-border flex items-center justify-between gap-3">
          <div className="text-[11px] text-muted-foreground">
            Level <span className="text-foreground">{draft.level}</span> · {fields.length} fields · {features.length} features
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={!canEdit || save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LimitInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="pl-8 font-mono"
        />
      </div>
      <div className="text-[11px] text-muted-foreground">≈ {fmtINR(value)}</div>
    </div>
  );
}

function AddFieldMenu({ existingKeys, onAdd, disabled }: { existingKeys: string[]; onAdd: (f: FieldDef) => void; disabled?: boolean }) {
  const available = FIELD_PRESETS.filter((p) => !existingKeys.includes(p.key));
  const [pickKey, setPickKey] = useState<string>("__custom");
  // Custom-field dialog state. Replaces window.prompt/alert with a properly-
  // themed dialog that supports inline validation and keyboard a11y.
  const [customOpen, setCustomOpen] = useState(false);
  const [customKey, setCustomKey] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  // Keys must be a valid JS identifier-ish (camelCase, no spaces / punctuation).
  // We also reject anything already in use to keep the field list unique.
  const validateCustom = (rawKey: string, rawLabel: string): string | null => {
    const k = rawKey.trim();
    if (!k) return "Key is required";
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)) return "Key must be camelCase letters/digits, no spaces";
    if (existingKeys.includes(k)) return `Key "${k}" is already used`;
    if (!rawLabel.trim()) return "Label is required";
    return null;
  };

  const submitCustom = () => {
    const err = validateCustom(customKey, customLabel);
    if (err) { setCustomError(err); return; }
    onAdd({ key: customKey.trim(), label: customLabel.trim(), type: "text", required: false });
    setCustomOpen(false);
    setCustomKey(""); setCustomLabel(""); setCustomError(null);
  };

  const handleAdd = () => {
    if (pickKey === "__custom") {
      // Open the dialog instead of using window.prompt.
      setCustomError(null);
      setCustomOpen(true);
      return;
    }
    const preset = FIELD_PRESETS.find((p) => p.key === pickKey);
    if (!preset) return;
    onAdd({
      key: preset.key,
      label: preset.label,
      type: preset.type,
      required: true,
      regex: preset.regex,
      placeholder: preset.placeholder,
      helperText: preset.helperText,
    });
    setPickKey("__custom");
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={pickKey} onValueChange={setPickKey}>
        <SelectTrigger className="w-[180px] h-8 text-xs" disabled={disabled} data-testid="select-add-field-preset">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__custom">Custom field…</SelectItem>
          {available.length > 0 && (
            <>
              {available.map((p) => (
                <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={handleAdd} disabled={disabled} data-testid="button-add-field">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add
      </Button>

      <Dialog
        open={customOpen}
        onOpenChange={(o) => {
          setCustomOpen(o);
          if (!o) { setCustomKey(""); setCustomLabel(""); setCustomError(null); }
        }}
      >
        <DialogContent className="max-w-md" data-testid="dialog-custom-field">
          <DialogHeader>
            <DialogTitle>Add custom KYC field</DialogTitle>
            <DialogDescription>
              Define a one-off field that isn't in the preset list. Keys must be
              camelCase letters/digits and unique within this template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="custom-field-key" className="text-xs">Field key</Label>
              <Input
                id="custom-field-key"
                value={customKey}
                onChange={(e) => { setCustomKey(e.target.value); if (customError) setCustomError(null); }}
                placeholder="e.g. fatherName"
                className="font-mono"
                autoFocus
                data-testid="input-custom-field-key"
                onKeyDown={(e) => { if (e.key === "Enter") submitCustom(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-field-label" className="text-xs">Display label</Label>
              <Input
                id="custom-field-label"
                value={customLabel}
                onChange={(e) => { setCustomLabel(e.target.value); if (customError) setCustomError(null); }}
                placeholder="e.g. Father's name"
                data-testid="input-custom-field-label"
                onKeyDown={(e) => { if (e.key === "Enter") submitCustom(); }}
              />
            </div>
            {customError && (
              <div className="text-xs text-red-300 bg-red-500/[0.08] border border-red-500/25 rounded-md px-2.5 py-1.5" role="alert">
                {customError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomOpen(false)}
              data-testid="button-custom-field-cancel"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submitCustom}
              data-testid="button-custom-field-add"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldEditor({
  field, canEdit, canMoveUp, canMoveDown, onChange, onRemove, onMoveUp, onMoveDown,
}: {
  field: FieldDef;
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (f: FieldDef) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [open, setOpen] = useState(false);
  const Icon = TYPE_ICON[field.type] ?? TypeIcon;
  return (
    <div className="rounded-md border border-border/60 bg-[hsl(222_18%_7%)]">
      <div className="flex items-center gap-2 p-2.5">
        <Icon className="w-4 h-4 text-amber-300/80 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {field.label} {field.required && <span className="text-amber-400">*</span>}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">{field.key} · {field.type}</div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveUp} disabled={!canEdit || !canMoveUp}>
          <ArrowUp className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onMoveDown} disabled={!canEdit || !canMoveDown}>
          <ArrowDown className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen((o) => !o)} disabled={!canEdit}>
          {open ? "Done" : "Edit"}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-300 hover:text-red-200" onClick={onRemove} disabled={!canEdit}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      {open && (
        <div className="border-t border-border/60 p-3 space-y-3 bg-[hsl(222_18%_5%)]">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Label (shown to user)</Label>
              <Input value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} disabled={!canEdit} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Type</Label>
              <Select value={field.type} onValueChange={(v) => onChange({ ...field, type: v as FieldType })} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["text", "textarea", "date", "number", "identity", "image", "select"] as FieldType[]).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Placeholder</Label>
              <Input value={field.placeholder ?? ""} onChange={(e) => onChange({ ...field, placeholder: e.target.value })} disabled={!canEdit} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Validation regex (optional)</Label>
              <Input value={field.regex ?? ""} onChange={(e) => onChange({ ...field, regex: e.target.value })} disabled={!canEdit} className="font-mono text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Helper text</Label>
            <Input value={field.helperText ?? ""} onChange={(e) => onChange({ ...field, helperText: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2">
            <span className="text-sm">Required</span>
            <Switch checked={field.required} onCheckedChange={(v) => onChange({ ...field, required: v })} disabled={!canEdit} />
          </div>
        </div>
      )}
    </div>
  );
}
