import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../data/cloud.ts";
import { Button, Field, Icon, Region, TextInput, Wordmark } from "../ui/kit.tsx";

export function SignIn({ onDevice }: { onDevice: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage("That email and password did not sign in. Check both and try again.");
  };

  const reset = async () => {
    if (!email.trim()) return setMessage("Enter the account email first, then ask for the reset link.");
    setBusy(true);
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.href.split("#")[0] });
    setBusy(false);
    setMessage(error ? "The reset email could not be sent. Try again in a minute." : "If that account exists, a reset link is on its way.");
  };

  return (
    <div className="signin" data-view="sign-in">
      <div className="signin-card">
        <div className="stack loose">
          <Wordmark />
          <div className="stack tight">
            <h1 className="page-title">Proposal war room</h1>
            <p className="muted">Plan the review schedule back from the due date, track owners and page budgets, and keep the compliance matrix in one place.</p>
          </div>
        </div>
        <Region name="sign-in" className="panel">
          <form className="stack loose" onSubmit={submit}>
            <h2 className="panel-title">Sign in</h2>
            <Field label="Email">{id => <TextInput id={id} type="email" autoComplete="username" required value={email} onValue={setEmail} />}</Field>
            <Field label="Password">{id => <TextInput id={id} type="password" autoComplete="current-password" required value={password} onValue={setPassword} />}</Field>
            {message ? <p role="status" className="caption" data-signin-message>{message}</p> : null}
            <div className="row">
              <Button variant="primary" type="submit" disabled={busy}>Sign in</Button>
              <Button variant="quiet" onClick={reset} disabled={busy}>Send reset link</Button>
            </div>
            <p className="caption">Accounts are issued by the owner of this workspace. Signed-in pursuits save to the account and can use Claude for the Section L and M parser.</p>
          </form>
        </Region>
        <Region name="device-mode" className="panel">
          <h2 className="panel-title" style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name="user" size={16} /><span>Work on this device</span></h2>
          <p className="muted">No account. Pursuits stay in this browser only, and the two Claude features are off. Export a pursuit file to back it up or move it.</p>
          <div className="row"><Button onClick={onDevice}>Continue on this device</Button></div>
        </Region>
      </div>
    </div>
  );
}
