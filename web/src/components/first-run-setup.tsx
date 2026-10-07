import { useState, type FormEvent } from "react"
import { CheckIcon, MailIcon, ShieldCheckIcon } from "lucide-react"

import { SmtpSettingsFields } from "@/components/smtp-settings-fields"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, ApiError } from "@/lib/api"
import { smtpSettingsFromForm } from "@/lib/smtp-settings"
import type { RegistrationMode, SetupStatus } from "@/lib/types"

type FirstRunSetupProps = { requiresOwner: boolean; smtp: SetupStatus["smtp"]; onComplete: () => Promise<void> }

export function FirstRunSetup({ requiresOwner, smtp, onComplete }: FirstRunSetupProps) {
  const [ownerCreated, setOwnerCreated] = useState(!requiresOwner)
  const [mode, setMode] = useState<RegistrationMode>("INVITE_ONLY")
  const [smtpEnabled, setSmtpEnabled] = useState(smtp.enabled)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function createOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    const form = new FormData(event.currentTarget)
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }),
      })
      setOwnerCreated(true)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create the owner account")
    } finally {
      setSubmitting(false)
    }
  }

  async function completeSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError("")
    const form = new FormData(event.currentTarget)
    try {
      await api("/api/admin/setup", {
        method: "POST",
        body: JSON.stringify({
          mode,
          ...(smtp.source === "database" ? { smtp: smtpSettingsFromForm(form, smtpEnabled, "setupSmtp") } : {}),
        }),
      })
      await onComplete()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not finish setup")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="setup-shell">
      <section className="setup-intro">
        <a className="brand brand-large" href="/" aria-label="Telly Tracker home"><img className="brand-logo" src="/telly-tracker-logo.svg" alt="" /></a>
        <p className="setup-step">{ownerCreated ? "Step 2 of 2" : "Step 1 of 2"}</p>
        <h1>{ownerCreated ? "Set the rules." : "Claim your tracker."}</h1>
        <p>{ownerCreated ? "Choose how people join and optionally connect your mail server." : "The first account becomes the owner and administrator of this installation."}</p>
        <div className="setup-points">
          <p><ShieldCheckIcon />The owner controls registration and invitations.</p>
          <p><MailIcon />SMTP credentials are encrypted before storage.</p>
        </div>
      </section>

      <Card className="setup-card">
        <CardHeader>
          <CardTitle>{ownerCreated ? "Finish installation" : "Create owner account"}</CardTitle>
          <CardDescription>{ownerCreated ? "You can change these settings later in Administration." : "Use your real email—it becomes the first administrator account."}</CardDescription>
        </CardHeader>
        {!ownerCreated ? (
          <form onSubmit={createOwner}>
            <CardContent>
              <FieldGroup>
                <Field><FieldLabel htmlFor="setup-name">Name</FieldLabel><Input id="setup-name" name="name" autoComplete="name" minLength={2} required /></Field>
                <Field><FieldLabel htmlFor="setup-email">Email</FieldLabel><Input id="setup-email" name="email" type="email" autoComplete="email" required /></Field>
                <Field><FieldLabel htmlFor="setup-password">Password</FieldLabel><Input id="setup-password" name="password" type="password" autoComplete="new-password" minLength={8} required /><FieldDescription>Use at least 8 characters.</FieldDescription></Field>
                <Field data-invalid={Boolean(error)}><FieldError>{error}</FieldError></Field>
                <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Creating owner…" : "Continue"}</Button>
              </FieldGroup>
            </CardContent>
          </form>
        ) : (
          <form onSubmit={completeSetup}>
            <CardContent className="setup-config-content">
              <FieldGroup>
                <Field>
                  <FieldLabel>New account access</FieldLabel>
                  <ToggleGroup value={[mode]} onValueChange={(values) => { const next = values[0] as RegistrationMode | undefined; if (next) setMode(next) }} variant="outline" spacing={0} className="registration-toggle" aria-label="New account access">
                    <ToggleGroupItem value="OPEN">Open</ToggleGroupItem><ToggleGroupItem value="INVITE_ONLY">Invite only</ToggleGroupItem><ToggleGroupItem value="CLOSED">Closed</ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>Invite only is the safest default for a private tracker.</FieldDescription>
                </Field>
                {smtp.source === "environment" ? (
                  <Alert>
                    <MailIcon />
                    <AlertTitle>Email is managed by the deployment</AlertTitle>
                    <AlertDescription>{smtp.enabled ? "SMTP is enabled through environment variables." : "SMTP is disabled through environment variables."}</AlertDescription>
                  </Alert>
                ) : <SmtpSettingsFields enabled={smtpEnabled} onEnabledChange={setSmtpEnabled} idPrefix="setupSmtp" />}
                {error ? <Alert variant="destructive"><AlertTitle>Setup failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
                <Button type="submit" size="lg" disabled={submitting}><CheckIcon data-icon="inline-start" />{submitting ? "Saving setup…" : "Finish setup"}</Button>
              </FieldGroup>
            </CardContent>
          </form>
        )}
      </Card>
    </main>
  )
}
