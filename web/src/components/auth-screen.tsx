import { useEffect, useState, type FormEvent } from "react"
import { CheckCircle2Icon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import { api, ApiError } from "@/lib/api"
import type { RegistrationMode } from "@/lib/types"

type AuthScreenProps = { onAuthenticated: () => Promise<void> }

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const query = new URLSearchParams(window.location.search)
  const inviteToken = query.get("invite")
  const [resetToken, setResetToken] = useState(query.get("reset") ?? "")
  const [registering, setRegistering] = useState(Boolean(inviteToken) && !resetToken)
  const [requestingReset, setRequestingReset] = useState(false)
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
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

  function showSignIn(message = "") {
    const url = new URL(window.location.href)
    url.searchParams.delete("reset")
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
    setResetToken("")
    setRequestingReset(false)
    setRegistering(false)
    setChallengeToken("")
    setFactorCode("")
    setError("")
    setNotice(message)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    setNotice("")
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

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    setNotice("")
    const form = new FormData(event.currentTarget)
    try {
      const result = await api<{ message: string }>("/api/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email: String(form.get("email") ?? "") }),
      })
      setNotice(result.message)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not request a password reset")
    } finally {
      setSubmitting(false)
    }
  }

  async function completePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const newPassword = String(form.get("newPassword") ?? "")
    const confirmation = String(form.get("confirmation") ?? "")
    setError("")
    if (newPassword !== confirmation) {
      setError("New password and confirmation do not match")
      return
    }
    setSubmitting(true)
    try {
      await api("/api/auth/password-reset", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, newPassword }),
      })
      showSignIn("Your password has been changed. Sign in with the new password.")
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reset the password")
    } finally {
      setSubmitting(false)
    }
  }

  const title = challengeToken
    ? "Verify it’s you"
    : resetToken
      ? "Choose a new password"
      : requestingReset
        ? "Reset your password"
        : registering
          ? inviteToken ? "Accept your invitation" : "Create your account"
          : "Welcome back"
  const description = challengeToken
    ? "Enter the current code from your authenticator, or use one recovery code."
    : resetToken
      ? "This link works once and expires one hour after it was requested."
      : requestingReset
        ? "Enter your account email. If delivery is available, we’ll send a private reset link."
        : registering
          ? inviteToken ? "Create the account linked to this private invitation." : "Build a private release tracker for your shows and movies."
          : "Sign in to review releases and update watched episodes."

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
          <a className="auth-mobile-brand" href="/" aria-label="Telly Tracker home"><img src="/telly-tracker-logo.svg" alt="" /></a>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {challengeToken ? <form onSubmit={verifyFactor}>
          <CardContent><FieldGroup>
            <Field>
              <FieldLabel htmlFor="factor-code">{useRecoveryCode ? "Recovery code" : "Authenticator code"}</FieldLabel>
              {useRecoveryCode ? <Input id="factor-code" value={factorCode} onChange={(event) => setFactorCode(event.target.value)} autoComplete="one-time-code" placeholder="XXXX-XXXX-XXXX" required /> : <InputOTP id="factor-code" value={factorCode} onChange={setFactorCode} maxLength={6} inputMode="numeric" autoComplete="one-time-code" required><InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} /></InputOTPGroup><InputOTPSeparator /><InputOTPGroup><InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} /></InputOTPGroup></InputOTP>}
            </Field>
            <Field data-invalid={Boolean(error)}><FieldError>{error}</FieldError></Field>
            <Button type="submit" size="lg" disabled={submitting || factorCode.length < 6}>{submitting ? "Verifying…" : "Verify and sign in"}</Button>
          </FieldGroup></CardContent>
        </form> : resetToken ? <form onSubmit={completePasswordReset}>
          <input type="text" name="username" autoComplete="username" value="" readOnly className="sr-only" tabIndex={-1} aria-hidden="true" />
          <CardContent><FieldGroup>
            <Field><FieldLabel htmlFor="reset-password">New password</FieldLabel><Input id="reset-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /><FieldDescription>Use between 8 and 72 characters.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="reset-confirmation">Confirm new password</FieldLabel><Input id="reset-confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></Field>
            <Field data-invalid={Boolean(error)}><FieldError>{error}</FieldError></Field>
            <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Changing password…" : "Change password"}</Button>
          </FieldGroup></CardContent>
        </form> : requestingReset ? <form onSubmit={requestPasswordReset}>
          <CardContent><FieldGroup>
            <Field><FieldLabel htmlFor="reset-email">Email</FieldLabel><Input id="reset-email" name="email" type="email" autoComplete="email" required /></Field>
            {notice ? <Alert><CheckCircle2Icon /><AlertTitle>Check your email</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
            <Field data-invalid={Boolean(error)}><FieldError>{error}</FieldError></Field>
            <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Requesting link…" : "Send reset link"}</Button>
          </FieldGroup></CardContent>
        </form> : <form onSubmit={handleSubmit}>
          <CardContent>
            {notice ? <Alert className="auth-notice"><CheckCircle2Icon /><AlertTitle>Password changed</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
            <FieldGroup>
              {registering ? <Field><FieldLabel htmlFor="name">Name</FieldLabel><Input id="name" name="name" autoComplete="name" required minLength={2} /></Field> : null}
              <Field><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
              <Field><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} required minLength={8} maxLength={72} />{registering ? <FieldDescription>Use between 8 and 72 characters.</FieldDescription> : <Button className="auth-forgot-link" type="button" variant="link" onClick={() => { setRequestingReset(true); setError(""); setNotice("") }}>Forgot password?</Button>}</Field>
              <Field data-invalid={Boolean(error)}><FieldError>{error}</FieldError></Field>
              <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Opening your library…" : registering ? "Create account" : "Sign in"}</Button>
            </FieldGroup>
          </CardContent>
        </form>}
        <CardFooter>
          {challengeToken ? <><Button type="button" variant="link" onClick={() => { setUseRecoveryCode((current) => !current); setFactorCode(""); setError("") }}>{useRecoveryCode ? "Use authenticator code" : "Use a recovery code"}</Button><Button type="button" variant="link" onClick={() => { setChallengeToken(""); setFactorCode(""); setError("") }}>Back to sign in</Button></> : resetToken || requestingReset ? <Button type="button" variant="link" onClick={() => showSignIn()}>Back to sign in</Button> : registering ? <><span>Already tracking?</span><Button type="button" variant="link" onClick={() => { setRegistering(false); setError(""); setNotice("") }}>Sign in</Button></> : canRegister ? <><span>New to Telly Tracker?</span><Button type="button" variant="link" onClick={() => { setRegistering(true); setError(""); setNotice("") }}>{inviteToken ? "Accept invitation" : "Create an account"}</Button></> : <span>{registrationMode === null ? "Checking registration access…" : registrationMode === "INVITE_ONLY" ? "Registration is invite-only." : "Registration is closed."}</span>}
        </CardFooter>
      </Card>
    </main>
  )
}
