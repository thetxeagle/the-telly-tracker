import { useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import { api, ApiError } from "@/lib/api"
import type { RegistrationMode } from "@/lib/types"

type AuthScreenProps = { onAuthenticated: () => Promise<void> }

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const inviteToken = new URLSearchParams(window.location.search).get("invite")
  const [registering, setRegistering] = useState(Boolean(inviteToken))
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [challengeToken, setChallengeToken] = useState("")
  const [factorCode, setFactorCode] = useState("")
  const [useRecoveryCode, setUseRecoveryCode] = useState(false)
  const canRegister = registrationMode === "OPEN" || (registrationMode === "INVITE_ONLY" && Boolean(inviteToken))

  useEffect(() => {
    api<{ mode: RegistrationMode }>("/api/registration")
      .then(({ mode }) => {
        setRegistrationMode(mode)
        if (mode === "CLOSED" || (mode === "INVITE_ONLY" && !inviteToken)) setRegistering(false)
      })
      .catch(() => setRegistrationMode("CLOSED"))
  }, [inviteToken])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    const form = new FormData(event.currentTarget)
    const body = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      ...(registering && inviteToken ? { inviteToken } : {}),
    }
    try {
      if (!registering) {
        const result = await api<
          | { requiresTwoFactor: true; challengeToken: string; expiresAt: string }
          | { requiresTwoFactor: false; user: unknown }
        >("/api/auth/login", { method: "POST", body: JSON.stringify(body) })
        if (result.requiresTwoFactor) {
          setChallengeToken(result.challengeToken)
          setFactorCode("")
          return
        }
      } else {
        await api("/api/auth/register", { method: "POST", body: JSON.stringify(body) })
      }
      if (registering && inviteToken) window.history.replaceState(null, "", window.location.pathname)
      await onAuthenticated()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not sign in")
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      await api("/api/auth/login/totp", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code: factorCode }),
      })
      await onAuthenticated()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not verify that code")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <a className="brand brand-large" href="/" aria-label="Telly Tracker home">
          <img className="brand-logo" src="/telly-tracker-logo.svg" alt="" />
        </a>
        <h1>Every story.<br />Exactly where you left it.</h1>
        <p>Track the shows and films behind you, in front of you, and still over the horizon.</p>
      </section>

      <Card className="auth-card">
        <CardHeader>
          <a className="auth-mobile-brand" href="/" aria-label="Telly Tracker home">
            <img src="/telly-tracker-logo.svg" alt="" />
          </a>
          <CardTitle>{challengeToken ? "Verify it’s you" : registering ? inviteToken ? "Accept your invitation" : "Create your account" : "Welcome back"}</CardTitle>
          <CardDescription>{challengeToken ? "Enter the current code from your authenticator, or use one recovery code." : registering ? inviteToken ? "Create the account linked to this private invitation." : "Build a private release tracker for your shows and movies." : "Sign in to review releases and update watched episodes."}</CardDescription>
        </CardHeader>
        {challengeToken ? <form onSubmit={verifyFactor}>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="factor-code">{useRecoveryCode ? "Recovery code" : "Authenticator code"}</FieldLabel>
                {useRecoveryCode ? (
                  <Input id="factor-code" value={factorCode} onChange={(event) => setFactorCode(event.target.value)} autoComplete="one-time-code" placeholder="XXXX-XXXX-XXXX" required />
                ) : (
                  <InputOTP id="factor-code" value={factorCode} onChange={setFactorCode} maxLength={6} inputMode="numeric" autoComplete="one-time-code" required>
                    <InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} /></InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup><InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} /></InputOTPGroup>
                  </InputOTP>
                )}
              </Field>
              <Field data-invalid={Boolean(error)}><FieldError>{error}</FieldError></Field>
              <Button type="submit" size="lg" disabled={submitting || factorCode.length < 6}>{submitting ? "Verifying…" : "Verify and sign in"}</Button>
            </FieldGroup>
          </CardContent>
        </form> : <form onSubmit={handleSubmit}>
          <CardContent>
            <FieldGroup>
              {registering ? <Field><FieldLabel htmlFor="name">Name</FieldLabel><Input id="name" name="name" autoComplete="name" required minLength={2} /></Field> : null}
              <Field><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} required minLength={8} />
                {registering ? <FieldDescription>Use at least 8 characters.</FieldDescription> : null}
              </Field>
              <Field data-invalid={Boolean(error)}><FieldError>{error}</FieldError></Field>
              <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Opening your library…" : registering ? "Create account" : "Sign in"}</Button>
            </FieldGroup>
          </CardContent>
        </form>}
        <CardFooter>
          {challengeToken ? <>
            <Button type="button" variant="link" onClick={() => { setUseRecoveryCode((current) => !current); setFactorCode(""); setError("") }}>{useRecoveryCode ? "Use authenticator code" : "Use a recovery code"}</Button>
            <Button type="button" variant="link" onClick={() => { setChallengeToken(""); setFactorCode(""); setError("") }}>Back to sign in</Button>
          </> : registering ? <><span>Already tracking?</span><Button type="button" variant="link" onClick={() => { setRegistering(false); setError("") }}>Sign in</Button></> : canRegister ? <><span>New to Telly Tracker?</span><Button type="button" variant="link" onClick={() => { setRegistering(true); setError("") }}>{inviteToken ? "Accept invitation" : "Create an account"}</Button></> : <span>{registrationMode === null ? "Checking registration access…" : registrationMode === "INVITE_ONLY" ? "Registration is invite-only." : "Registration is closed."}</span>}
        </CardFooter>
      </Card>
    </main>
  )
}
