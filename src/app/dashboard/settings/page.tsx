"use client";

import { useState, useRef, useCallback } from "react";
import {
  Plus, CreditCard, Trash2, X, Check, Eye, EyeOff,
  Camera, Shield, AlertTriangle, Smartphone, KeyRound,
} from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";
import { USER } from "@/data/dashboard";

/* ─── types ────────────────────────────────────────────────────────── */
interface Notifications {
  payouts: boolean;
  approvals: boolean;
  activity: boolean;
  marketing: boolean;
}

interface Method { kind: string; detail: string; tone: string; id: string }

const INITIAL_METHODS: Method[] = [
  { id: "m1", kind: "PayPal",  detail: "maya@rivulet.app", tone: "from-ultra to-coral" },
  { id: "m2", kind: "Bank",    detail: "Chase ••4821",     tone: "from-mint to-ultra"  },
];

/* ─── tiny helpers ──────────────────────────────────────────────────── */
function Toggle({
  checked, onChange, label, hint,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-bold text-ink">{label}</p>
        {hint && <p className="text-xs text-ink/55">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-ultra" : "bg-ink/15"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function ModalShell({
  title, subtitle, onClose, children,
}: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl shadow-ink/30">
        <div className="flex items-center justify-between bg-ink px-7 py-5">
          <div>
            {subtitle && <p className="text-xs font-bold uppercase tracking-widest text-white/50">{subtitle}</p>}
            <h2 className="text-xl font-extrabold text-white">{title}</h2>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-7">{children}</div>
      </div>
    </div>
  );
}

