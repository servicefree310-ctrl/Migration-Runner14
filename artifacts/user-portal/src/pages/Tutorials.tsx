import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  UserPlus, ShieldCheck, Wallet, TrendingUp, Users, Trophy,
  CreditCard, ArrowDownToLine, ArrowUpFromLine, Bitcoin,
  KeyRound, Bell, Gift, Bot, PiggyBank, Play, Pause,
  ChevronLeft, ChevronRight, RotateCcw, Check, X,
  IndianRupee, Building, Smartphone, Star, Sparkles,
  GraduationCap, BookOpen, Clock, BarChart2, CirclePlay,
  BadgeCheck, Lock, Eye, Copy, MessageSquare, Settings2,
  Zap, Target, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ─── Types ──────────────────────────────────────────────────────────────── */
type TutorialStep = {
  title: string;
  description: string;
  screen: React.ReactNode;
};
type Tutorial = {
  id: string;
  title: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  steps: TutorialStep[];
  durationMin: number;
};

/* ─── Screen mockup primitives ────────────────────────────────────────────── */
function PhoneFrame({ children, bg = "bg-zinc-900" }: { children: React.ReactNode; bg?: string }) {
  return (
    <div className="relative w-56 h-96 mx-auto rounded-3xl border-4 border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-zinc-800 rounded-b-xl z-10" />
      <div className={`w-full h-full ${bg} overflow-hidden pt-5`}>{children}</div>
    </div>
  );
}

