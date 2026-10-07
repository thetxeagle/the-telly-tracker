import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  CheckIcon,
  CopyIcon,
  LockKeyholeIcon,
  MailCheckIcon,
  MailIcon,
  SendIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"

import { SmtpSettingsFields } from "@/components/smtp-settings-fields"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, ApiError } from "@/lib/api"
import { smtpSettingsFromForm } from "@/lib/smtp-settings"
import type { AdminOverview, RegistrationMode } from "@/lib/types"

const registrationModes: Array<{ mode: RegistrationMode; label: string; detail: string }> = [
  { mode: "OPEN", label: "Open", detail: "Anyone can create an account." },
  { mode: "INVITE_ONLY", label: "Invite only", detail: "A valid invitation link is required." },
  { mode: "CLOSED", label: "Closed", detail: "All new account creation is blocked." },
]

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function AdminPortal() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingMode, setSavingMode] = useState(false)
  const [submittingInvite, setSubmittingInvite] = useState(false)
  const [error, setError] = useState("")
  const [inviteUrl, setInviteUrl] = useState("")
  const [inviteDeliveryMessage, setInviteDeliveryMessage] = useState("")
  const [copied, setCopied] = useState(false)
  const [smtpEnabled, setSmtpEnabled] = useState(false)
  const [sendInviteEmail, setSendInviteEmail] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [smtpMessage, setSmtpMessage] = useState("")

  useEffect(() => {
    let active = true
    api<AdminOverview>("/api/admin/overview")
      .then((result) => {
        if (active) {
          setOverview(result)
          setSmtpEnabled(result.smtp.enabled)
          setSendInviteEmail(result.smtp.enabled)
        }
      })
      .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Could not load administration controls") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const activeInvitations = useMemo(
    () => overview?.invitations.filter((invitation) => !invitation.usedAt && new Date(invitation.expiresAt) > new Date()).length ?? 0,
    [overview]
  )
  const securedUsers = overview?.users.filter((user) => user.totpEnabledAt).length ?? 0

  async function updateRegistrationMode(mode: RegistrationMode) {
    if (!overview || overview.registrationMode === mode) return
    setSavingMode(true)
    setError("")
    try {
      const result = await api<{ registrationMode: RegistrationMode }>("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ mode }) })
      setOverview({ ...overview, registrationMode: result.registrationMode })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update registration access")
    } finally {
      setSavingMode(false)
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!overview) return
    const formElement = event.currentTarget
    setSubmittingInvite(true)
    setError("")
    setInviteUrl("")
    setInviteDeliveryMessage("")
    setCopied(false)
    const form = new FormData(formElement)
    try {
      const result = await api<{ invitation: AdminOverview["invitations"][number]; token: string; emailDelivery: "NOT_REQUESTED" | "SENT" | "FAILED" }>("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({ email: String(form.get("email") ?? ""), expiresInDays: Number(form.get("expiresInDays") ?? 7), sendEmail: sendInviteEmail }),
      })
      const url = new URL(window.location.origin)
      url.searchParams.set("invite", result.token)
      setInviteUrl(url.toString())
      setInviteDeliveryMessage(result.emailDelivery === "SENT" ? "Invitation email sent." : result.emailDelivery === "FAILED" ? "Email delivery failed. Copy the link instead." : "")
      setOverview({ ...overview, invitations: [result.invitation, ...overview.invitations.filter((item) => item.email !== result.invitation.email)] })
      formElement.reset()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create invitation")
    } finally {
      setSubmittingInvite(false)
    }
  }

  async function saveSmtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!overview || overview.smtp.source === "environment") return
    setSavingSmtp(true)
    setError("")
    setSmtpMessage("")
    try {
      const result = await api<{ smtp: AdminOverview["smtp"] }>("/api/admin/smtp", { method: "PUT", body: JSON.stringify(smtpSettingsFromForm(new FormData(event.currentTarget), smtpEnabled, "adminSmtp")) })
      setOverview({ ...overview, smtp: result.smtp })
      setSendInviteEmail(result.smtp.enabled)
      setSmtpMessage("SMTP settings saved.")
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save SMTP settings")
    } finally {
      setSavingSmtp(false)
    }
  }

  async function testSmtp() {
    setTestingSmtp(true)
    setError("")
    setSmtpMessage("")
    try {
      const result = await api<{ sent: boolean; recipient: string }>("/api/admin/smtp/test", { method: "POST" })
      setSmtpMessage(`Test email sent to ${result.recipient}.`)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "SMTP test failed")
    } finally {
      setTestingSmtp(false)
    }
  }

  async function copyInvitation() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
  }

  async function revokeInvitation(invitationId: string) {
    if (!overview) return
    setError("")
    try {
      await api(`/api/admin/invitations/${invitationId}`, { method: "DELETE" })
      setOverview({ ...overview, invitations: overview.invitations.filter((item) => item.id !== invitationId) })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not revoke invitation")
    }
  }

  async function resetUserTotp(userId: string) {
    if (!overview) return false
    setError("")
    try {
      await api(`/api/admin/users/${userId}/totp`, { method: "DELETE" })
      setOverview({ ...overview, users: overview.users.map((user) => user.id === userId ? { ...user, totpEnabledAt: null } : user) })
      return true
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reset two-factor authentication")
      return false
    }
  }

  if (loading) return <p className="empty-copy">Loading administration controls…</p>
  if (!overview) return <p className="provider-message" role="alert">{error || "Administration controls are unavailable."}</p>

  const registration = registrationModes.find((item) => item.mode === overview.registrationMode)!

  return (
    <section aria-labelledby="admin-heading" className="admin-portal">
      <header className="view-heading admin-heading">
        <div className="admin-heading-icon"><ShieldCheckIcon aria-hidden="true" /></div>
        <div><h1 id="admin-heading">Administration</h1><p>Control account access, invitations, and membership.</p></div>
      </header>

      {error ? <Alert variant="destructive" className="admin-alert"><AlertTitle>Admin action failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

      <div className="admin-summary" aria-label="Administration summary">
        <AdminSummaryItem icon={UsersIcon} value={String(overview.users.length)} label={overview.users.length === 1 ? "Registered user" : "Registered users"} detail="Total accounts with access" />
        <AdminSummaryItem icon={MailIcon} value={String(activeInvitations)} label={activeInvitations === 1 ? "Active invitation" : "Active invitations"} detail="Pending and not expired" />
        <AdminSummaryItem icon={LockKeyholeIcon} label={registration.label} detail="Registration access" />
        <AdminSummaryItem icon={MailCheckIcon} label={overview.smtp.enabled ? "SMTP active" : "SMTP inactive"} detail={overview.smtp.source === "environment" ? "Managed by environment" : "Managed in Telly Tracker"} active={overview.smtp.enabled} />
      </div>

      <Tabs defaultValue="access" className="admin-tabs">
        <TabsList variant="line" aria-label="Administration sections">
          <TabsTrigger value="access"><LockKeyholeIcon data-icon="inline-start" />Access</TabsTrigger>
          <TabsTrigger value="email"><MailIcon data-icon="inline-start" />Email</TabsTrigger>
          <TabsTrigger value="users"><UsersIcon data-icon="inline-start" />Users</TabsTrigger>
        </TabsList>

        <TabsContent value="access">
          <Card className="admin-workspace">
            <CardContent>
              <div className="admin-policy-grid">
                <div>
                  <h2>Registration access</h2>
                  <p>Choose who may create a new account. Changes apply immediately.</p>
                  <ToggleGroup value={[overview.registrationMode]} onValueChange={(values) => { const mode = values[0] as RegistrationMode | undefined; if (mode) void updateRegistrationMode(mode) }} variant="outline" spacing={0} disabled={savingMode} aria-label="Registration access mode">
                    {registrationModes.map((item) => <ToggleGroupItem key={item.mode} value={item.mode}>{item.label}</ToggleGroupItem>)}
                  </ToggleGroup>
                  <p className="registration-detail">{registration.detail}</p>
                </div>
                <div className="security-posture"><ShieldCheckIcon aria-hidden="true" /><div><span>Security posture</span><strong>{securedUsers} / {overview.users.length}</strong><p>{overview.users.length === 1 ? "user has" : "users have"} 2FA enabled</p></div></div>
              </div>

              <Separator />

              <section className="admin-section" aria-labelledby="create-invitation-heading">
                <div className="admin-section-heading"><h2 id="create-invitation-heading">Create an invitation</h2><p>The link works once and only for the email address entered here.</p></div>
                <form onSubmit={createInvitation}>
                  <FieldGroup className="invite-form !grid">
                    <Field><FieldLabel htmlFor="invite-email">Email</FieldLabel><Input id="invite-email" name="email" type="email" autoComplete="off" placeholder="viewer@example.com" required /></Field>
                    <Field><FieldLabel htmlFor="invite-days">Expires after</FieldLabel><Input id="invite-days" name="expiresInDays" type="number" min="1" max="30" defaultValue="7" required /><FieldDescription>1–30 days</FieldDescription></Field>
                    <Field orientation="horizontal" data-disabled={!overview.smtp.enabled}><FieldContent><FieldLabel htmlFor="send-invite-email">Send email</FieldLabel><FieldDescription>{overview.smtp.enabled ? "Deliver through configured SMTP." : "Configure SMTP first."}</FieldDescription></FieldContent><Switch id="send-invite-email" checked={sendInviteEmail} onCheckedChange={setSendInviteEmail} disabled={!overview.smtp.enabled} /></Field>
                    <Button type="submit" disabled={submittingInvite}><UserPlusIcon data-icon="inline-start" />{submittingInvite ? "Creating…" : "Create invite"}</Button>
                  </FieldGroup>
                </form>
              </section>

              {inviteUrl ? <Alert className="invite-result"><CheckIcon /><AlertTitle>Invitation ready</AlertTitle><AlertDescription><code>{inviteUrl}</code><p>{inviteDeliveryMessage || "Copy it now."} The raw token cannot be shown again.</p></AlertDescription><AlertAction><Button size="sm" variant="outline" onClick={copyInvitation}>{copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}{copied ? "Copied" : "Copy"}</Button></AlertAction></Alert> : null}

              <Separator />

              <AdminTableSection title="Recent invitations" detail="Invitation activity and active links.">
                <Table>
                  <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Expires</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {overview.invitations.map((invitation) => { const expired = new Date(invitation.expiresAt) <= new Date(); const active = !invitation.usedAt && !expired; return <TableRow key={invitation.id}><TableCell>{invitation.email}</TableCell><TableCell><Badge variant={active ? "default" : "secondary"}>{invitation.usedAt ? "Used" : expired ? "Expired" : "Active"}</Badge></TableCell><TableCell>{formatDate(invitation.expiresAt)}</TableCell><TableCell className="text-right">{active ? <Button variant="ghost" size="icon" aria-label={`Revoke invitation for ${invitation.email}`} onClick={() => revokeInvitation(invitation.id)}><Trash2Icon /></Button> : null}</TableCell></TableRow> })}
                    {overview.invitations.length === 0 ? <TableRow><TableCell colSpan={4} className="admin-empty-cell">No invitations yet.</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </AdminTableSection>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card className="admin-workspace">
            <CardHeader><CardTitle>Email delivery</CardTitle><CardDescription>Configure invitation email delivery. Stored passwords are encrypted before they reach PostgreSQL.</CardDescription></CardHeader>
            <CardContent>
              {overview.smtp.source === "environment" ? <Alert className="smtp-managed-alert"><LockKeyholeIcon /><AlertTitle>Managed by environment variables</AlertTitle><AlertDescription>Change SMTP values in your Compose or deployment environment, then recreate the application container. The values below are read-only.</AlertDescription></Alert> : null}
              {overview.smtp.source === "environment" ? <SmtpEnvironmentSummary smtp={overview.smtp} /> : <form onSubmit={saveSmtp}><SmtpSettingsFields defaults={overview.smtp} enabled={smtpEnabled} onEnabledChange={setSmtpEnabled} idPrefix="adminSmtp" /><div className="smtp-actions"><Button type="button" variant="outline" disabled={testingSmtp || !overview.smtp.enabled} onClick={testSmtp}><SendIcon data-icon="inline-start" />{testingSmtp ? "Testing…" : "Send test"}</Button><Button type="submit" disabled={savingSmtp}><MailCheckIcon data-icon="inline-start" />{savingSmtp ? "Saving…" : "Save email settings"}</Button></div></form>}
              {overview.smtp.source === "environment" ? <div className="smtp-actions"><Button type="button" variant="outline" disabled={testingSmtp || !overview.smtp.enabled} onClick={testSmtp}><SendIcon data-icon="inline-start" />{testingSmtp ? "Testing…" : "Send test"}</Button></div> : null}
              {smtpMessage ? <p className="provider-message" role="status">{smtpMessage}</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card className="admin-workspace">
            <CardHeader><CardTitle>Users</CardTitle><CardDescription>{overview.users.length} registered {overview.users.length === 1 ? "account" : "accounts"}. Administrators can reset another user’s 2FA when recovery codes are unavailable.</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Two-factor</TableHead><TableHead>Joined</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
                <TableBody>{overview.users.map((user) => <TableRow key={user.id}><TableCell><strong>{user.name}</strong><span className="admin-user-email">{user.email}</span></TableCell><TableCell><Badge variant={user.isAdmin ? "default" : "outline"}>{user.isAdmin ? "Admin" : "Member"}</Badge></TableCell><TableCell><Badge variant={user.totpEnabledAt ? "secondary" : "outline"}>{user.totpEnabledAt ? "Enabled" : "Off"}</Badge></TableCell><TableCell>{formatDate(user.createdAt)}</TableCell><TableCell className="text-right">{user.totpEnabledAt && user.id !== overview.currentUserId ? <ResetTotpButton userName={user.name} onReset={() => resetUserTotp(user.id)} /> : null}</TableCell></TableRow>)}</TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  )
}

function AdminSummaryItem({ icon: Icon, value, label, detail, active }: { icon: typeof UsersIcon; value?: string; label: string; detail: string; active?: boolean }) {
  return <div className="admin-summary-item"><Icon aria-hidden="true" /><div className="admin-summary-copy">{value ? <strong>{value}</strong> : null}<span>{label}{active ? <i aria-label="active" /> : null}</span><small>{detail}</small></div></div>
}

function AdminTableSection({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <section className="admin-section admin-table-section"><div className="admin-section-heading"><h2>{title}</h2><p>{detail}</p></div>{children}</section>
}

function SmtpEnvironmentSummary({ smtp }: { smtp: AdminOverview["smtp"] }) {
  return <dl className="smtp-environment-summary"><div><dt>Status</dt><dd>{smtp.enabled ? "Enabled" : "Disabled"}</dd></div><div><dt>Server</dt><dd>{smtp.host ? `${smtp.host}:${smtp.port}` : "Not configured"}</dd></div><div><dt>Security</dt><dd>{smtp.secure ? "Implicit TLS" : "STARTTLS / relay policy"}</dd></div><div><dt>Sender</dt><dd>{smtp.fromEmail || "Not configured"}</dd></div><div><dt>Username</dt><dd>{smtp.username || "No authentication"}</dd></div><div><dt>Password</dt><dd>{smtp.hasPassword ? "Configured" : "Not configured"}</dd></div></dl>
}

function ResetTotpButton({ userName, onReset }: { userName: string; onReset: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  async function reset() {
    setResetting(true)
    try { if (await onReset()) setOpen(false) } finally { setResetting(false) }
  }
  return <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger render={<Button variant="outline" size="sm" />}><ShieldOffIcon data-icon="inline-start" />Reset 2FA</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset {userName}’s two-factor authentication?</AlertDialogTitle><AlertDialogDescription>Their authenticator secret and all recovery codes will be removed. They can sign in with only their password until they set it up again.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={resetting} onClick={reset}>{resetting ? "Resetting…" : "Reset 2FA"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
}