/* ─── modal: change password ────────────────────────────────────────── */
function PasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext]       = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr]   = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!current) { setErr("Enter your current password."); return; }
    if (next.length < 8) { setErr("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setErr("Passwords don't match."); return; }
    setDone(true);
  };

  if (done) return (
    <ModalShell title="Password updated" subtitle="Security" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-mint/25 text-emerald-700"><Check className="size-7" /></span>
        <p className="text-sm text-ink/70">Your password has been changed successfully.</p>
        <button type="button" onClick={onClose} className="rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-white hover:bg-ultra">Done</button>
      </div>
    </ModalShell>
  );

  return (
    <ModalShell title="Change password" subtitle="Security" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {[
          { label: "Current password", val: current, set: setCurrent, show: showCurrent, toggle: () => setShowCurrent(v => !v) },
          { label: "New password",     val: next,    set: setNext,    show: showNext,    toggle: () => setShowNext(v => !v)    },
          { label: "Confirm new password", val: confirm, set: setConfirm, show: showNext, toggle: () => {} },
        ].map(({ label, val, set, show, toggle }, i) => (
          <label key={label} className="block">
            <span className="text-sm font-bold text-ink">{label}</span>
            <div className="relative mt-1.5">
              <input
                type={show ? "text" : "password"}
                value={val}
                onChange={e => set(e.target.value)}
                required
                className="w-full rounded-2xl bg-paper px-4 py-3 pr-11 text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-ultra"
              />
              {i < 2 && (
                <button type="button" onClick={toggle} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              )}
            </div>
          </label>
        ))}
        {err && <p className="text-sm font-semibold text-coral">{err}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-full py-2.5 text-sm font-bold text-ink ring-1 ring-ink/15 hover:ring-ink">Cancel</button>
          <button type="submit" className="flex-1 rounded-full bg-ink py-2.5 text-sm font-bold text-white hover:bg-ultra">Update password</button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── modal: 2FA setup ──────────────────────────────────────────────── */
function TwoFAModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"choose" | "sms" | "app" | "done">("choose");
  const [phone, setPhone] = useState("");
  const [code, setCode]   = useState("");
  const [err, setErr]     = useState("");

  const verifySMS = (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (code.length !== 6 || isNaN(Number(code))) { setErr("Enter the 6-digit code."); return; }
    setStep("done");
  };

  if (step === "done") return (
    <ModalShell title="2FA enabled" subtitle="Security" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-mint/25 text-emerald-700"><Shield className="size-7" /></span>
        <p className="text-sm text-ink/70">Two-factor authentication is now active on your account.</p>
        <button type="button" onClick={onClose} className="rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-white hover:bg-ultra">Done</button>
      </div>
    </ModalShell>
  );

  if (step === "choose") return (
    <ModalShell title="Enable 2FA" subtitle="Security" onClose={onClose}>
      <p className="mb-5 text-sm text-ink/65">Choose how you want to receive verification codes.</p>
      <div className="space-y-3">
        <button type="button" onClick={() => setStep("sms")}
          className="flex w-full items-center gap-4 rounded-2xl bg-paper p-4 ring-1 ring-ink/10 text-left transition hover:ring-ultra">
          <span className="grid size-10 place-items-center rounded-xl bg-ultra/10 text-ultra"><Smartphone className="size-5" /></span>
          <div>
            <p className="font-bold text-ink text-sm">SMS / Text message</p>
            <p className="text-xs text-ink/55">We'll send a code to your phone.</p>
          </div>
        </button>
        <button type="button" onClick={() => setStep("app")}
          className="flex w-full items-center gap-4 rounded-2xl bg-paper p-4 ring-1 ring-ink/10 text-left transition hover:ring-ultra">
          <span className="grid size-10 place-items-center rounded-xl bg-saffron/20 text-amber-700"><KeyRound className="size-5" /></span>
          <div>
            <p className="font-bold text-ink text-sm">Authenticator app</p>
            <p className="text-xs text-ink/55">Use Google Authenticator or similar.</p>
          </div>
        </button>
      </div>
    </ModalShell>
  );

  if (step === "app") return (
    <ModalShell title="Authenticator app" subtitle="Security" onClose={onClose}>
      <p className="mb-4 text-sm text-ink/65">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
      {/* placeholder QR */}
      <div className="mx-auto mb-5 grid size-36 place-items-center rounded-2xl bg-paper ring-1 ring-ink/10 text-xs text-ink/40 font-mono select-none">
        QR code here
      </div>
      <form onSubmit={verifySMS} className="space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-ink">Verification code</span>
          <input type="text" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} placeholder="123456"
            className="mt-1.5 w-full rounded-2xl bg-paper px-4 py-3 text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-ultra" />
        </label>
        {err && <p className="text-sm font-semibold text-coral">{err}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={() => setStep("choose")} className="flex-1 rounded-full py-2.5 text-sm font-bold text-ink ring-1 ring-ink/15 hover:ring-ink">Back</button>
          <button type="submit" className="flex-1 rounded-full bg-ink py-2.5 text-sm font-bold text-white hover:bg-ultra">Verify</button>
        </div>
      </form>
    </ModalShell>
  );

  // sms
  return (
    <ModalShell title="SMS verification" subtitle="Security" onClose={onClose}>
      {phone ? (
        <form onSubmit={verifySMS} className="space-y-4">
          <p className="text-sm text-ink/65">Enter the 6-digit code sent to <strong>{phone}</strong>.</p>
          <input type="text" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)}
            placeholder="123456" autoFocus
            className="w-full rounded-2xl bg-paper px-4 py-3 text-center text-xl font-extrabold tracking-widest text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-ultra" />
          {err && <p className="text-sm font-semibold text-coral">{err}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => { setPhone(""); setCode(""); }} className="flex-1 rounded-full py-2.5 text-sm font-bold text-ink ring-1 ring-ink/15 hover:ring-ink">Back</button>
            <button type="submit" className="flex-1 rounded-full bg-ink py-2.5 text-sm font-bold text-white hover:bg-ultra">Verify</button>
          </div>
        </form>
      ) : (
        <form onSubmit={e => { e.preventDefault(); if (phone.trim().length < 7) return; }} className="space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-ink">Phone number</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000"
              className="mt-1.5 w-full rounded-2xl bg-paper px-4 py-3 text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-ultra" />
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("choose")} className="flex-1 rounded-full py-2.5 text-sm font-bold text-ink ring-1 ring-ink/15 hover:ring-ink">Back</button>
            <button
              type="button"
              onClick={() => { if (phone.trim().length >= 7) { /* would POST to API to send SMS */ setPhone(phone); } }}
              className="flex-1 rounded-full bg-ink py-2.5 text-sm font-bold text-white hover:bg-ultra"
            >
              Send code
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

/* ─── modal: add payment method ─────────────────────────────────────── */
function AddMethodModal({ onAdd, onClose }: { onAdd: (m: Method) => void; onClose: () => void }) {
  const [type, setType]     = useState<"paypal" | "bank" | "card">("paypal");
  const [detail, setDetail] = useState("");
  const [done, setDone]     = useState(false);

  const TYPES = [
    { id: "paypal" as const, label: "PayPal",      placeholder: "your@email.com",      tone: "from-ultra to-coral"   },
    { id: "bank"   as const, label: "Bank account", placeholder: "Account ending in …", tone: "from-mint to-ultra"    },
    { id: "card"   as const, label: "Debit card",   placeholder: "Card ending in …",    tone: "from-saffron to-coral" },
  ];

  const selected = TYPES.find(t => t.id === type)!;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail.trim()) return;
    onAdd({
      id: `m${Date.now()}`,
      kind: selected.label,
      detail: detail.trim(),
      tone: selected.tone,
    });
    setDone(true);
  };

  if (done) return (
    <ModalShell title="Method added" subtitle="Payment methods" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-mint/25 text-emerald-700"><Check className="size-7" /></span>
        <p className="text-sm text-ink/70">{selected.label} has been added to your account.</p>
        <button type="button" onClick={onClose} className="rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-white hover:bg-ultra">Done</button>
      </div>
    </ModalShell>
  );

  return (
    <ModalShell title="Add payment method" subtitle="Payment methods" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map(t => (
            <button key={t.id} type="button" onClick={() => setType(t.id)}
              className={`rounded-2xl p-3 text-xs font-bold transition ring-1 ${type === t.id ? "bg-ink text-white ring-ink" : "bg-paper text-ink/70 ring-ink/10 hover:ring-ultra"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="text-sm font-bold text-ink">{selected.label} details</span>
          <input type="text" value={detail} onChange={e => setDetail(e.target.value)}
            placeholder={selected.placeholder} required
            className="mt-1.5 w-full rounded-2xl bg-paper px-4 py-3 text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-ultra" />
        </label>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-full py-2.5 text-sm font-bold text-ink ring-1 ring-ink/15 hover:ring-ink">Cancel</button>
          <button type="submit" className="flex-1 rounded-full bg-ink py-2.5 text-sm font-bold text-white hover:bg-ultra">Add method</button>
        </div>
      </form>
    </ModalShell>
  );
}

/* ─── modal: delete account ─────────────────────────────────────────── */
function DeleteModal({ onClose }: { onClose: () => void }) {
  const [confirm, setConfirm] = useState("");
  const CONFIRM_WORD = "DELETE";
  const ready = confirm === CONFIRM_WORD;

  return (
    <ModalShell title="Delete account" subtitle="Danger zone" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-coral/8 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-coral" />
          <p className="text-sm text-coral">
            This is <strong>permanent and irreversible</strong>. All your flows, payment history, and data will be deleted immediately.
          </p>
        </div>
        <label className="block">
          <span className="text-sm font-bold text-ink">
            Type <strong className="text-coral">{CONFIRM_WORD}</strong> to confirm
          </span>
          <input
            type="text" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder={CONFIRM_WORD} autoComplete="off"
            className="mt-1.5 w-full rounded-2xl bg-paper px-4 py-3 text-ink outline-none ring-1 ring-ink/10 focus:ring-2 focus:ring-coral"
          />
        </label>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-full bg-white py-2.5 text-sm font-bold text-ink ring-1 ring-ink/15 hover:ring-ink">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => alert("Account deletion would be processed by your backend.")}
            className="flex-1 rounded-full bg-coral py-2.5 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete my account
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ─── toast ─────────────────────────────────────────────────────────── */
function SaveToast({ onDone }: { onDone: () => void }) {
  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-full bg-ink px-6 py-3 text-sm font-bold text-white shadow-2xl shadow-ink/40 animate-in fade-in slide-in-from-bottom-4 duration-300"
      onAnimationEnd={onDone}
    >
      <Check className="size-4 text-mint" /> Changes saved
    </div>
  );
}

/* ─── main page ─────────────────────────────────────────────────────── */
export default function SettingsPage() {
  /* profile */
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [fullName,    setFullName]    = useState(USER.full);
  const [displayName, setDisplayName] = useState(USER.name);
  const [email,       setEmail]       = useState("maya@rivulet.app");
  const [phone,       setPhone]       = useState("");
  /* saved copies for cancel */
  const [saved, setSaved] = useState({ fullName: USER.full, displayName: USER.name, email: "maya@rivulet.app", phone: "" });

  /* notifications */
  const [notifications, setNotifications] = useState<Notifications>({
    payouts: true, approvals: true, activity: false, marketing: false,
  });

  /* payment methods */
  const [methods, setMethods] = useState<Method[]>(INITIAL_METHODS);

  /* modals */
  const [modal, setModal] = useState<"password" | "2fa" | "addMethod" | "delete" | null>(null);

  /* toast */
  const [showToast, setShowToast] = useState(false);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarSrc(url);
  };

  const handleSave = () => {
    setSaved({ fullName, displayName, email, phone });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleCancel = () => {
    setFullName(saved.fullName);
    setDisplayName(saved.displayName);
    setEmail(saved.email);
    setPhone(saved.phone);
  };

  const removeMethod = useCallback((id: string) => {
    setMethods(prev => prev.filter(m => m.id !== id));
  }, []);

  const setNotif = (key: keyof Notifications) => (v: boolean) =>
    setNotifications(n => ({ ...n, [key]: v }));

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your account and preferences." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* ── left column ── */}
        <div className="space-y-6">

          {/* profile */}
          <section className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
            <h2 className="text-lg font-extrabold text-ink">Profile</h2>
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Change profile photo"
                className="relative shrink-0 group"
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Profile" className="size-16 rounded-2xl object-cover" />
                ) : (
                  <span className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-saffron to-coral text-xl font-extrabold text-ink">
                    {USER.initials}
                  </span>
                )}
                <span className="absolute inset-0 grid place-items-center rounded-2xl bg-ink/50 opacity-0 transition group-hover:opacity-100">
                  <Camera className="size-5 text-white" />
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handlePhotoChange}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-full bg-paper px-4 py-2 text-sm font-bold text-ink ring-1 ring-ink/10 transition hover:ring-ultra"
              >
                Change photo
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                { label: "Full name",     value: fullName,     set: setFullName     },
                { label: "Display name",  value: displayName,  set: setDisplayName  },
                { label: "Email",         value: email,        set: setEmail        },
                { label: "Phone",         value: phone,        set: setPhone        },
              ].map(({ label, value, set }) => (
                <label key={label} className="block">
                  <span className="text-sm font-bold text-ink">{label}</span>
                  <input
                    type={label === "Email" ? "email" : label === "Phone" ? "tel" : "text"}
                    value={value}
                    onChange={e => set(e.target.value)}
                    placeholder={label === "Phone" ? "+1 (555) 010-0000" : undefined}
                    className="mt-1.5 w-full rounded-2xl bg-paper px-4 py-3 text-ink outline-none ring-1 ring-ink/10 placeholder:text-ink/45 focus:ring-2 focus:ring-ultra"
                  />
                </label>
              ))}
            </div>
          </section>

          {/* payment methods */}
          <section className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-ink">Payment methods</h2>
              <button
                type="button"
                onClick={() => setModal("addMethod")}
                className="inline-flex items-center gap-1.5 rounded-full bg-ultra px-4 py-2 text-sm font-bold text-white transition hover:bg-ink"
              >
                <Plus className="size-4" /> Add
              </button>
            </div>
            {methods.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-paper p-4 text-center text-sm text-ink/55 ring-1 ring-ink/5">
                No payment methods yet.{" "}
                <button type="button" onClick={() => setModal("addMethod")} className="font-bold text-ultra hover:underline">Add one</button>
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {methods.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-2xl bg-paper p-4 ring-1 ring-ink/5">
                    <div className="flex items-center gap-3">
                      <span className={`grid size-10 place-items-center rounded-xl bg-gradient-to-br ${m.tone} text-white`}>
                        <CreditCard className="size-5" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-ink">{m.kind}</p>
                        <p className="text-xs text-ink/55">{m.detail}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMethod(m.id)}
                      aria-label={`Remove ${m.kind}`}
                      className="grid size-9 place-items-center rounded-full text-ink/45 transition hover:bg-coral/15 hover:text-coral"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* danger zone */}
          <section className="rounded-3xl bg-white p-6 ring-1 ring-coral/20">
            <h2 className="text-lg font-extrabold text-coral">Danger zone</h2>
            <p className="mt-1 text-sm text-ink/65">
              Once you delete your account, your flows and data cannot be recovered.
            </p>
            <button
              type="button"
              onClick={() => setModal("delete")}
              className="mt-4 rounded-full bg-coral/10 px-5 py-2.5 text-sm font-bold text-coral ring-1 ring-coral/30 transition hover:bg-coral hover:text-white"
            >
              Delete account
            </button>
          </section>
        </div>

        {/* ── right column ── */}
        <div className="space-y-6">

          {/* notifications */}
          <section className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
            <h2 className="text-lg font-extrabold text-ink">Notifications</h2>
            <div className="mt-2 divide-y divide-ink/5">
              <Toggle label="Payout alerts"     hint="When a payout is sent or scheduled"   checked={notifications.payouts}   onChange={setNotif("payouts")}   />
              <Toggle label="Approval requests" hint="When a flow needs your sign-off"       checked={notifications.approvals} onChange={setNotif("approvals")} />
              <Toggle label="Activity digest"   hint="A daily summary of your flows"         checked={notifications.activity}  onChange={setNotif("activity")}  />
              <Toggle label="Product updates"   hint="New features and templates"            checked={notifications.marketing} onChange={setNotif("marketing")} />
            </div>
          </section>

          {/* security */}
          <section className="rounded-3xl bg-white p-6 ring-1 ring-ink/5">
            <h2 className="text-lg font-extrabold text-ink">Security</h2>
            <ul className="mt-3 space-y-3">
              <li className="flex items-center justify-between rounded-2xl bg-paper p-4 ring-1 ring-ink/5">
                <div>
                  <p className="text-sm font-bold text-ink">Password</p>
                  <p className="text-xs text-ink/55">Last changed 3 months ago</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModal("password")}
                  className="rounded-full bg-white px-4 py-2 text-sm font-bold text-ink ring-1 ring-ink/10 transition hover:ring-ultra"
                >
                  Update
                </button>
              </li>
              <li className="flex items-center justify-between rounded-2xl bg-paper p-4 ring-1 ring-ink/5">
                <div>
                  <p className="text-sm font-bold text-ink">Two-factor auth</p>
                  <p className="text-xs text-ink/55">Recommended for stronger protection</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModal("2fa")}
                  className="rounded-full bg-mint/25 px-4 py-2 text-sm font-bold text-emerald-800 transition hover:bg-mint"
                >
                  Enable
                </button>
              </li>
            </ul>
          </section>

          {/* save / cancel */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink ring-1 ring-ink/10 transition hover:ring-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-white transition hover:bg-ultra"
            >
              Save changes
            </button>
          </div>
        </div>
      </div>

      {/* modals */}
      {modal === "password"  && <PasswordModal   onClose={() => setModal(null)} />}
      {modal === "2fa"       && <TwoFAModal       onClose={() => setModal(null)} />}
      {modal === "addMethod" && <AddMethodModal   onAdd={m => setMethods(prev => [...prev, m])} onClose={() => setModal(null)} />}
      {modal === "delete"    && <DeleteModal      onClose={() => setModal(null)} />}

      {/* toast */}
      {showToast && <SaveToast onDone={() => setShowToast(false)} />}
    </>
  );
}