function MockBtn({ label, primary, color = "amber" }: { label: string; primary?: boolean; color?: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 text-center text-xs font-semibold ${primary ? `bg-${color}-500 text-white` : "border border-zinc-600 text-zinc-300"}`}>
      {label}
    </div>
  );
}

function MockField({ label, value, focus }: { label: string; value?: string; focus?: boolean }) {
  return (
    <div className={`rounded-md border text-[10px] px-2 py-1.5 ${focus ? "border-amber-500 bg-amber-500/5" : "border-zinc-700 bg-zinc-800/50"}`}>
      <div className="text-zinc-500 mb-0.5">{label}</div>
      <div className={value ? "text-zinc-200" : "text-zinc-600"}>{value || "—"}</div>
    </div>
  );
}

function MockHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
      <ChevronLeft className="h-3.5 w-3.5 text-zinc-500" />
      <span className="text-[11px] font-bold text-zinc-200">{title}</span>
      <div className="w-3.5" />
    </div>
  );
}

/* ─── All tutorials data ─────────────────────────────────────────────────── */
const TUTORIALS: Tutorial[] = [
  {
    id: "account-create",
    title: "Account Create Karna",
    category: "Getting Started",
    icon: UserPlus,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    durationMin: 3,
    steps: [
      {
        title: "Zebvix App Open Karo",
        description: "App ya website kholte hi Home page dikhega. Yahan 'Create account' button par click karo.",
        screen: (
          <PhoneFrame>
            <div className="px-3 pt-2 space-y-2">
              <div className="text-center py-3">
                <div className="w-10 h-10 bg-amber-500 rounded-xl mx-auto mb-1.5 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-black" />
                </div>
                <div className="text-xs font-bold text-amber-400">ZEBVIX</div>
              </div>
              <div className="text-[10px] text-zinc-400 text-center mb-2">India's Premier Crypto Exchange</div>
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <MockBtn label="Create Account" primary />
              </motion.div>
              <MockBtn label="Sign in" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Email ya Phone Number Dalo",
        description: "Apna email address ya Indian mobile number (10 digits) fill karo. Yahi aapka login ID banega.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Register" />
            <div className="px-3 py-3 space-y-2">
              <div className="text-[11px] font-semibold text-zinc-200 mb-3">Create your account</div>
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="Email or phone" value="you@example.com" focus />
              </motion.div>
              <MockField label="Password" value="••••••••••" />
              <MockField label="Referral code (optional)" />
              <MockBtn label="Continue →" primary />
              <div className="text-[9px] text-zinc-500 text-center">By continuing you agree to our Terms</div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "OTP Verify Karo",
        description: "Aapke email/phone par ek 6-digit OTP aayega. Wohi code yahan enter karo. OTP 10 minutes tak valid hai.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Verify OTP" />
            <div className="px-3 py-4 space-y-3">
              <div className="text-[11px] text-zinc-400 text-center">OTP sent to<br /><span className="text-zinc-200 font-medium">you@example.com</span></div>
              <div className="flex gap-1.5 justify-center my-3">
                {[4, 2, 8, 1, 5, 9].map((d, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className={`w-7 h-9 rounded border text-xs font-bold flex items-center justify-center ${i < 4 ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-zinc-600 bg-zinc-800 text-zinc-300"}`}
                  >
                    {i < 4 ? d : ""}
                  </motion.div>
                ))}
              </div>
              <div className="text-[9px] text-zinc-500 text-center">Resend in 0:45</div>
              <MockBtn label="Verify" primary />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Account Ready!",
        description: "Account ban gaya! Ab aap login ho gaye hain. KYC complete karke deposits aur trading shuru kar sakte hain.",
        screen: (
          <PhoneFrame bg="bg-zinc-900">
            <div className="h-full flex flex-col items-center justify-center px-4 space-y-3">
              <motion.div
                animate={{ scale: [0.8, 1.1, 1] }}
                transition={{ duration: 0.6 }}
                className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center"
              >
                <Check className="h-8 w-8 text-emerald-400" />
              </motion.div>
              <div className="text-sm font-bold text-zinc-100 text-center">Account Created!</div>
              <div className="text-[10px] text-zinc-400 text-center">Welcome to Zebvix. Complete KYC to start trading.</div>
              <MockBtn label="Complete KYC →" primary color="emerald" />
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "kyc-level1",
    title: "KYC Level 1 — PAN Verification",
    category: "KYC",
    icon: ShieldCheck,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    durationMin: 5,
    steps: [
      {
        title: "KYC Page Kholao",
        description: "Sidebar ya Profile menu mein 'KYC' par click karo. Yahan aapka current KYC status dikhega.",
        screen: (
          <PhoneFrame>
            <MockHeader title="KYC Verification" />
            <div className="px-3 py-3 space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center"><ShieldCheck className="h-3.5 w-3.5 text-amber-400" /></div>
                <div><div className="text-[10px] font-semibold text-amber-400">Level 0</div><div className="text-[9px] text-zinc-400">Unverified</div></div>
              </div>
              <div className="space-y-1.5">
                {["Level 1 — PAN", "Level 2 — Aadhaar", "Level 3 — EDD"].map((l, i) => (
                  <div key={i} className={`flex items-center gap-2 p-2 rounded border ${i === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-zinc-700 opacity-40"}`}>
                    <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[9px] text-zinc-400">{i + 1}</div>
                    <span className="text-[10px] text-zinc-300">{l}</span>
                    {i === 0 && <motion.div animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.5 }} className="ml-auto"><ChevronLeft className="h-3 w-3 text-emerald-400 rotate-180" /></motion.div>}
                  </div>
                ))}
              </div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "PAN Number Dalo",
        description: "Apna PAN card number enter karo (10 characters: 5 letters + 4 digits + 1 letter). Uppercase mein likhna hai.",
        screen: (
          <PhoneFrame>
            <MockHeader title="PAN Verification" />
            <div className="px-3 py-3 space-y-2">
              <div className="text-[11px] text-zinc-300 font-semibold mb-2">Enter PAN Details</div>
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="PAN Number" value="ABCDE1234F" focus />
              </motion.div>
              <MockField label="Full name (as on PAN)" value="RAJESH KUMAR" />
              <MockField label="Date of birth" value="01/01/1990" />
              <div className="text-[9px] text-zinc-500 mt-1">Name must match exactly with NSDL records</div>
              <MockBtn label="Verify PAN" primary color="emerald" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "PAN Verified — KYC L1 Done!",
        description: "PAN verify hone ke baad aap KYC Level 1 ho jaate hain. Ab ₹50,000/day tak INR deposit-withdraw kar sakte hain.",
        screen: (
          <PhoneFrame>
            <div className="h-full flex flex-col items-center justify-center px-3 space-y-3">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 3, delay: 0.5 }}
                className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center"
              >
                <BadgeCheck className="h-7 w-7 text-emerald-400" />
              </motion.div>
              <div className="text-sm font-bold text-emerald-400">KYC Level 1 Complete!</div>
              <div className="w-full space-y-1.5">
                {["Spot trading ✓", "INR deposit ₹50k/day ✓", "Copy trading ✓", "AI plans ✓"].map((f) => (
                  <div key={f} className="text-[10px] text-zinc-300 flex items-center gap-1.5">
                    <Check className="h-3 w-3 text-emerald-400 flex-shrink-0" /> {f}
                  </div>
                ))}
              </div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "kyc-level2",
    title: "KYC Level 2 — Aadhaar + Selfie",
    category: "KYC",
    icon: BadgeCheck,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    durationMin: 7,
    steps: [
      {
        title: "KYC → Level 2 Select Karo",
        description: "KYC page par Level 2 card par click karo. Yahan Aadhaar front/back aur selfie upload karni hogi.",
        screen: (
          <PhoneFrame>
            <MockHeader title="KYC Level 2" />
            <div className="px-3 py-3 space-y-2">
              <div className="text-[10px] text-zinc-400">Documents required:</div>
              {["Aadhaar Front", "Aadhaar Back", "Live Selfie"].map((d, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded border border-zinc-700 bg-zinc-800/40">
                  <div className="w-5 h-5 rounded bg-zinc-700 flex items-center justify-center text-[9px] text-zinc-400">{i + 1}</div>
                  <span className="text-[10px] text-zinc-300">{d}</span>
                  <div className="ml-auto w-4 h-4 rounded border border-zinc-600 text-zinc-600 flex items-center justify-center text-[9px]">○</div>
                </div>
              ))}
              <MockBtn label="Start Verification" primary color="emerald" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Aadhaar Front Upload Karo",
        description: "Aadhaar card ka front side (aapki photo wali side) clearly photograph karke upload karo. Image clear aur unblurred honi chahiye.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Aadhaar Front" />
            <div className="px-3 py-3 space-y-2">
              <motion.div
                animate={{ borderColor: ["#4ade80", "#22c55e", "#4ade80"] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="rounded-xl border-2 border-dashed border-emerald-500/50 bg-emerald-500/5 h-28 flex flex-col items-center justify-center gap-1"
              >
                <ArrowDownToLine className="h-6 w-6 text-emerald-400" />
                <div className="text-[9px] text-zinc-400">Tap to upload Aadhaar front</div>
                <div className="text-[8px] text-zinc-500">JPG/PNG, max 5MB</div>
              </motion.div>
              <div className="text-[9px] text-zinc-500">Tips: Good lighting, no shadows, all corners visible</div>
              <MockBtn label="Upload Photo" primary color="emerald" />
              <MockBtn label="Take Camera Photo" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Selfie Lo — Liveness Check",
        description: "Camera se live selfie lo. Face frame ke andar clearly dikhna chahiye. Spectacles utaar lo aur natural light mein photo lo.",
        screen: (
          <PhoneFrame bg="bg-black">
            <div className="h-full flex flex-col items-center justify-center px-3 space-y-3">
              <div className="relative">
                <div className="w-32 h-32 rounded-full border-4 border-emerald-400 overflow-hidden bg-zinc-800">
                  <motion.div
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-full h-full bg-gradient-to-b from-zinc-600 to-zinc-800 flex items-center justify-center"
                  >
                    <div className="w-12 h-12 rounded-full bg-zinc-500" />
                  </motion.div>
                </div>
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 rounded-full border-4 border-emerald-500/50"
                />
              </div>
              <div className="text-[10px] text-emerald-400 font-medium text-center">Position face in the circle</div>
              <div className="flex gap-1.5 justify-center">
                {["Good lighting", "Face visible", "No glasses"].map((t) => (
                  <div key={t} className="text-[8px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{t}</div>
                ))}
              </div>
              <motion.div
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-white" />
              </motion.div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Review aur Submit",
        description: "Sab documents upload hone ke baad 'Submit for review' par click karo. KYC L2 approval usually few minutes mein ho jaata hai.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Review & Submit" />
            <div className="px-3 py-3 space-y-2">
              {["Aadhaar Front", "Aadhaar Back", "Selfie"].map((d, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded border border-emerald-500/30 bg-emerald-500/5">
                  <Check className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="text-[10px] text-zinc-300">{d}</span>
                  <Badge className="ml-auto text-[8px] bg-emerald-500/20 text-emerald-400 border-0 px-1.5">✓ Uploaded</Badge>
                </div>
              ))}
              <div className="text-[9px] text-zinc-400 mt-2 px-1">Our team will review within a few minutes. You'll be notified when done.</div>
              <MockBtn label="Submit for Review" primary color="emerald" />
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "bank-add",
    title: "Bank Account Add Karna",
    category: "Getting Started",
    icon: Building,
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    durationMin: 3,
    steps: [
      {
        title: "INR Payments Page Kholao",
        description: "Sidebar mein 'INR Payments' ya 'Wallet → INR' par click karo, phir 'Bank Accounts' tab select karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="INR Payments" />
            <div className="px-3 py-2">
              <div className="flex gap-1 mb-3">
                {["Overview", "Bank Accounts", "UPI", "History"].map((t, i) => (
                  <div key={t} className={`flex-1 text-center text-[9px] py-1 rounded font-medium ${i === 1 ? "bg-sky-500 text-white" : "text-zinc-400"}`}>{t}</div>
                ))}
              </div>
              <div className="text-[10px] text-zinc-400 mb-2">Saved bank accounts</div>
              <div className="rounded-lg border border-dashed border-zinc-600 h-16 flex items-center justify-center">
                <div className="text-[9px] text-zinc-500">No bank accounts yet</div>
              </div>
              <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="mt-3">
                <MockBtn label="+ Add Bank Account" primary color="sky" />
              </motion.div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Bank Details Bharo",
        description: "Account holder name (exactly as in bank), account number, IFSC code, aur bank name fill karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Add Bank Account" />
            <div className="px-3 py-3 space-y-1.5">
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="Account holder name" value="RAJESH KUMAR" focus />
              </motion.div>
              <MockField label="Account number" value="123456789012" />
              <MockField label="Re-enter account number" />
              <MockField label="IFSC code" value="HDFC0001234" />
              <MockField label="Bank name" value="HDFC Bank" />
              <MockField label="Account type" value="Savings" />
              <MockBtn label="Add Account" primary color="sky" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Penny Drop Verification",
        description: "System automatically aapke account mein ₹1 bhejta hai to verify that the account is yours. Ye instant hota hai.",
        screen: (
          <PhoneFrame>
            <div className="h-full flex flex-col items-center justify-center px-3 space-y-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                className="w-12 h-12 rounded-full border-4 border-sky-500 border-t-transparent"
              />
              <div className="text-[11px] font-semibold text-zinc-200 text-center">Verifying Account…</div>
              <div className="text-[9px] text-zinc-400 text-center">We're sending ₹1 to verify your account. This takes a few seconds.</div>
              <div className="text-[9px] text-sky-400 text-center font-mono">HDFC ·····9012</div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Bank Account Added!",
        description: "Account verified ho gaya. Ab aap INR withdrawals directly is bank account mein kar sakte hain.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Bank Accounts" />
            <div className="px-3 py-3">
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-sky-400" />
                    <span className="text-[10px] font-semibold text-zinc-200">HDFC Bank</span>
                  </div>
                  <Badge className="text-[8px] bg-emerald-500/20 text-emerald-400 border-0">Primary</Badge>
                </div>
                <div className="text-[9px] text-zinc-400">RAJESH KUMAR</div>
                <div className="text-[9px] font-mono text-zinc-300">•••• •••• 9012</div>
                <div className="text-[9px] text-zinc-500">IFSC: HDFC0001234</div>
                <div className="flex items-center gap-1 text-[9px] text-emerald-400"><Check className="h-3 w-3" /> Verified</div>
              </div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "deposit-inr",
    title: "INR Deposit (UPI / IMPS / NEFT)",
    category: "Deposits & Withdrawals",
    icon: ArrowDownToLine,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    durationMin: 3,
    steps: [
      {
        title: "Wallet → INR Deposit Karo",
        description: "Wallet ya INR Payments page mein jao. 'Deposit' button par click karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Wallet" />
            <div className="px-3 py-3 space-y-2">
              <div className="rounded-xl border border-border bg-zinc-800/60 p-3 text-center">
                <div className="text-[9px] text-zinc-400">Total Portfolio Value</div>
                <div className="text-lg font-bold text-zinc-100">₹0.00</div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {["Deposit", "Withdraw", "Transfer"].map((a, i) => (
                  <motion.div
                    key={a}
                    animate={i === 0 ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className={`rounded-lg p-2 text-center ${i === 0 ? "bg-amber-500 text-black font-bold" : "bg-zinc-800 border border-zinc-700 text-zinc-400"} text-[9px]`}
                  >
                    {a}
                  </motion.div>
                ))}
              </div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Payment Method Choose Karo",
        description: "UPI (fastest — instant), IMPS (quick — 2-30 mins), ya NEFT (standard — up to 4 hrs) mein se koi bhi choose karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Deposit INR" />
            <div className="px-3 py-3 space-y-2">
              <div className="text-[10px] text-zinc-400 font-medium">Select method</div>
              {[
                { name: "UPI", desc: "Instant · No fees", icon: Smartphone, recommended: true },
                { name: "IMPS", desc: "2–30 mins · ₹10", icon: Building, recommended: false },
                { name: "NEFT", desc: "Up to 4 hrs · Free", icon: Building, recommended: false },
              ].map((m) => (
                <motion.div
                  key={m.name}
                  animate={m.recommended ? { borderColor: ["#f59e0b", "#d97706", "#f59e0b"] } : {}}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className={`flex items-center gap-2 p-2 rounded-lg border ${m.recommended ? "border-amber-500 bg-amber-500/5" : "border-zinc-700"}`}
                >
                  <m.icon className="h-4 w-4 text-amber-400" />
                  <div className="flex-1">
                    <div className="text-[10px] font-semibold text-zinc-200">{m.name}</div>
                    <div className="text-[9px] text-zinc-500">{m.desc}</div>
                  </div>
                  {m.recommended && <Badge className="text-[8px] bg-amber-500/20 text-amber-400 border-0">Recommended</Badge>}
                </motion.div>
              ))}
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Amount Dalo aur Pay Karo",
        description: "Deposit karne ki amount enter karo (minimum ₹100). UPI aapke bank app mein open hoga — wahan payment complete karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="UPI Deposit" />
            <div className="px-3 py-3 space-y-2">
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="Amount (₹)" value="5,000" focus />
              </motion.div>
              <div className="text-[9px] text-zinc-500 text-right">Min ₹100 · Max ₹1,00,000/day</div>
              <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-center">
                <div className="text-[9px] text-zinc-400 mb-1">Pay to UPI ID:</div>
                <div className="text-[11px] font-mono font-bold text-amber-400">zebvix@hdfcbank</div>
                <div className="text-[9px] text-zinc-500 mt-1">Use GPay, PhonePe, Paytm, or any bank UPI</div>
              </div>
              <MockBtn label="Open UPI App" primary />
              <MockBtn label="Manual Bank Transfer" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Deposit Credited!",
        description: "Payment complete hone ke baad aapka INR balance automatically update ho jaata hai. Usually 30–60 seconds lagta hai.",
        screen: (
          <PhoneFrame>
            <div className="h-full flex flex-col items-center justify-center px-3 space-y-3">
              <motion.div
                animate={{ scale: [0.8, 1.1, 1] }}
                transition={{ duration: 0.6 }}
                className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center"
              >
                <IndianRupee className="h-7 w-7 text-emerald-400" />
              </motion.div>
              <div className="text-center space-y-1">
                <div className="text-[11px] text-zinc-400">Deposited</div>
                <div className="text-xl font-bold text-emerald-400">₹5,000</div>
                <div className="text-[9px] text-zinc-500">INR wallet balance updated</div>
              </div>
              <div className="w-full p-2 rounded border border-zinc-700 bg-zinc-800/40 space-y-1">
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Method</span><span className="text-zinc-300">UPI</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">UTR</span><span className="font-mono text-zinc-300">407654321098</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Time</span><span className="text-zinc-300">Just now</span></div>
              </div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "withdraw-inr",
    title: "INR Withdraw Karna",
    category: "Deposits & Withdrawals",
    icon: ArrowUpFromLine,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    durationMin: 3,
    steps: [
      {
        title: "Wallet → Withdraw",
        description: "Wallet page mein 'Withdraw' button par click karo, phir 'INR' select karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Withdraw" />
            <div className="px-3 py-3 space-y-2">
              <div className="text-[10px] text-zinc-400">Select currency to withdraw</div>
              <div className="flex gap-1">
                {["INR", "USDT", "BTC", "ETH"].map((c, i) => (
                  <motion.div
                    key={c}
                    animate={i === 0 ? { scale: [1, 1.05, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className={`flex-1 text-center py-1.5 rounded text-[10px] font-medium ${i === 0 ? "bg-amber-500 text-black" : "bg-zinc-800 border border-zinc-700 text-zinc-400"}`}
                  >
                    {c}
                  </motion.div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-zinc-400">Available INR balance</div>
              <div className="text-lg font-bold text-zinc-100">₹5,000.00</div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Bank Account Select Karo",
        description: "Apna saved bank account select karo. Pehle se verified account hi use kar sakte hain. Naya account add karna ho to INR Payments mein jao.",
        screen: (
          <PhoneFrame>
            <MockHeader title="INR Withdraw" />
            <div className="px-3 py-3 space-y-2">
              <div className="text-[10px] text-zinc-400">Withdraw to</div>
              <motion.div
                animate={{ borderColor: ["#f59e0b", "#d97706", "#f59e0b"] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="flex items-center gap-2 p-2.5 rounded-xl border border-amber-500 bg-amber-500/5"
              >
                <div className="w-8 h-8 rounded-full bg-sky-500/15 flex items-center justify-center"><Building className="h-4 w-4 text-sky-400" /></div>
                <div>
                  <div className="text-[10px] font-semibold text-zinc-200">HDFC Bank — ····9012</div>
                  <div className="text-[9px] text-zinc-400">RAJESH KUMAR · HDFC0001234</div>
                  <div className="text-[8px] text-emerald-400 flex items-center gap-1"><Check className="h-2.5 w-2.5" /> Verified</div>
                </div>
              </motion.div>
              <div className="text-[10px] text-zinc-500 text-center">Tap to change bank account</div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Amount aur Method Chuno",
        description: "Withdrawal amount enter karo. NEFT free hai, IMPS ₹10 charge lagta hai. OTP aapke registered mobile par aayega.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Withdraw Amount" />
            <div className="px-3 py-3 space-y-2">
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="Amount (₹)" value="2,000" focus />
              </motion.div>
              <div className="text-[9px] text-zinc-500 text-right">Available: ₹5,000</div>
              <div className="flex gap-1 mt-1">
                {["NEFT (Free)", "IMPS (₹10)"].map((m, i) => (
                  <div key={m} className={`flex-1 py-1.5 text-center text-[9px] rounded border font-medium ${i === 0 ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-zinc-700 text-zinc-400"}`}>{m}</div>
                ))}
              </div>
              <div className="p-2 rounded border border-zinc-700 bg-zinc-800/40 space-y-1">
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Amount</span><span className="text-zinc-300">₹2,000</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Fee</span><span className="text-emerald-400">Free</span></div>
                <div className="flex justify-between text-[9px] font-semibold"><span className="text-zinc-300">You receive</span><span className="text-zinc-100">₹2,000</span></div>
              </div>
              <MockBtn label="Request Withdrawal" primary />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "OTP Confirm Karo — Done!",
        description: "Ek 6-digit OTP aapke phone par aayega. Enter karo — withdrawal process ho jaata hai. Usually 30 minutes mein credited.",
        screen: (
          <PhoneFrame>
            <div className="h-full flex flex-col items-center justify-center px-3 space-y-3">
              <motion.div
                animate={{ scale: [0.9, 1.05, 1] }}
                transition={{ duration: 0.5 }}
                className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center"
              >
                <ArrowUpFromLine className="h-7 w-7 text-emerald-400" />
              </motion.div>
              <div className="text-center space-y-1">
                <div className="text-[11px] text-zinc-400">Withdrawal Initiated</div>
                <div className="text-xl font-bold text-amber-400">₹2,000</div>
                <div className="text-[9px] text-zinc-500">Processing via NEFT</div>
              </div>
              <div className="w-full p-2 rounded border border-zinc-700 space-y-1">
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">To</span><span className="text-zinc-300">HDFC ····9012</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">ETA</span><span className="text-zinc-300">~30 minutes</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Status</span><span className="text-amber-400">Processing</span></div>
              </div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "deposit-crypto",
    title: "Crypto Deposit Karna",
    category: "Deposits & Withdrawals",
    icon: Bitcoin,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    durationMin: 4,
    steps: [
      {
        title: "Wallet → Crypto Deposit",
        description: "Wallet page mein us coin par click karo jise deposit karna hai (jaise BTC, USDT, ETH).",
        screen: (
          <PhoneFrame>
            <MockHeader title="Wallet" />
            <div className="px-3 py-2 space-y-1.5">
              {["BTC", "ETH", "USDT", "ZBX"].map((coin, i) => (
                <motion.div
                  key={coin}
                  animate={i === 2 ? { x: [0, 4, 0] } : {}}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className={`flex items-center gap-2 p-2 rounded-lg border ${i === 2 ? "border-orange-500/40 bg-orange-500/5" : "border-zinc-700 bg-zinc-800/40"}`}
                >
                  <div className="w-6 h-6 rounded-full bg-orange-500/15 flex items-center justify-center text-[9px] font-bold text-orange-400">{coin[0]}</div>
                  <span className="text-[10px] font-medium text-zinc-200 flex-1">{coin}</span>
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-200">0.0000</div>
                    <div className="text-[9px] text-zinc-500">₹0.00</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Network Select Karo (Important!)",
        description: "⚠️ Sahi network select karna bahut zaroori hai! Galat network par send kiya toh funds lost ho sakte hain. USDT ke liye usually TRC20 ya ERC20 use karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Deposit USDT" />
            <div className="px-3 py-3 space-y-2">
              <div className="p-2 rounded border border-amber-500/30 bg-amber-500/5 text-[9px] text-amber-400">
                ⚠️ Select the SAME network you're sending from
              </div>
              {[
                { name: "TRC20 (Tron)", fee: "Near zero fees", recommended: true },
                { name: "ERC20 (Ethereum)", fee: "High gas fees", recommended: false },
                { name: "BEP20 (BSC)", fee: "Very low fees", recommended: false },
              ].map((n) => (
                <div key={n.name} className={`flex items-center gap-2 p-2 rounded-lg border ${n.recommended ? "border-orange-500 bg-orange-500/5" : "border-zinc-700"}`}>
                  <div className="flex-1">
                    <div className="text-[10px] font-semibold text-zinc-200">{n.name}</div>
                    <div className="text-[9px] text-zinc-500">{n.fee}</div>
                  </div>
                  {n.recommended && <Badge className="text-[8px] bg-orange-500/20 text-orange-400 border-0">Popular</Badge>}
                </div>
              ))}
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Address Copy Karo",
        description: "Deposit address copy karo ya QR code scan karo. Apne exchange/wallet se EXACTLY this address par transfer karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="USDT Deposit (TRC20)" />
            <div className="px-3 py-3 space-y-2">
              <div className="flex justify-center">
                <div className="w-24 h-24 bg-white rounded-lg p-1">
                  <div className="w-full h-full bg-zinc-900 rounded flex items-center justify-center">
                    <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }}>
                      <div className="grid grid-cols-5 gap-0.5">
                        {Array.from({ length: 25 }).map((_, i) => (
                          <div key={i} className={`w-3 h-3 ${Math.random() > 0.5 ? "bg-white" : "bg-zinc-900"}`} />
                        ))}
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
              <div className="p-2 rounded bg-zinc-800 border border-zinc-700">
                <div className="text-[9px] text-zinc-500 mb-1">USDT (TRC20) Address</div>
                <div className="font-mono text-[8px] text-zinc-300 break-all">TRX4k8m2...P9Qn</div>
              </div>
              <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockBtn label="Copy Address" primary color="orange" />
              </motion.div>
              <div className="text-[8px] text-zinc-500 text-center">Min deposit: 1 USDT · Confirmations: 20</div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "spot-trade",
    title: "Spot Trading — Buy/Sell",
    category: "Trading",
    icon: TrendingUp,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    durationMin: 5,
    steps: [
      {
        title: "Trade Page Kholao",
        description: "Navbar mein 'Trade' par click karo. Wahan trading pair select karo, jaise BTC/USDT ya ETH/INR.",
        screen: (
          <PhoneFrame>
            <div className="px-1 pt-1">
              <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800">
                <div className="text-[11px] font-bold text-zinc-200">BTC/USDT</div>
                <div className="text-[10px] text-emerald-400 font-mono">$65,420</div>
              </div>
              <div className="grid grid-cols-2 gap-0.5 px-1 mt-1">
                <div className="space-y-0.5">
                  {[65400, 65380, 65360, 65340].map((p) => (
                    <div key={p} className="flex justify-between text-[8px]"><span className="text-rose-400 font-mono">{p}</span><span className="text-zinc-500">0.12</span></div>
                  ))}
                  <div className="py-0.5 text-center text-[9px] font-bold text-emerald-400 border-y border-zinc-800">65,420</div>
                  {[65440, 65460, 65480, 65500].map((p) => (
                    <div key={p} className="flex justify-between text-[8px]"><span className="text-emerald-400 font-mono">{p}</span><span className="text-zinc-500">0.08</span></div>
                  ))}
                </div>
                <div className="bg-zinc-800/40 rounded p-1.5 space-y-1.5">
                  <div className="flex gap-1">
                    <motion.div animate={{ opacity: [1, 0.7, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="flex-1 py-1 text-center text-[9px] font-bold rounded bg-emerald-500 text-white">Buy</motion.div>
                    <div className="flex-1 py-1 text-center text-[9px] font-bold rounded bg-zinc-700 text-zinc-400">Sell</div>
                  </div>
                  <MockField label="Price" value="65,420" />
                  <MockField label="Amount (BTC)" />
                  <MockBtn label="Buy BTC" primary color="emerald" />
                </div>
              </div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Order Type Samjho",
        description: "Limit order = aap price set karte ho (maker — lower fee). Market order = turant best price par execute hota hai (taker). Stop-limit = automatic trigger.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Order Type" />
            <div className="px-3 py-3 space-y-2">
              {[
                { type: "Limit", desc: "Set your own price. Fills when market reaches it.", fee: "Maker: 0.10%", recommended: true },
                { type: "Market", desc: "Execute immediately at best available price.", fee: "Taker: 0.15%", recommended: false },
                { type: "Stop-Limit", desc: "Trigger price → then place limit order.", fee: "Maker: 0.10%", recommended: false },
              ].map((o) => (
                <div key={o.type} className={`p-2 rounded-lg border ${o.recommended ? "border-purple-500/40 bg-purple-500/5" : "border-zinc-700"}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-semibold text-zinc-200">{o.type}</span>
                    <span className="text-[9px] text-zinc-500">{o.fee}</span>
                  </div>
                  <div className="text-[9px] text-zinc-400">{o.desc}</div>
                </div>
              ))}
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Buy Order Place Karo",
        description: "Price aur amount fill karo. 'Buy BTC' button dabao. Order place hoga aur orderbook mein show hoga.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Buy BTC/USDT" />
            <div className="px-3 py-2 space-y-1.5">
              <div className="flex gap-1">
                <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="flex-1 py-1.5 text-center text-[9px] font-bold rounded bg-emerald-500 text-white">BUY</motion.div>
                <div className="flex-1 py-1.5 text-center text-[9px] font-bold rounded bg-zinc-700 text-zinc-400">SELL</div>
              </div>
              <MockField label="Order type" value="Limit" />
              <MockField label="Price (USDT)" value="65,000" focus />
              <MockField label="Amount (BTC)" value="0.001" />
              <div className="flex justify-between text-[9px]">
                <span className="text-zinc-500">Total</span>
                <span className="text-zinc-300">65 USDT</span>
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="text-zinc-500">Fee (0.10%)</span>
                <span className="text-zinc-300">0.065 USDT</span>
              </div>
              <MockBtn label="Buy BTC" primary color="emerald" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Order Placed — Track Karo",
        description: "Order 'Open Orders' mein show hoga. Jab price reach hogi tab automatically fill ho jaayega. Kabhi bhi cancel kar sakte hain.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Open Orders" />
            <div className="px-3 py-3 space-y-2">
              <motion.div
                animate={{ borderColor: ["#a855f7", "#9333ea", "#a855f7"] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="p-2.5 rounded-xl border border-purple-500/40 bg-purple-500/5"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Badge className="text-[8px] bg-emerald-500/20 text-emerald-400 border-0">Buy</Badge>
                    <span className="text-[10px] font-bold text-zinc-200">BTC/USDT</span>
                  </div>
                  <span className="text-[9px] text-zinc-500">Limit</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[9px]">
                  <div><div className="text-zinc-500">Price</div><div className="text-zinc-200 font-mono">65,000</div></div>
                  <div><div className="text-zinc-500">Amount</div><div className="text-zinc-200">0.001 BTC</div></div>
                  <div><div className="text-zinc-500">Status</div><div className="text-amber-400">Open</div></div>
                </div>
              </motion.div>
              <div className="text-[9px] text-zinc-500 text-center">Order will fill when BTC reaches ₹65,000</div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "p2p-trade",
    title: "P2P Trading — INR se Crypto Kharido",
    category: "Trading",
    icon: Users,
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
    durationMin: 5,
    steps: [
      {
        title: "P2P Marketplace Kholao",
        description: "Sidebar mein 'P2P' par click karo. Yahan doosre users directly INR se crypto buy/sell karte hain — koi platform fee nahi.",
        screen: (
          <PhoneFrame>
            <MockHeader title="P2P Marketplace" />
            <div className="px-3 py-2 space-y-2">
              <div className="flex gap-1">
                <div className="flex-1 py-1.5 text-center text-[9px] font-bold rounded bg-emerald-500 text-white">Buy Crypto</div>
                <div className="flex-1 py-1.5 text-center text-[9px] rounded bg-zinc-700 text-zinc-400">Sell Crypto</div>
              </div>
              <div className="flex gap-1">
                <div className="flex-1 rounded border border-zinc-700 text-[8px] text-zinc-400 px-2 py-1">USDT ▾</div>
                <div className="flex-1 rounded border border-zinc-700 text-[8px] text-zinc-400 px-2 py-1">Any method ▾</div>
              </div>
              {[
                { name: "CryptoKing", price: "87.50", method: "UPI", avail: "500 USDT" },
                { name: "TradePro99", price: "87.45", method: "IMPS", avail: "1200 USDT" },
              ].map((o) => (
                <motion.div key={o.name} animate={{ x: [0, 2, 0] }} transition={{ repeat: Infinity, duration: 3 }} className="p-2 rounded border border-zinc-700 flex items-center gap-2">
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-200">{o.name}</div>
                    <div className="text-[9px] text-zinc-500">{o.method} · {o.avail}</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-[10px] font-bold text-teal-400">₹{o.price}</div>
                    <div className="text-[8px] bg-emerald-500 text-white rounded px-1.5 py-0.5 mt-0.5">Buy</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Offer Select aur Amount Dalo",
        description: "Merchant ka offer select karo. Kitna INR dena hai wo enter karo — crypto amount automatic calculate hoga.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Buy USDT" />
            <div className="px-3 py-3 space-y-2">
              <div className="p-2 rounded-lg bg-teal-500/5 border border-teal-500/20">
                <div className="text-[10px] font-semibold text-zinc-200">CryptoKing</div>
                <div className="text-[9px] text-zinc-400">Price: ₹87.50/USDT · UPI</div>
              </div>
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="INR amount to pay" value="₹5,000" focus />
              </motion.div>
              <div className="text-[9px] text-zinc-400 text-right">You receive: ≈ 57.14 USDT</div>
              <div className="text-[9px] text-zinc-500">Limits: ₹500 – ₹50,000</div>
              <div className="text-[9px] text-zinc-400 mt-1 mb-1">Payment method (select yours)</div>
              <div className="p-2 rounded border border-teal-500/30 bg-teal-500/5">
                <div className="text-[10px] text-zinc-200">UPI — Personal · yourname@okhdfcbank</div>
              </div>
              <MockBtn label="Open Order" primary color="teal" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Merchant ko Payment Karo",
        description: "Order open hone ke baad 15 minutes ka pay window milta hai. Merchant ke UPI/bank account par EXACT amount bhejo aur 'I have paid' press karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Order #P2P-4821" />
            <div className="px-3 py-2 space-y-2">
              <div className="flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/30">
                <div className="text-[10px] text-amber-400 font-semibold">⏱ Pay within</div>
                <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="text-[12px] font-mono font-bold text-amber-400">14:32</motion.div>
              </div>
              <div className="p-2 rounded border border-zinc-700 space-y-1">
                <div className="text-[9px] text-zinc-400 font-semibold">Pay to merchant:</div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">UPI ID</span><span className="font-mono text-zinc-200">cryptoking@upi</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Amount</span><span className="font-bold text-zinc-100">₹5,000</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Reference</span><span className="text-zinc-300">P2P-4821</span></div>
              </div>
              <MockBtn label="Copy UPI ID" />
              <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockBtn label="I Have Paid ✓" primary color="emerald" />
              </motion.div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Crypto Release — Done!",
        description: "Merchant payment confirm karega aur crypto aapke wallet mein automatically release ho jaata hai. Kisi problem par 'Dispute' raise karo.",
        screen: (
          <PhoneFrame>
            <div className="h-full flex flex-col items-center justify-center px-3 space-y-3">
              <motion.div animate={{ scale: [0.8, 1.1, 1] }} transition={{ duration: 0.5 }} className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                <Check className="h-7 w-7 text-emerald-400" />
              </motion.div>
              <div className="text-center space-y-1">
                <div className="text-[11px] text-zinc-400">Trade Complete!</div>
                <div className="text-xl font-bold text-teal-400">57.14 USDT</div>
                <div className="text-[9px] text-zinc-400">Credited to your wallet</div>
              </div>
              <div className="w-full p-2 rounded border border-zinc-700 space-y-1">
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Paid</span><span className="text-zinc-300">₹5,000</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Received</span><span className="text-teal-400">57.14 USDT</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-zinc-500">Rate</span><span className="text-zinc-300">₹87.50/USDT</span></div>
              </div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "copy-trading",
    title: "Copy Trading — Trader Follow Karo",
    category: "Trading",
    icon: Trophy,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    durationMin: 4,
    steps: [
      {
        title: "Copy Trading Leaderboard",
        description: "Sidebar mein 'Copy Trading' select karo. Yahan top traders ki list dikhti hai — 30d PnL, win rate, followers, AUM sab dikhta hai.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Copy Trading" />
            <div className="px-3 py-2 space-y-1.5">
              {[
                { name: "AlphaTrader", pnl: "+38.2%", followers: 1240, win: "72%" },
                { name: "CryptoGuru", pnl: "+24.5%", followers: 890, win: "68%" },
                { name: "MoonRider", pnl: "+19.1%", followers: 540, win: "61%" },
              ].map((t, i) => (
                <motion.div key={t.name} animate={i === 0 ? { borderColor: ["#f59e0b", "#d97706", "#f59e0b"] } : {}} transition={{ repeat: Infinity, duration: 2 }} className={`p-2 rounded-lg border ${i === 0 ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-700"} flex items-center gap-2`}>
                  <div className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center font-bold text-[9px] text-amber-400">#{i + 1}</div>
                  <div className="flex-1">
                    <div className="text-[10px] font-semibold text-zinc-200">{t.name}</div>
                    <div className="text-[9px] text-zinc-500">Win: {t.win} · {t.followers} followers</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold text-emerald-400">{t.pnl}</div>
                    <div className="text-[8px] bg-amber-500/20 text-amber-400 rounded px-1 mt-0.5">Copy</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Trader Select aur 'Copy' Dabao",
        description: "Kisi bhi trader ka card dekho — unki performance history, strategy, tags, aur performance fee check karo. Phir 'Copy' button par click karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="AlphaTrader" />
            <div className="px-3 py-2 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {[["30d PnL", "+38.2%", "emerald"], ["Win Rate", "72%", "zinc"], ["AUM", "125k USDT", "zinc"], ["Followers", "1,240", "zinc"]].map(([l, v, c]) => (
                  <div key={l} className="rounded border border-zinc-700 p-1.5 text-center">
                    <div className="text-[9px] text-zinc-500">{l}</div>
                    <div className={`text-[10px] font-bold text-${c}-400`}>{v}</div>
                  </div>
                ))}
              </div>
              <div className="text-[9px] text-zinc-400">Strategy: BTC/ETH swing trading, technical analysis based</div>
              <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400">Fee: 10% of profits</div>
              <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockBtn label="Copy This Trader" primary />
              </motion.div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Allocation Set Karo",
        description: "Kitna USDT is trader ke liye allocate karna hai set karo. Copy ratio (1× = exactly match) aur max risk per trade bhi set karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Copy AlphaTrader" />
            <div className="px-3 py-3 space-y-2">
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="Allocation (USDT)" value="500" focus />
              </motion.div>
              <MockField label="Copy ratio" value="1.0× (match exactly)" />
              <MockField label="Max risk per trade (%)" value="5%" />
              <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20 text-[9px] text-amber-300">
                ✨ Performance fee: 10% of your profits go to AlphaTrader
              </div>
              <MockBtn label="Start Copying" primary />
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "earn-staking",
    title: "Earn / Staking — APY Kamao",
    category: "Earn",
    icon: PiggyBank,
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    durationMin: 3,
    steps: [
      {
        title: "Earn Page Kholao",
        description: "Sidebar mein 'Earn' par click karo. Yahan flexible aur locked staking products dikhte hain — alag alag APY rates ke saath.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Earn & Staking" />
            <div className="px-3 py-2 space-y-1.5">
              <div className="flex gap-1 mb-2">
                {["All", "Flexible", "Locked"].map((t, i) => (
                  <div key={t} className={`flex-1 py-1 text-center text-[9px] rounded font-medium ${i === 0 ? "bg-green-500 text-white" : "bg-zinc-800 text-zinc-400"}`}>{t}</div>
                ))}
              </div>
              {[
                { coin: "USDT", apy: "8.5%", type: "Flexible", min: "10" },
                { coin: "BTC", apy: "4.2%", type: "Locked 30d", min: "0.001" },
                { coin: "ETH", apy: "6.8%", type: "Locked 14d", min: "0.01" },
              ].map((p) => (
                <motion.div key={p.coin} animate={{ x: [0, 2, 0] }} transition={{ repeat: Infinity, duration: 3 }} className="flex items-center gap-2 p-2 rounded-lg border border-zinc-700 hover:border-green-500/30">
                  <div className="w-6 h-6 rounded-full bg-green-500/15 flex items-center justify-center font-bold text-[9px] text-green-400">{p.coin[0]}</div>
                  <div className="flex-1">
                    <div className="text-[10px] font-semibold text-zinc-200">{p.coin}</div>
                    <div className="text-[9px] text-zinc-500">{p.type} · Min {p.min}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-bold text-green-400">{p.apy}</div>
                    <div className="text-[8px] text-zinc-500">APY</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Product Select aur Subscribe Karo",
        description: "Coin aur plan select karo. Flexible mein kabhi bhi withdraw kar sakte hain. Locked mein higher APY milta hai lekin funds lock ho jaate hain.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Subscribe — USDT" />
            <div className="px-3 py-3 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {[["APY", "8.5%", "green"], ["Duration", "Flexible", "zinc"], ["Min", "10 USDT", "zinc"], ["Compounding", "Daily", "zinc"]].map(([l, v, c]) => (
                  <div key={l} className="rounded border border-zinc-700 p-1.5">
                    <div className="text-[9px] text-zinc-500">{l}</div>
                    <div className={`text-[10px] font-bold text-${c}-400`}>{v}</div>
                  </div>
                ))}
              </div>
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="Amount (USDT)" value="1,000" focus />
              </motion.div>
              <div className="text-[9px] text-zinc-400">Est. monthly earnings: <span className="text-green-400 font-semibold">~7.08 USDT</span></div>
              <MockBtn label="Start Earning" primary color="green" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Earnings Track Karo",
        description: "'My Positions' tab mein apni active staking positions dekh sakte hain. Daily rewards automatically add hote rehte hain.",
        screen: (
          <PhoneFrame>
            <MockHeader title="My Earn Positions" />
            <div className="px-3 py-3 space-y-2">
              <motion.div animate={{ borderColor: ["#22c55e", "#16a34a", "#22c55e"] }} transition={{ repeat: Infinity, duration: 2 }} className="p-2.5 rounded-xl border border-green-500/40 bg-green-500/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold text-zinc-200">USDT Flexible</div>
                  <Badge className="text-[8px] bg-green-500/20 text-green-400 border-0">Active</Badge>
                </div>
                <div className="grid grid-cols-3 text-[9px] gap-1">
                  <div><div className="text-zinc-500">Staked</div><div className="text-zinc-200">1,000 USDT</div></div>
                  <div><div className="text-zinc-500">Earned</div><div className="text-green-400 font-bold">+2.33 USDT</div></div>
                  <div><div className="text-zinc-500">APY</div><div className="text-green-400">8.5%</div></div>
                </div>
              </motion.div>
              <div className="text-[9px] text-zinc-500 text-center">Rewards credited daily at 00:00 UTC</div>
              <MockBtn label="Withdraw Anytime" />
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "2fa-security",
    title: "2FA Security Enable Karo",
    category: "Security",
    icon: KeyRound,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    durationMin: 4,
    steps: [
      {
        title: "Settings → Security",
        description: "Top-right avatar → Settings par click karo → 'Security' tab select karo. Yahan sab security options milenge.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Security Settings" />
            <div className="px-3 py-3 space-y-2">
              {[
                { label: "Two-Factor Auth (2FA)", status: "Disabled", action: "Enable", highlight: true },
                { label: "Anti-phishing code", status: "Not set", action: "Setup", highlight: false },
                { label: "Active sessions", status: "1 session", action: "View", highlight: false },
                { label: "API keys", status: "0 keys", action: "Manage", highlight: false },
              ].map((item) => (
                <motion.div key={item.label} animate={item.highlight ? { borderColor: ["#ef4444", "#dc2626", "#ef4444"] } : {}} transition={{ repeat: Infinity, duration: 2 }} className={`flex items-center justify-between p-2 rounded-lg border ${item.highlight ? "border-red-500/40 bg-red-500/5" : "border-zinc-700"}`}>
                  <div>
                    <div className="text-[10px] font-medium text-zinc-200">{item.label}</div>
                    <div className="text-[9px] text-zinc-500">{item.status}</div>
                  </div>
                  <div className={`text-[9px] px-2 py-1 rounded ${item.highlight ? "bg-red-500 text-white" : "border border-zinc-600 text-zinc-400"}`}>{item.action}</div>
                </motion.div>
              ))}
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Authenticator App Download Karo",
        description: "Google Authenticator, Authy, ya 1Password app install karo. Phir Zebvix par 'Enable 2FA' click karo aur QR code scan karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Enable 2FA" />
            <div className="px-3 py-3 space-y-2">
              <div className="text-[10px] text-zinc-400 text-center mb-2">Scan QR with your authenticator app</div>
              <div className="flex justify-center">
                <div className="w-24 h-24 bg-white rounded-lg p-1.5 flex items-center justify-center">
                  <div className="grid grid-cols-5 gap-0.5">
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div key={i} className={`w-3.5 h-3.5 ${[0,1,2,5,7,12,17,20,22,24].includes(i) ? "bg-zinc-900" : "bg-white"}`} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="text-[9px] text-zinc-500 text-center">Or enter manually:</div>
              <div className="p-1.5 rounded bg-zinc-800 border border-zinc-700 font-mono text-[10px] text-center text-zinc-300 tracking-widest">ZBVX K4M2 N8P1 Q6R3</div>
              <MockBtn label="I've added the code ✓" primary color="red" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Code Verify Karo",
        description: "Authenticator app mein dikhe 6-digit code enter karo. Yeh har 30 seconds mein change hota hai. Done — 2FA active!",
        screen: (
          <PhoneFrame>
            <MockHeader title="Verify 2FA Code" />
            <div className="px-3 py-4 space-y-3">
              <div className="text-[10px] text-zinc-400 text-center">Enter code from your authenticator app</div>
              <div className="flex gap-1.5 justify-center">
                {[5, 3, 7, 1, 9, 2].map((d, i) => (
                  <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.08 }} className="w-7 h-9 rounded border border-red-500/60 bg-red-500/10 text-xs font-bold text-red-400 flex items-center justify-center">
                    {d}
                  </motion.div>
                ))}
              </div>
              <MockBtn label="Confirm & Enable 2FA" primary color="red" />
              <div className="p-2 rounded border border-amber-500/20 bg-amber-500/5 text-[9px] text-amber-400">
                ⚠️ Save your backup codes now — you'll need them if you lose your phone
              </div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "price-alerts",
    title: "Price Alerts Set Karo",
    category: "Tools",
    icon: Bell,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    durationMin: 2,
    steps: [
      {
        title: "Price Alerts Page",
        description: "Sidebar mein 'Price Alerts' par click karo. Yahan aap kisi bhi coin ke liye custom price alerts set kar sakte hain.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Price Alerts" />
            <div className="px-3 py-3 space-y-2">
              <div className="rounded-lg border border-dashed border-zinc-600 h-12 flex items-center justify-center">
                <div className="text-[9px] text-zinc-500">No alerts set yet</div>
              </div>
              <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockBtn label="+ New Alert" primary color="pink" />
              </motion.div>
              <div className="text-[9px] text-zinc-500 text-center">Get notified when crypto hits your target price</div>
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Alert Conditions Set Karo",
        description: "Coin select karo, condition choose karo (price above/below), aur target price enter karo. Notification app, email, ya SMS par aayega.",
        screen: (
          <PhoneFrame>
            <MockHeader title="New Price Alert" />
            <div className="px-3 py-3 space-y-2">
              <MockField label="Coin" value="BTC/USDT" />
              <div className="flex gap-1">
                {["Price above", "Price below"].map((c, i) => (
                  <motion.div key={c} animate={i === 0 ? { scale: [1, 1.03, 1] } : {}} transition={{ repeat: Infinity, duration: 2 }} className={`flex-1 py-1.5 text-center text-[9px] rounded border font-medium ${i === 0 ? "border-pink-500 bg-pink-500/10 text-pink-400" : "border-zinc-600 text-zinc-400"}`}>{c}</motion.div>
                ))}
              </div>
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="Target price (USDT)" value="70,000" focus />
              </motion.div>
              <div className="text-[9px] text-zinc-400">Current price: $65,420</div>
              <div className="flex gap-1">
                {["Push", "Email", "SMS"].map((n, i) => (
                  <div key={n} className={`flex-1 py-1 text-center text-[8px] rounded border ${i < 2 ? "border-pink-500/40 bg-pink-500/5 text-pink-400" : "border-zinc-700 text-zinc-500"}`}>{n}</div>
                ))}
              </div>
              <MockBtn label="Create Alert" primary color="pink" />
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "referrals",
    title: "Referral Program — Dosto ko Invite Karo",
    category: "Tools",
    icon: Gift,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    durationMin: 2,
    steps: [
      {
        title: "Referral Code Copy Karo",
        description: "Sidebar → 'Invite & Referrals' mein jao. Aapka unique referral code aur link milega — isse share karo.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Invite & Referrals" />
            <div className="px-3 py-3 space-y-2">
              <div className="text-center py-2">
                <div className="text-[9px] text-zinc-400 mb-1">Your referral code</div>
                <motion.div animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="text-2xl font-mono font-bold text-violet-400 tracking-widest">ZBX8K4M</motion.div>
              </div>
              <div className="p-2 rounded border border-violet-500/20 bg-violet-500/5 text-[9px] text-zinc-300 text-center">
                Invite karo — aapko <b className="text-violet-400">30%</b> of their trading fees milegi lifetime!
              </div>
              <MockBtn label="Share Referral Link" primary color="violet" />
              <MockBtn label="Copy Link" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Earnings Track Karo",
        description: "'Referrals' page mein apne referrals ki list aur har referral se kitni earning hui dekh sakte hain.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Referral Earnings" />
            <div className="px-3 py-3 space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                {[["Total Referred", "3 users"], ["Total Earned", "₹485"], ["This Month", "₹120"], ["Rate", "30%"]].map(([l, v]) => (
                  <div key={l} className="rounded border border-zinc-700 p-1.5 text-center">
                    <div className="text-[9px] text-zinc-500">{l}</div>
                    <div className="text-[10px] font-bold text-violet-400">{v}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {["Priya K. — ₹210 earned", "Rohit S. — ₹180 earned", "Aditya M. — ₹95 earned"].map((r) => (
                  <div key={r} className="text-[9px] text-zinc-400 flex items-center gap-1.5 py-0.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" /> {r}
                  </div>
                ))}
              </div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },

  {
    id: "ai-trading",
    title: "AI Trading Plans — Auto Invest",
    category: "Trading",
    icon: Bot,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    durationMin: 4,
    steps: [
      {
        title: "AI Trading Page Kholao",
        description: "Sidebar mein 'AI Trading' select karo. Yahan different risk profiles ke AI-managed investment plans milenge.",
        screen: (
          <PhoneFrame>
            <MockHeader title="AI Trading Plans" />
            <div className="px-3 py-2 space-y-1.5">
              {[
                { name: "Conservative", roi: "15–20%", risk: "Low", color: "emerald" },
                { name: "Balanced", roi: "25–35%", risk: "Medium", color: "amber" },
                { name: "Aggressive", roi: "45–60%", risk: "High", color: "red" },
              ].map((p, i) => (
                <motion.div key={p.name} animate={i === 1 ? { borderColor: ["#f59e0b", "#d97706", "#f59e0b"] } : {}} transition={{ repeat: Infinity, duration: 2 }} className={`p-2 rounded-xl border ${i === 1 ? "border-amber-500/50 bg-amber-500/5" : "border-zinc-700"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-zinc-200">{p.name}</div>
                      <div className="text-[9px] text-zinc-500">Expected ROI: {p.roi}/year</div>
                    </div>
                    <Badge className={`text-[8px] bg-${p.color}-500/20 text-${p.color}-400 border-0`}>{p.risk} risk</Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "Plan Subscribe Karo",
        description: "Plan select karo, investment amount enter karo (minimum varies per plan). AI bot automatically aapki taraf se trades execute karta hai.",
        screen: (
          <PhoneFrame>
            <MockHeader title="Subscribe — Balanced" />
            <div className="px-3 py-3 space-y-2">
              <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 grid grid-cols-2 gap-1 text-[9px]">
                <div><div className="text-zinc-500">Expected ROI</div><div className="text-amber-400 font-bold">25–35%/yr</div></div>
                <div><div className="text-zinc-500">Risk level</div><div className="text-amber-400">Medium</div></div>
                <div><div className="text-zinc-500">Min invest</div><div className="text-zinc-300">100 USDT</div></div>
                <div><div className="text-zinc-500">Lock period</div><div className="text-zinc-300">30 days</div></div>
              </div>
              <motion.div animate={{ scale: [1, 1.02, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MockField label="Investment amount (USDT)" value="1,000" focus />
              </motion.div>
              <div className="text-[9px] text-zinc-400">Est. monthly return: <span className="text-emerald-400 font-bold">~25–29 USDT</span></div>
              <MockBtn label="Subscribe to Plan" primary color="cyan" />
            </div>
          </PhoneFrame>
        ),
      },
      {
        title: "AI Bot Trading in Progress",
        description: "AI bot ab automatically crypto trades execute karta hai. Aap apni portfolio growth, trade history, aur current positions dekh sakte hain.",
        screen: (
          <PhoneFrame>
            <MockHeader title="My AI Plans" />
            <div className="px-3 py-3 space-y-2">
              <motion.div animate={{ borderColor: ["#06b6d4", "#0891b2", "#06b6d4"] }} transition={{ repeat: Infinity, duration: 2 }} className="p-2.5 rounded-xl border border-cyan-500/40 bg-cyan-500/5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5 text-cyan-400" />
                    <span className="text-[10px] font-bold text-zinc-200">Balanced Plan</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[9px] text-emerald-400">Trading</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 text-[9px]">
                  <div><div className="text-zinc-500">Invested</div><div className="text-zinc-200">1,000 USDT</div></div>
                  <div><div className="text-zinc-500">Profit</div><div className="text-emerald-400 font-bold">+18.4 USDT</div></div>
                  <div><div className="text-zinc-500">Trades</div><div className="text-zinc-200">47</div></div>
                </div>
              </motion.div>
            </div>
          </PhoneFrame>
        ),
      },
    ],
  },
];

const CATEGORIES = ["All", "Getting Started", "KYC", "Deposits & Withdrawals", "Trading", "Earn", "Security", "Tools"];

/* ─── Tutorial Player ────────────────────────────────────────────────────── */
function TutorialPlayer({ tutorial, onClose }: { tutorial: Tutorial; onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const totalSteps = tutorial.steps.length;
  const step = tutorial.steps[stepIndex];
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const nextStep = useCallback(() => {
    setStepIndex((i) => (i + 1 < totalSteps ? i + 1 : i));
  }, [totalSteps]);

  const prevStep = useCallback(() => {
    setStepIndex((i) => (i > 0 ? i - 1 : 0));
  }, []);

  const replay = useCallback(() => {
    setStepIndex(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setStepIndex((i) => {
        if (i + 1 < totalSteps) return i + 1;
        setPlaying(false);
        return i;
      });
    }, 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, totalSteps]);

  const progress = ((stepIndex + 1) / totalSteps) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-lg ${tutorial.bg} ${tutorial.border} border flex items-center justify-center`}>
              <tutorial.icon className={`h-4 w-4 ${tutorial.color}`} />
            </div>
            <div>
              <div className="font-semibold text-sm text-zinc-100">{tutorial.title}</div>
              <div className="text-xs text-zinc-500">Step {stepIndex + 1} of {totalSteps}</div>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-zinc-400" />
          </button>
        </div>

        {/* Progress */}
        <div className="h-1 bg-zinc-800">
          <motion.div
            className="h-full bg-amber-500"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col md:flex-row gap-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={stepIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-shrink-0 flex justify-center"
            >
              {step.screen}
            </motion.div>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={stepIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col justify-between flex-1"
            >
              <div>
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                  Step {stepIndex + 1} — {tutorial.category}
                </div>
                <h3 className="text-xl font-bold text-zinc-100 mb-3">{step.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{step.description}</p>
              </div>

              {/* Controls */}
              <div className="mt-6">
                <div className="flex items-center justify-center gap-2 mb-4">
                  {tutorial.steps.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setStepIndex(i); setPlaying(false); }}
                      className={`rounded-full transition-all ${i === stepIndex ? "w-6 h-2 bg-amber-500" : "w-2 h-2 bg-zinc-600 hover:bg-zinc-500"}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={prevStep} disabled={stepIndex === 0}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPlaying((p) => !p)} className="flex-1 max-w-[100px]">
                    {playing ? <><Pause className="h-3.5 w-3.5 mr-1.5" /> Pause</> : <><Play className="h-3.5 w-3.5 mr-1.5" /> Play</>}
                  </Button>
                  {stepIndex === totalSteps - 1 ? (
                    <Button size="sm" onClick={replay} className="bg-amber-500 hover:bg-amber-600 text-black">
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Replay
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => { nextStep(); setPlaying(false); }} className="bg-amber-500 hover:bg-amber-600 text-black">
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Tutorial Card ──────────────────────────────────────────────────────── */
function TutorialCard({ tutorial, onPlay }: { tutorial: Tutorial; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="text-left rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-amber-500/40 hover:bg-zinc-900/80 transition-all group overflow-hidden"
      data-testid={`tutorial-card-${tutorial.id}`}
    >
      <div className={`${tutorial.bg} ${tutorial.border} border-b p-5 flex items-center justify-between`}>
        <div className={`h-12 w-12 rounded-xl ${tutorial.bg} ${tutorial.border} border-2 flex items-center justify-center`}>
          <tutorial.icon className={`h-6 w-6 ${tutorial.color}`} />
        </div>
        <div className="h-10 w-10 rounded-full bg-black/20 border border-white/10 flex items-center justify-center group-hover:bg-amber-500 group-hover:border-amber-500 transition-colors">
          <CirclePlay className="h-5 w-5 text-white" />
        </div>
      </div>
      <div className="p-4">
        <Badge variant="outline" className="text-[10px] mb-2 text-zinc-400">{tutorial.category}</Badge>
        <h3 className="font-semibold text-sm text-zinc-100 mb-1 leading-snug">{tutorial.title}</h3>
        <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-2">
          <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> {tutorial.steps.length} steps</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> ~{tutorial.durationMin} min</span>
        </div>
      </div>
    </button>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function Tutorials() {
  const [activeCat, setActiveCat] = useState("All");
  const [activeTutorial, setActiveTutorial] = useState<Tutorial | null>(null);
  const [search, setSearch] = useState("");

  const filtered = TUTORIALS.filter((t) => {
    const catOk = activeCat === "All" || t.category === activeCat;
    const q = search.toLowerCase();
    const searchOk = !q || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    return catOk && searchOk;
  });

  const totalMinutes = TUTORIALS.reduce((s, t) => s + t.durationMin, 0);

  return (
    <div className="min-h-screen bg-background" data-testid="page-tutorials">
      {/* Hero */}
      <div className="relative bg-gradient-to-b from-amber-500/8 via-background to-background border-b border-border/50 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/8 rounded-full blur-3xl" />
          <div className="absolute top-0 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        </div>
        <div className="relative container mx-auto px-4 py-10 max-w-6xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-8 w-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <GraduationCap className="h-4 w-4 text-amber-400" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Zebvix Tutorials</span>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight mb-4">
            <span className="text-zinc-100">Sab kuch seekho —</span>{" "}
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">step by step</span>
          </h1>
          <p className="text-base md:text-lg text-zinc-400 max-w-2xl mb-6">
            Account banane se lekar advanced trading tak — har feature ka animated walkthrough dekhein aur sikh jaayein.
          </p>
          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <div className="flex items-center gap-1.5"><Play className="h-4 w-4 text-amber-400" /><span><b className="text-zinc-200">{TUTORIALS.length}</b> tutorials</span></div>
            <div className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-amber-400" /><span><b className="text-zinc-200">~{totalMinutes}</b> minutes total</span></div>
            <div className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-amber-400" /><span><b className="text-zinc-200">Hindi</b> + English</span></div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Star className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Tutorial search karo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/60"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCat(cat)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeCat === cat ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700"}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Koi tutorial nahi mila. Search change karo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((t) => (
              <TutorialCard key={t.id} tutorial={t} onPlay={() => setActiveTutorial(t)} />
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="mt-12 rounded-2xl border border-zinc-800 bg-gradient-to-br from-amber-500/5 to-zinc-900/50 p-6 md:p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 justify-between">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <MessageSquare className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <div className="font-semibold text-lg text-zinc-100 mb-1">Kuch samajh nahi aaya?</div>
                <p className="text-sm text-zinc-400">Zara AI assistant 24×7 available hai — ya live support se baat karo.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/support">
                <Button variant="outline" size="sm">Contact Support</Button>
              </Link>
              <Link href="/help">
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black">Help Center</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Tutorial player modal */}
      <AnimatePresence>
        {activeTutorial && (
          <TutorialPlayer tutorial={activeTutorial} onClose={() => setActiveTutorial(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
