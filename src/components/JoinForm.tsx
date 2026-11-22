"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Input } from "@/components/ui/primitives";
import { ROOM_CODE_RE } from "@/lib/constants";

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!ROOM_CODE_RE.test(c)) {
      setError("Codes are 6 characters, letters and digits (no 0, O, 1, I or L).");
      return;
    }
    router.push(`/join/${c}`);
  };

  return (
    <form onSubmit={submit} className="mt-5 space-y-2" noValidate>
      <div className="flex gap-2">
        <Input
          aria-label="Room code"
          aria-invalid={!!error}
          aria-describedby={error ? "join-err" : undefined}
          placeholder="ABC234"
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError("");
          }}
          className="font-tech text-center text-lg uppercase tracking-[0.3em]"
        />
        <Button type="submit" variant="secondary" size="md">
          Join
        </Button>
      </div>
      {error && (
        <p id="join-err" role="alert" className="text-xs text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
