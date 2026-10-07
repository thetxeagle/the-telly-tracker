import { useCallback, useEffect, useState, type FormEvent } from "react"
import { CalendarDaysIcon, CheckIcon, CopyIcon, KeyRoundIcon, LinkIcon, RefreshCwIcon, ShieldCheckIcon, ShieldOffIcon, SmartphoneIcon, UnlinkIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import { api, ApiError } from "@/lib/api"
import type { AccountSecurityStatus, TotpEnrollment } from "@/lib/types"

type ProtectedAction = "recovery" | "disable" | null
type CalendarAction = "regenerate" | "disable" | null

export function AccountSecurity() {
  const [status, setStatus] = useState<AccountSecurityStatus | null>(null)
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [confirmationCode, setConfirmationCode] = useState("")
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [protectedAction, setProtectedAction] = useState<ProtectedAction>(null)
  const [calendarAction, setCalendarAction] = useState<CalendarAction>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [copied, setCopied] = useState(false)
  const [calendarCopied, setCalendarCopied] = useState(false)

  const loadStatus = useCallback(async () => {
    setStatus(await api<AccountSecurityStatus>("/api/account/security"))
  }, [])

  useEffect(() => {
    let active = true
    api<AccountSecurityStatus>("/api/account/security")
      .then((result) => { if (active) setStatus(result) })
      .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Could not load account security") })
    return () => { active = false }
  }, [])

  async function startEnrollment() {
    setSubmitting(true)
    setError("")
    setMessage("")
    try {
      setEnrollment(await api<TotpEnrollment>("/api/account/totp/enrollment", { method: "POST" }))
      setConfirmationCode("")
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not start two-factor setup")
    } finally {
      setSubmitting(false)
    }
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const result = await api<{ recoveryCodes: string[] }>("/api/account/totp/confirm", {
        method: "POST",
        body: JSON.stringify({ code: confirmationCode }),
      })
      setRecoveryCodes(result.recoveryCodes)
      setCopied(false)
      setEnrollment(null)
      setConfirmationCode("")
      await loadStatus()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not enable two-factor authentication")
    } finally {
      setSubmitting(false)
    }
  }

  async function runProtectedAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!protectedAction) return
    setSubmitting(true)
    setError("")
    setMessage("")
    const form = new FormData(event.currentTarget)
    const body = JSON.stringify({ password: form.get("password"), code: form.get("code") })
    try {
      if (protectedAction === "recovery") {
        const result = await api<{ recoveryCodes: string[] }>("/api/account/totp/recovery-codes", { method: "POST", body })
        setRecoveryCodes(result.recoveryCodes)
        setCopied(false)
        setMessage("Your previous recovery codes no longer work.")
      } else {
        await api("/api/account/totp", { method: "DELETE", body })
        setMessage("Two-factor authentication is disabled.")
      }
      setProtectedAction(null)
      await loadStatus()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update two-factor authentication")
    } finally {
      setSubmitting(false)
    }
  }

  async function copyRecoveryCodes() {
    await navigator.clipboard.writeText(recoveryCodes.join("\n"))
    setCopied(true)
  }

  async function generateCalendarFeed() {
    setSubmitting(true)
    setError("")
    setMessage("")
    try {
      const result = await api<Pick<AccountSecurityStatus, "calendarFeed">>("/api/account/calendar", { method: "POST" })
      setStatus((current) => current ? { ...current, calendarFeed: result.calendarFeed } : current)
      setCalendarCopied(false)
      setMessage("Your private internet calendar is ready.")
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create the internet calendar")
    } finally {
      setSubmitting(false)
    }
  }

  async function copyCalendarUrl() {
    if (!status?.calendarFeed.url) return
    try {
      await navigator.clipboard.writeText(status.calendarFeed.url)
      setCalendarCopied(true)
    } catch {
      setError("Could not copy the calendar URL. Select and copy it manually.")
    }
  }

  function subscribeToCalendar() {
    const url = status?.calendarFeed.url
    if (url) window.location.href = url.replace(/^https?:/, "webcal:")
  }

  async function runCalendarAction() {
    if (!calendarAction) return
    setSubmitting(true)
    setError("")
    setMessage("")
    try {
      if (calendarAction === "regenerate") {
        const result = await api<Pick<AccountSecurityStatus, "calendarFeed">>("/api/account/calendar", { method: "POST" })
        setStatus((current) => current ? { ...current, calendarFeed: result.calendarFeed } : current)
        setMessage("The old calendar URL no longer works. Subscribe again with the new URL.")
      } else {
        await api("/api/account/calendar", { method: "DELETE" })
        setStatus((current) => current ? { ...current, calendarFeed: { enabled: false, url: null } } : current)
        setMessage("Internet calendar access is disabled.")
      }
      setCalendarCopied(false)
      setCalendarAction(null)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update the internet calendar")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="account-security-heading" className="account-security">
      <header className="view-heading account-security-heading">
        <div className="admin-heading-icon"><ShieldCheckIcon aria-hidden="true" /></div>
        <div><h1 id="account-security-heading">Account settings</h1><p>Manage sign-in protection and private calendar access.</p></div>
      </header>

      {error ? <Alert variant="destructive"><AlertTitle>Account update failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {message ? <Alert><CheckIcon /><AlertTitle>Account updated</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}

      <Card className="security-card">
        <CardHeader>
          <div className="security-card-title-row">
            <div><CardTitle>Authenticator app</CardTitle><CardDescription>Use any standards-based TOTP app such as 1Password, Aegis, Authy, or Google Authenticator.</CardDescription></div>
            <Badge variant={status?.totpEnabled ? "default" : "outline"}>{status?.totpEnabled ? "Enabled" : "Not enabled"}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!status ? <p className="empty-copy">Loading security settings…</p> : status.totpEnabled ? (
            <div className="security-enabled-grid">
              <div className="security-status-mark"><ShieldCheckIcon aria-hidden="true" /></div>
              <div><h3>Two-factor authentication is active</h3><p>Enabled {status.totpEnabledAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(status.totpEnabledAt)) : "for this account"}.</p></div>
              <div className="security-recovery-count"><strong>{status.recoveryCodesRemaining}</strong><span>recovery codes remaining</span></div>
            </div>
          ) : enrollment ? (
            <form onSubmit={confirmEnrollment} className="totp-enrollment">
              <div className="totp-setup-copy">
                <p className="security-step"><span>1</span> Scan this QR code with your authenticator app.</p>
                <img src={enrollment.qrCodeDataUrl} alt="Telly Tracker authenticator QR code" />
                <p className="manual-secret-label">Can’t scan it? Enter this key manually:</p>
                <code className="manual-secret">{enrollment.secret}</code>
              </div>
              <div className="totp-confirmation">
                <p className="security-step"><span>2</span> Enter the current 6-digit code to verify setup.</p>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="totp-confirmation-code">Authenticator code</FieldLabel>
                    <InputOTP id="totp-confirmation-code" value={confirmationCode} onChange={setConfirmationCode} maxLength={6} inputMode="numeric" autoComplete="one-time-code" required>
                      <InputOTPGroup><InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} /></InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup><InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} /></InputOTPGroup>
                    </InputOTP>
                    <FieldDescription>The setup expires after 10 minutes.</FieldDescription>
                  </Field>
                  <Button type="submit" disabled={submitting || confirmationCode.length !== 6}><SmartphoneIcon data-icon="inline-start" />{submitting ? "Verifying…" : "Verify and enable"}</Button>
                  <Button type="button" variant="ghost" onClick={() => { setEnrollment(null); setError("") }}>Cancel setup</Button>
                </FieldGroup>
              </div>
            </form>
          ) : (
            <div className="security-empty-state">
              <div className="security-status-mark"><KeyRoundIcon aria-hidden="true" /></div>
              <div><h3>Add a second sign-in step</h3><p>Your password stays the first factor. A rotating code from your phone becomes the second.</p></div>
            </div>
          )}
        </CardContent>
        {status && !enrollment ? <CardFooter className="security-actions">
          {status.totpEnabled ? <>
            <Button variant="outline" onClick={() => { setProtectedAction("recovery"); setError("") }}><RefreshCwIcon data-icon="inline-start" />Replace recovery codes</Button>
            <Button variant="destructive" onClick={() => { setProtectedAction("disable"); setError("") }}><ShieldOffIcon data-icon="inline-start" />Disable 2FA</Button>
          </> : <Button onClick={startEnrollment} disabled={submitting}><SmartphoneIcon data-icon="inline-start" />{submitting ? "Preparing…" : "Set up authenticator"}</Button>}
        </CardFooter> : null}
      </Card>

      <Card className="security-card calendar-feed-card">
        <CardHeader>
          <div className="security-card-title-row">
            <div><CardTitle>Internet calendar</CardTitle><CardDescription>Subscribe to future episodes and movie releases from Apple Calendar, Outlook, Thunderbird, or another ICS-compatible calendar.</CardDescription></div>
            <Badge variant={status?.calendarFeed.enabled ? "default" : "outline"}>{status?.calendarFeed.enabled ? "Active" : "Not enabled"}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {!status ? <p className="empty-copy">Loading calendar settings…</p> : status.calendarFeed.enabled && status.calendarFeed.url ? (
            <div className="calendar-feed-panel">
              <div className="security-status-mark"><CalendarDaysIcon aria-hidden="true" /></div>
              <div className="calendar-feed-copy">
                <h3>Your private subscription URL</h3>
                <p>Anyone with this URL can see future release dates from your library. Keep it private.</p>
                <Input aria-label="Internet calendar subscription URL" type="password" value={status.calendarFeed.url} readOnly onFocus={(event) => event.currentTarget.select()} />
              </div>
            </div>
          ) : (
            <div className="security-empty-state">
              <div className="security-status-mark"><CalendarDaysIcon aria-hidden="true" /></div>
              <div><h3>Put release dates on your calendar</h3><p>The feed updates as tracked episode schedules and movie release dates change. It does not include watched history.</p></div>
            </div>
          )}
        </CardContent>
        {status ? <CardFooter className="security-actions calendar-feed-actions">
          {status.calendarFeed.enabled && status.calendarFeed.url ? <>
            <Button onClick={subscribeToCalendar}><LinkIcon data-icon="inline-start" />Subscribe</Button>
            <Button variant="outline" onClick={copyCalendarUrl}>{calendarCopied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}{calendarCopied ? "Copied" : "Copy URL"}</Button>
            <Button variant="outline" onClick={() => setCalendarAction("regenerate")}><RefreshCwIcon data-icon="inline-start" />Regenerate URL</Button>
            <Button variant="destructive" onClick={() => setCalendarAction("disable")}><UnlinkIcon data-icon="inline-start" />Disable</Button>
          </> : <Button onClick={generateCalendarFeed} disabled={submitting}><CalendarDaysIcon data-icon="inline-start" />{submitting ? "Creating…" : "Create calendar feed"}</Button>}
        </CardFooter> : null}
      </Card>

      <Dialog open={Boolean(protectedAction)} onOpenChange={(open) => { if (!open) setProtectedAction(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{protectedAction === "disable" ? "Disable two-factor authentication?" : "Replace recovery codes"}</DialogTitle>
            <DialogDescription>{protectedAction === "disable" ? "Future sign-ins will require only your password. Confirm with both factors first." : "Every existing recovery code will stop working. Confirm with your password and a current code."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={runProtectedAction}>
            <FieldGroup>
              <Field><FieldLabel htmlFor="security-password">Password</FieldLabel><Input id="security-password" name="password" type="password" autoComplete="current-password" minLength={8} required /></Field>
              <Field><FieldLabel htmlFor="security-code">Authenticator or recovery code</FieldLabel><Input id="security-code" name="code" autoComplete="one-time-code" required /><FieldDescription>A recovery code is consumed when used.</FieldDescription></Field>
              <Field data-invalid={Boolean(error)}><FieldError>{error}</FieldError></Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setProtectedAction(null)}>Cancel</Button>
                <Button type="submit" variant={protectedAction === "disable" ? "destructive" : "default"} disabled={submitting}>{submitting ? "Confirming…" : protectedAction === "disable" ? "Disable 2FA" : "Replace codes"}</Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(calendarAction)} onOpenChange={(open) => { if (!open) setCalendarAction(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{calendarAction === "disable" ? "Disable the internet calendar?" : "Regenerate the calendar URL?"}</DialogTitle>
            <DialogDescription>{calendarAction === "disable" ? "The current subscription URL will stop working immediately and calendar clients will no longer receive updates." : "The current URL will stop working immediately. Every calendar using it must subscribe again with the replacement URL."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCalendarAction(null)}>Cancel</Button>
            <Button type="button" variant={calendarAction === "disable" ? "destructive" : "default"} disabled={submitting} onClick={runCalendarAction}>{submitting ? "Updating…" : calendarAction === "disable" ? "Disable calendar" : "Regenerate URL"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recoveryCodes.length > 0} onOpenChange={(open) => { if (!open) setRecoveryCodes([]) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save your recovery codes</DialogTitle>
            <DialogDescription>Each code works once if you lose access to your authenticator. They will not be shown again.</DialogDescription>
          </DialogHeader>
          <div className="recovery-code-grid" aria-label="Recovery codes">
            {recoveryCodes.map((code) => <code key={code}>{code}</code>)}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={copyRecoveryCodes}>{copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}{copied ? "Copied" : "Copy all"}</Button>
            <Button type="button" onClick={() => setRecoveryCodes([])}>I saved them</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
